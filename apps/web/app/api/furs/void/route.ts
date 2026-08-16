/**
 * RAČUNKO POS — FURS Storno (Kredit Nota)
 *
 * Klicano ob stornu računa. Pošlje kredit noto FURS-u.
 * ZDavPR: storno = nov račun z negativnim zneskom (credit_note tip).
 *
 * Input:  { order_id, total, original_eor, reason }
 * Output: { success, zoi, eor }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { confirmWithFurs, extractFromP12, type FursConfig, type FursInvoiceData } from '@/lib/furs'
import { getFursCertificate } from '@/lib/furs-cert'
import { resolveActiveOrgId, resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set() {}, remove() {},
      },
    }
  )
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
    }

    const body = await req.json()
    const { order_id, total, original_eor, reason } = body

    if (!order_id) {
      return NextResponse.json({ error: 'order_id je obvezen' }, { status: 400 })
    }

    const { orgId: __orgId, role: __role } = await resolveActiveOrgId(supabase, user.id, getRequestedOrgId(req))
    const member = __orgId ? { org_id: __orgId, role: __role } : null // vec-org podpora (30.7.2026)

    if (!member) {
      return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', member.org_id)
      .single()

    if (!org?.tax_number) {
      return NextResponse.json({ error: 'Davčna številka ni nastavljena' }, { status: 400 })
    }

    const { cert, isTest } = await getFursCertificate(supabase, member.org_id)

    if (!cert) {
      return NextResponse.json({ error: `FURS ${isTest ? 'testni' : 'produkcijski'} certifikat ni naložen` }, { status: 400 })
    }

    const { data: premise } = await supabase
      .from('business_premises')
      .select('*')
      .eq('org_id', member.org_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (!premise) {
      return NextResponse.json({ error: 'Poslovni prostor ni dodan' }, { status: 400 })
    }

    const { data: device } = await supabase
      .from('electronic_devices')
      .select('*')
      .eq('premise_id', premise.id)
      .eq('is_active', true)
      .maybeSingle()

    const deviceIdCode = device?.device_id ?? 'RACUNKO01'

    // Sequence za kredit noto (nova zaporedna številka)
    // Sequence za kredit noto - POPRAVLJENO 21.7.2026 (bila je resna napaka:
    // prejsnja verzija je stela potrjene racune CEZ VSE organizacije na
    // platformi, brez org_id filtra, z neatomarnim "preberi-nato-poveca"
    // vzorcem - enak razred napake, ki je povzrocil prvotni FURS incident.
    // Po ZDavPR mora kredit nota deliti ISTO zaporedje kot navadni racuni
    // znotraj istega prostora+naprave, zato uporabimo isti atomaren RPC.
    const { data: seqData, error: seqError } = await supabase.rpc('get_next_pos_invoice_number')
    if (seqError) {
      return NextResponse.json({ error: 'Napaka pri generiranju številke kredit note: ' + seqError.message }, { status: 500 })
    }
    const sequenceNumber = seqData as number
    const invoiceNumberFull = `${premise.premise_id}-${deviceIdCode}-${sequenceNumber}`

    // Razpakiraj .p12 v PEM
    const p12Buffer = Buffer.from(cert.certificate_data, 'base64')
    const { privateKeyPem, certificatePem } = extractFromP12(
      p12Buffer,
      cert.certificate_password ?? ''
    )

    const config: FursConfig = {
      taxNumber: cert.tax_number || org.tax_number, // POPRAVLJENO 29.7.2026
      premiseId: premise.premise_id,
      deviceId: deviceIdCode,
      privateKeyPem,
      certificatePem,
      isTest: process.env.FURS_TEST_MODE !== 'false',
    }

    // DODANO (16.8.2026): razclenitev po stopnjah DDV tudi za STORNO. Prej se
    // je celoten negativni znesek prijavil po 22%, tudi ce je izvirni racun
    // vseboval hrano po 9,5% - storno se torej ni ujemal z izvirnikom, kar bi
    // pri davcnem nadzoru pomenilo neskladje med izdanim in storniranim racunom.
    const znesekStorno = -Math.abs(Number(total))
    const { data: stornoLines } = await supabase
      .from('order_lines')
      .select('total, qty, unit_price, vat_rate, voided')
      .eq('order_id', order_id)
    const veljavne = (stornoLines || []).filter((l: any) => !l.voided)
    let vatBreakdown: { rate: number; net: number; vat: number }[] | undefined
    if (veljavne.length > 0) {
      const vsotaVrstic = veljavne.reduce((s: number, l: any) =>
        s + Number(l.total ?? (Number(l.qty || 0) * Number(l.unit_price || 0))), 0)
      const faktor = vsotaVrstic > 0 ? Math.abs(znesekStorno) / vsotaVrstic : 1
      const poStopnji = new Map<number, number>()
      for (const l of veljavne) {
        const bruto = Number(l.total ?? (Number(l.qty || 0) * Number(l.unit_price || 0))) * faktor
        const stopnja = Number(l.vat_rate ?? 22)
        poStopnji.set(stopnja, (poStopnji.get(stopnja) || 0) + bruto)
      }
      vatBreakdown = Array.from(poStopnji.entries()).map(([rate, bruto]) => {
        const net = rate > 0 ? bruto / (1 + rate / 100) : bruto
        // Pri stornu so vsi zneski NEGATIVNI, enako kot skupni znesek.
        return {
          rate,
          net: -Math.round(net * 100) / 100,
          vat: -Math.round((bruto - net) * 100) / 100,
        }
      }).sort((a, b) => b.rate - a.rate)
    }

    // Kredit nota = negativni znesek, tip 'credit_note'
    const fursData: FursInvoiceData = {
      invoiceNumber: sequenceNumber,
      issueDateTime: new Date(),
      amountTotal: znesekStorno, // negativen!
      vatBreakdown,
      paymentType: 'cash',
      invoiceType: 'credit_note',
    }

    // Log
    const { data: logEntry } = await supabase
      .from('furs_log')
      .insert({
        org_id: member.org_id,
        invoice_id: null,
        status: 'pending',
        raw_request: {
          source: 'pos_void',
          orderId: order_id,
          invoiceNumber: sequenceNumber,
          invoiceNumberFull,
          originalEor: original_eor,
          reason,
        },
      })
      .select('id')
      .single()

    const result = await confirmWithFurs(config, fursData)

    await supabase
      .from('furs_log')
      .update({
        zoi: result.zoi,
        eor: result.eor,
        status: result.success ? 'success' : 'error',
        error_message: result.errorMessage,
        response_at: result.responseTime?.toISOString(),
      })
      .eq('id', logEntry?.id)

    if (result.success) {
      return NextResponse.json({
        success: true,
        zoi: result.zoi,
        eor: result.eor,
        invoiceNumber: invoiceNumberFull,
      })
    } else {
      // Storno se vseeno izvede — FURS je opcijski del pri stornu
      return NextResponse.json({
        success: false,
        error: result.errorMessage,
        zoi: result.zoi,
        invoiceNumber: invoiceNumberFull,
      }, { status: 503 })
    }

  } catch (e: any) {
    console.error('FURS void error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}