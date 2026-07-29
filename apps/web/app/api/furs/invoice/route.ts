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

    const { data: member } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!member) {
      return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })
    }

    // Order — POS uporablja placeholder business_id (00000000-...-000001),
    // ne pravega org_id. Iščemo samo po order_id, org se določi preko user-ja.
    const { data: order } = await supabase
      .from('orders')
      .select('*, payments(*)')
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
    const { data: seqData, error: seqError } = await supabase.rpc('get_next_pos_invoice_number')
    if (seqError) {
      return NextResponse.json({ error: 'Napaka pri generiranju številke računa: ' + seqError.message }, { status: 500 })
    }
    const sequenceNumber = seqData as number
    const invoiceNumberFull = `${premise.premise_id}-${deviceIdCode}-${sequenceNumber}`

    const amountTotal = Number(total ?? order.total)
    const fursData: FursInvoiceData = {
      invoiceNumber: sequenceNumber,
      issueDateTime: order.closed_at ? new Date(order.closed_at) : new Date(),
      amountTotal,
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

