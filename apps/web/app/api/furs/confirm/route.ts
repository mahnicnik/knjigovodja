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
    if (!user) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })

    const body = await req.json()
    const { invoiceId, paymentType, premiseId: requestedPremiseId } = body

    if (!invoiceId) return NextResponse.json({ error: 'invoiceId je obvezen' }, { status: 400 })

    // Pridobi org
    const { data: member } = await supabase
      .from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
    if (!member) return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })

    // Pridobi invoice
    const { data: invoice } = await supabase
      .from('issued_invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('org_id', member.org_id)
      .single()

    if (!invoice) return NextResponse.json({ error: 'Račun ni najden' }, { status: 404 })

    // Preveri da račun ni že potrjen
    if (invoice.eor) {
      return NextResponse.json({
        success: true,
        eor: invoice.eor,
        zoi: invoice.zoi,
        alreadyConfirmed: true,
      })
    }

    // Pridobi org podatke
    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', member.org_id)
      .single()

    if (!org?.tax_number) return NextResponse.json({ error: 'Davčna številka ni nastavljena' }, { status: 400 })

    // Pridobi certifikat
    const { data: cert } = await supabase
      .from('furs_certificates')
      .select('*')
      .eq('org_id', member.org_id)
      .eq('is_active', true)
      .maybeSingle()

    if (!cert) return NextResponse.json({ error: 'FURS certifikat ni naložen. Pojdite na Nastavitve → Davčna blagajna.' }, { status: 400 })

    // Pridobi poslovni prostor
    let premiseQuery = supabase
      .from('business_premises')
      .select('*')
      .eq('org_id', member.org_id)
      .eq('is_active', true)

    if (requestedPremiseId) {
      premiseQuery = premiseQuery.eq('id', requestedPremiseId)
    }

    const { data: premise } = await premiseQuery.limit(1).maybeSingle()
    if (!premise) return NextResponse.json({ error: 'Poslovni prostor ni dodan. Pojdite na Nastavitve → Davčna blagajna.' }, { status: 400 })

    const { data: device } = await supabase
      .from('electronic_devices')
      .select('*')
      .eq('premise_id', premise.id)
      .eq('is_active', true)
      .maybeSingle()

    // Pridobi naslednjo zaporedno številko za to napravo
    const { count: invoiceCount } = await supabase
      .from('furs_log')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', member.org_id)
      .eq('status', 'success')

    const sequenceNumber = (invoiceCount ?? 0) + 1

    // Pripravi FURS podatke
    const fursData: FursInvoiceData = {
      invoiceNumber: sequenceNumber,
      issueDateTime: invoice.issue_date ? new Date(invoice.issue_date) : new Date(),
      amountTotal: Number(invoice.amount_total),
      paymentType: paymentType ?? 'cash',
      invoiceType: invoice.invoice_type === 'credit_note' ? 'credit_note' : 'invoice',
    }

    const config: FursConfig = {
      taxNumber: org.tax_number,
      premiseId: premise.premise_id,
      deviceId: device?.device_id ?? 'RACUNKO01',
      privateKeyPem: cert.certificate_data,
      certificatePem: cert.certificate_data,
      isTest: process.env.FURS_TEST_MODE === 'true',
    }

    // Log start
    const { data: logEntry } = await supabase
      .from('furs_log')
      .insert({
        org_id: member.org_id,
        invoice_id: invoiceId,
        status: 'pending',
        raw_request: { invoiceNumber: sequenceNumber, premiseId: premise.premise_id },
      })
      .select('id')
      .single()

    // Klic FURS API
    const result = await confirmWithFurs(config, fursData)

    // Posodobi log
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
      // Shrani ZOI + EOR na račun
      await supabase
        .from('issued_invoices')
        .update({
          zoi: result.zoi,
          eor: result.eor,
          furs_confirmed_at: new Date().toISOString(),
        })
        .eq('id', invoiceId)

      return NextResponse.json({
        success: true,
        zoi: result.zoi,
        eor: result.eor,
      })
    } else {
      // FURS napaka — po ZDavPR imate 2 uri offline
      return NextResponse.json({
        success: false,
        error: result.errorMessage,
        offlineMode: result.errorMessage?.includes('Timeout') || result.errorMessage?.includes('offline'),
        zoi: result.zoi, // ZOI imamo tudi brez EOR
      }, { status: 503 })
    }

  } catch (e: any) {
    console.error('FURS confirm error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}