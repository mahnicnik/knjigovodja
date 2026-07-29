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
    { cookies: { get(name: string) { return cookieStore.get(name)?.value }, set() {}, remove() {} } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })

    // Pridobi org_id
    const { data: member } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!member) return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })

    // Beri certifikat iz furs_certificates tabele - UJEMAJOC test/prod nacinu
    const { cert, isTest } = await getFursCertificate(supabase, member.org_id)
    if (!cert) return NextResponse.json({ error: `${isTest ? 'Testni' : 'Produkcijski'} certifikat ni naložen` }, { status: 400 })

    // Pridobi poslovni prostor
    const { data: premise } = await supabase
      .from('business_premises')
      .select('*')
      .eq('org_id', member.org_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    // Pridobi napravo
    const { data: device } = premise ? await supabase
      .from('electronic_devices')
      .select('*')
      .eq('premise_id', premise.id)
      .eq('is_active', true)
      .maybeSingle() : { data: null }

    // Pridobi davčno številko
    const { data: org } = await supabase
      .from('organizations')
      .select('tax_number, furs_test_mode')
      .eq('id', member.org_id)
      .single()

    const p12Buffer = Buffer.from(cert.certificate_data, 'base64')
    let privateKeyPem: string, certificatePem: string
    try {
      const extracted = extractFromP12(p12Buffer, cert.certificate_password ?? '')
      privateKeyPem = extracted.privateKeyPem
      certificatePem = extracted.certificatePem
    } catch (e: any) {
      return NextResponse.json({
        success: false,
        error: 'Napačno geslo certifikata ali neveljavna .p12 datoteka. Preverite geslo in ponovno naložite certifikat.'
      }, { status: 400 })
    }

    const config: FursConfig = {
      taxNumber: org?.tax_number ?? '91390419',
      premiseId: premise?.premise_id ?? 'SIRBFB01',
      deviceId: device?.device_id ?? 'RACUNKO01',
      privateKeyPem,
      certificatePem,
      isTest: org?.furs_test_mode ?? true,
    }

    const testData: FursInvoiceData = {
      invoiceNumber: 1,
      issueDateTime: new Date(),
      amountTotal: 0.01,
      paymentType: 'cash',
      invoiceType: 'invoice',
    }

    const result = await confirmWithFurs(config, testData)

    if (result.success) {
      return NextResponse.json({
        success: true,
        eor: result.eor,
        zoi: result.zoi,
        datetime: new Date().toLocaleString('sl-SI')
      })
    } else {
      return NextResponse.json({ success: false, error: result.errorMessage }, { status: 500 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
