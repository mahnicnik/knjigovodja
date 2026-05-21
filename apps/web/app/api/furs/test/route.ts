import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { confirmWithFurs, extractFromP12, type FursConfig, type FursInvoiceData } from '@/lib/furs'

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

    // Beri iz businesses.furs_config
    const { data: biz } = await supabase
      .from('businesses')
      .select('furs_config')
      .eq('owner_user_id', user.id)
      .single()

    // Fallback na fixed business ID če owner_user_id ne ujame
    let fc = biz?.furs_config as any
    if (!fc?.certB64) {
      const { data: biz2 } = await supabase
        .from('businesses')
        .select('furs_config')
        .eq('id', '00000000-00-0000-0000-000000000001')
        .single()
      fc = biz2?.furs_config as any
    }
    if (!fc?.certB64) return NextResponse.json({ error: 'Certifikat ni naložen' }, { status: 400 })
    if (!fc?.premises?.length) return NextResponse.json({ error: 'Poslovni prostor ni dodan' }, { status: 400 })

    const premise = fc.premises[0]
    const device = fc.devices?.[0]

    const p12Buffer = Buffer.from(fc.certB64, 'base64')
    const { privateKeyPem, certificatePem } = extractFromP12(p12Buffer, fc.certPassword)

    const config: FursConfig = {
      taxNumber: '91390419',
      premiseId: premise.businessPremiseId,
      deviceId: device?.electronicDeviceId ?? 'RACUNKO01',
      privateKeyPem,
      certificatePem,
      isTest: process.env.FURS_TEST_MODE !== 'false',
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
      return NextResponse.json({ success: true, eor: result.eor, zoi: result.zoi, datetime: new Date().toLocaleString('sl-SI') })
    } else {
      return NextResponse.json({ success: false, error: result.errorMessage }, { status: 500 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
