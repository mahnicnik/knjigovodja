import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { calculateZoi, confirmWithFurs, type FursConfig, type FursInvoiceData } from '@/lib/furs'
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

    const { data: member } = await supabase
      .from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
    if (!member) return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })

    // Pridobi certifikat
    const { data: cert } = await supabase
      .from('furs_certificates')
      .select('*')
      .eq('org_id', member.org_id)
      .eq('is_active', true)
      .maybeSingle()

    if (!cert) return NextResponse.json({ error: 'Certifikat ni naložen' }, { status: 400 })

    // Pridobi prvi poslovni prostor + napravo
    const { data: premise } = await supabase
      .from('business_premises')
      .select('*')
      .eq('org_id', member.org_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (!premise) return NextResponse.json({ error: 'Poslovni prostor ni dodan' }, { status: 400 })

    const { data: device } = await supabase
      .from('electronic_devices')
      .select('*')
      .eq('premise_id', premise.id)
      .eq('is_active', true)
      .maybeSingle()

    // Pridobi org davčno številko
    const { data: org } = await supabase
      .from('organizations')
      .select('tax_number')
      .eq('id', member.org_id)
      .single()

    if (!org?.tax_number) return NextResponse.json({ error: 'Davčna številka org ni nastavljena' }, { status: 400 })

    // Testni klic — minimalni znesek €0.01
    const testData: FursInvoiceData = {
      invoiceNumber: 1,
      issueDateTime: new Date(),
      amountTotal: 0.01,
      paymentType: 'cash',
      invoiceType: 'invoice',
    }

    const config: FursConfig = {
      taxNumber: org.tax_number,
      premiseId: premise.premise_id,
      deviceId: device?.device_id ?? 'RACUNKO01',
      privateKeyPem: cert.certificate_data, // V produkciji: decrypt + parse iz .p12
      certificatePem: cert.certificate_data,
      isTest: true, // Vedno test za /api/furs/test
    }

    const result = await confirmWithFurs(config, testData)

    // Log rezultat
    await supabase.from('furs_log').insert({
      org_id: member.org_id,
      zoi: result.zoi,
      eor: result.eor,
      status: result.success ? 'success' : 'error',
      error_message: result.errorMessage,
      response_at: result.responseTime?.toISOString(),
    })

    if (result.success) {
      return NextResponse.json({ success: true, eor: result.eor, zoi: result.zoi })
    } else {
      return NextResponse.json({ success: false, error: result.errorMessage }, { status: 500 })
    }

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}