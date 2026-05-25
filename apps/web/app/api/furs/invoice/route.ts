/**
 * RAČUNKO POS — FURS davčno potrjevanje gotovinskih računov
 *
 * Klicano iz /pos/page.tsx ob plačilu. Deluje na 'orders' tabeli (POS).
 * Različno od /api/furs/confirm ki dela na 'issued_invoices' (B2B).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { confirmWithFurs, type FursConfig, type FursInvoiceData } from '@/lib/furs'

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
    const { order_id, total } = body

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

    // Order — uporablja business_id (legacy poimenovanje za org_id)
    const { data: order } = await supabase
      .from('orders')
      .select('*, payments(*)')
      .eq('id', order_id)
      .eq('business_id', member.org_id)
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

    const { data: cert } = await supabase
      .from('furs_certificates')
      .select('*')
      .eq('org_id', member.org_id)
      .eq('is_active', true)
      .maybeSingle()

    if (!cert) {
      return NextResponse.json(
        { error: 'FURS certifikat ni naložen. Pojdite na Nastavitve → Davčna blagajna.' },
        { status: 400 }
      )
    }

    const { data: premise } = await supabase
      .from('business_premises')
      .select('*')
      .eq('org_id', member.org_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

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

    // Sequence per-org POS računi (kjer imamo FURS EOR)
    const { count: confirmedCount } = await supabase
      .from('orders')
      .select('id, payments!inner(furs_eor)', { count: 'exact', head: true })
      .eq('business_id', member.org_id)
      .not('payments.furs_eor', 'is', null)

    const sequenceNumber = (confirmedCount ?? 0) + 1
    const invoiceNumberFull = `${premise.premise_id}-${deviceIdCode}-${sequenceNumber}`

    const amountTotal = Number(total ?? order.total)
    const fursData: FursInvoiceData = {
      invoiceNumber: sequenceNumber,
      issueDateTime: order.closed_at ? new Date(order.closed_at) : new Date(),
      amountTotal,
      paymentType: 'cash',
      invoiceType: 'invoice',
    }

    const config: FursConfig = {
      taxNumber: org.tax_number,
      premiseId: premise.premise_id,
      deviceId: deviceIdCode,
      privateKeyPem: cert.certificate_data,
      certificatePem: cert.certificate_data,
      isTest: process.env.FURS_TEST_MODE === 'true',
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
