/**
 * RAČUNKO POS — FURS davčno potrjevanje gotovinskih računov
 *
 * Klicano iz /pos/page.tsx ob plačilu. Deluje na 'orders' tabeli (POS).
 * Različno od /api/furs/confirm ki dela na 'issued_invoices' (B2B).
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
    const { order_id, total, premise_id: requestedPremiseId } = body

    if (!order_id) {
      return NextResponse.json({ error: 'order_id je obvezen' }, { status: 400 })
    }

    const { orgId: __orgId, role: __role } = await resolveActiveOrgId(supabase, user.id, getRequestedOrgId(req))
    const member = __orgId ? { org_id: __orgId, role: __role } : null // vec-org podpora (30.7.2026)

    if (!member) {
      return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })
    }

    // Order — POS uporablja placeholder business_id (00000000-...-000001),
    // ne pravega org_id. Iščemo samo po order_id, org se določi preko user-ja.
    const { data: order } = await supabase
      .from('orders')
      // DODANO (16.8.2026): vrstice narocila s stopnjami DDV - brez njih se je
      // FURS-u prijavil CELOTEN racun po 22%, tudi ce je vseboval hrano po 9,5%.
      .select('*, payments(*), order_lines(total, qty, unit_price, vat_rate, voided)')
      .eq('id', order_id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Račun ni najden' }, { status: 404 })
    }

    // Že potrjen?
    const existingPayment = order.payments?.[0]
    if (existingPayment?.furs_eor) {
      return NextResponse.json({
        success: true,
        zoi: existingPayment.furs_zoi,
        eor: existingPayment.furs_eor,
        invoiceNumber: order.invoice_number || String(order.number),
        alreadyConfirmed: true,
      })
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', member.org_id)
      .single()

    if (!org?.tax_number) {
      return NextResponse.json(
        { error: 'Davčna številka ni nastavljena. Pojdite na Nastavitve → Podjetje.' },
        { status: 400 }
      )
    }

    const { cert, isTest } = await getFursCertificate(supabase, member.org_id)

    if (!cert) {
      return NextResponse.json(
        { error: `FURS ${isTest ? 'testni' : 'produkcijski'} certifikat ni naložen. Pojdite na Nastavitve → Davčna blagajna.` },
        { status: 400 }
      )
    }

    // POMEMBNO (popravljeno 21.7.2026 po incidentu SIRBFB01->PE01 16.7.):
    // ce POS eksplicitno posreduje premise_id (iz uporabnikove izbire ob
    // prijavi - selectedPremise/activePremise v pos/page.tsx), uporabi
    // TOCNO TA prostor. Prej je koda vedno vzela "katerikoli aktiven" -
    // varno samo ce obstaja tocno en, tiho napacno ce sta bila kratek cas
    // aktivna dva hkrati (kar se je zgodilo 16.7. med S006 popravkom).
    let premiseQuery = supabase
      .from('business_premises')
      .select('*')
      .eq('org_id', member.org_id)
      .eq('is_active', true)
    if (requestedPremiseId) {
      premiseQuery = premiseQuery.eq('id', requestedPremiseId)
    }
    const { data: premise } = await premiseQuery.limit(1).maybeSingle()

    if (!premise) {
      return NextResponse.json(
        { error: 'Poslovni prostor ni dodan.' },
        { status: 400 }
      )
    }

    const { data: device } = await supabase
      .from('electronic_devices')
      .select('*')
      .eq('premise_id', premise.id)
      .eq('is_active', true)
      .maybeSingle()

    const deviceIdCode = device?.device_id ?? 'RACUNKO01'

    // Atomarno stevilo preko DB sekvence (RPC get_next_pos_invoice_number).
    // Prejsnja implementacija je stela vrstice "preberi-nato-povecaj", kar je
    // povzrocalo kolizije stevilk pri hitro zaporednih/socasnih placilih.
    // POPRAVLJENO (16.8.2026): stevilka se dodeli PO PODJETJU. Prej je bilo
    // zaporedje globalno za vsa podjetja - novo podjetje bi dobilo stevilko 351
    // in imelo nepojasnjeno vrzel od 1 do 350, kar FURS zahteva pojasniti.
    const { data: seqData, error: seqError } = await supabase.rpc('get_next_pos_invoice_number', { p_business_id: order.business_id })
    if (seqError) {
      return NextResponse.json({ error: 'Napaka pri generiranju številke računa: ' + seqError.message }, { status: 500 })
    }
    const sequenceNumber = seqData as number
    const invoiceNumberFull = `${premise.premise_id}-${deviceIdCode}-${sequenceNumber}`

    // DODANO (16.8.2026): TAKOJ zabelezimo porabljeno zaporedno stevilko.
    // Zaporedje (nextval) se ob neuspehu NE vrne nazaj, zato vsak neuspesen
    // klic na FURS pusti trajno vrzel v stevilcenju. FURS zahteva zaporedno
    // stevilcenje in vrzeli je treba znati pojasniti - doslej ni bilo nikjer
    // zapisano, katera stevilka je bila porabljena in zakaj (98 nepojasnjenih
    // vrzeli). Zapis nastane PRED klicem in se ob uspehu dopolni.
    await supabase.from('pos_invoice_numbers').insert({
      business_id: order.business_id,
      sequence_number: sequenceNumber,
      invoice_number: invoiceNumberFull,
      order_id: order.id,
      status: 'failed',
      note: 'Stevilka rezervirana, cakanje na odgovor FURS',
    })

    const amountTotal = Number(total ?? order.total)

    // DODANO (16.8.2026): razclenitev po stopnjah DDV za pravilno prijavo FURS-u.
    // Ce se znesek vrstic ne ujema s skupnim zneskom racuna (popust, napitnina),
    // razclenitev sorazmerno prilagodimo, da se vsota ujema s prijavljenim zneskom.
    const linije = (order.order_lines || []).filter((l: any) => !l.voided)
    let vatBreakdown: { rate: number; net: number; vat: number }[] | undefined
    if (linije.length > 0) {
      const vsotaVrstic = linije.reduce((s: number, l: any) =>
        s + Number(l.total ?? (Number(l.qty || 0) * Number(l.unit_price || 0))), 0)
      const faktor = vsotaVrstic > 0 ? amountTotal / vsotaVrstic : 1
      const poStopnji = new Map<number, number>()
      for (const l of linije) {
        const bruto = Number(l.total ?? (Number(l.qty || 0) * Number(l.unit_price || 0))) * faktor
        const stopnja = Number(l.vat_rate ?? 22)
        poStopnji.set(stopnja, (poStopnji.get(stopnja) || 0) + bruto)
      }
      vatBreakdown = Array.from(poStopnji.entries()).map(([rate, bruto]) => {
        const net = rate > 0 ? bruto / (1 + rate / 100) : bruto
        return {
          rate,
          net: Math.round(net * 100) / 100,
          vat: Math.round((bruto - net) * 100) / 100,
        }
      }).sort((a, b) => b.rate - a.rate)
    }

    const fursData: FursInvoiceData = {
      invoiceNumber: sequenceNumber,
      issueDateTime: order.closed_at ? new Date(order.closed_at) : new Date(),
      amountTotal,
      vatBreakdown,
      paymentType: 'cash',
      invoiceType: 'invoice',
    }

    // Razpakiraj .p12 v PEM (privateKey + cert)
    const p12Buffer = Buffer.from(cert.certificate_data, 'base64')
    const { privateKeyPem, certificatePem } = extractFromP12(
      p12Buffer,
      cert.certificate_password ?? ''
    )

    const config: FursConfig = {
      taxNumber: cert.tax_number || org.tax_number, // POPRAVLJENO 29.7.2026: testni certifikat ima svojo (fiktivno) davcno stevilko
      premiseId: premise.premise_id,
      deviceId: deviceIdCode,
      privateKeyPem,
      certificatePem,
      isTest: process.env.FURS_TEST_MODE !== 'false',
    }

    const { data: logEntry } = await supabase
      .from('furs_log')
      .insert({
        org_id: member.org_id,
        invoice_id: null,
        status: 'pending',
        raw_request: {
          source: 'pos',
          orderId: order_id,
          invoiceNumber: sequenceNumber,
          invoiceNumberFull,
          premiseId: premise.premise_id,
          deviceId: deviceIdCode,
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

    if (result.success && result.zoi && result.eor) {
      // Shrani tridelno številko na order (če stolpec obstaja)
      try {
        await supabase
          .from('orders')
          .update({ invoice_number: invoiceNumberFull })
          .eq('id', order_id)
      } catch {}

      // DODANO (16.8.2026): stevilka je bila USPESNO uporabljena - dopolni zapis.
      await supabase.from('pos_invoice_numbers')
        .update({ status: 'issued', note: null })
        .eq('business_id', order.business_id)
        .eq('sequence_number', sequenceNumber)
    } else {
      // Neuspeh: zabelezi razlog, da bo vrzel v stevilcenju pojasnjena.
      await supabase.from('pos_invoice_numbers')
        .update({
          status: 'failed',
          note: 'FURS ni potrdil racuna: ' + (result.errorMessage || 'neznana napaka'),
        })
        .eq('business_id', order.business_id)
        .eq('sequence_number', sequenceNumber)
    }

    if (result.success && result.zoi && result.eor) {

      return NextResponse.json({
        success: true,
        zoi: result.zoi,
        eor: result.eor,
        invoiceNumber: invoiceNumberFull,
      })
    } else {
      return NextResponse.json({
        success: false,
        error: result.errorMessage,
        zoi: result.zoi,
        invoiceNumber: invoiceNumberFull,
      }, { status: 503 })
    }

  } catch (e: any) {
    console.error('FURS POS confirm error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

