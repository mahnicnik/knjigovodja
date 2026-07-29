import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { confirmBusinessPremiseWithFurs, extractFromP12, type FursConfig, type FursPremiseData } from '@/lib/furs'
import { getFursCertificate } from '@/lib/furs-cert'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value }, set() {}, remove() {} } }
  )
}

/**
 * Prijavi poslovni prostor pri FURS (BusinessPremiseRequest) - locen korak
 * od potrjevanja racunov, ki mora biti opravljen enkrat pred prvim racunom
 * za ta poslovni prostor. Podatki o nepremicnini (katastrska obcina/stavba/
 * del stavbe) in naslovu se posljejo v telesu zahteve (POST body), ker so
 * specificni za vsako stranko/lokacijo.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })

    const { data: member } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!member) return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })

    const { cert, isTest } = await getFursCertificate(supabase, member.org_id)
    if (!cert) return NextResponse.json({ error: `${isTest ? 'Testni' : 'Produkcijski'} certifikat ni naložen` }, { status: 400 })

    const { data: premiseRow } = await supabase
      .from('business_premises')
      .select('*')
      .eq('org_id', member.org_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (!premiseRow) return NextResponse.json({ error: 'Poslovni prostor ni najden v bazi' }, { status: 400 })

    const { data: org } = await supabase
      .from('organizations')
      .select('tax_number, furs_test_mode')
      .eq('id', member.org_id)
      .single()

    const body = await req.json().catch(() => ({}))
    const premise: FursPremiseData = {
      businessPremiseId: premiseRow.premise_id,
      cadastralNumber: body.cadastralNumber,
      buildingNumber: body.buildingNumber,
      buildingSectionNumber: body.buildingSectionNumber,
      street: body.street,
      houseNumber: body.houseNumber,
      houseNumberAdditional: body.houseNumberAdditional || undefined,
      community: body.community,
      city: body.city,
      postalCode: body.postalCode,
      validityDate: body.validityDate || new Date().toISOString().split('T')[0],
      softwareSupplierTaxNumber: cert.tax_number || org?.tax_number || '91390419', // POPRAVLJENO 29.7.2026
    }

    const p12Buffer = Buffer.from(cert.certificate_data, 'base64')
    let privateKeyPem: string, certificatePem: string
    try {
      const extracted = extractFromP12(p12Buffer, cert.certificate_password ?? '')
      privateKeyPem = extracted.privateKeyPem
      certificatePem = extracted.certificatePem
    } catch (e: any) {
      return NextResponse.json({ error: 'Napačno geslo certifikata: ' + e.message }, { status: 400 })
    }

    const config: FursConfig = {
      taxNumber: cert.tax_number || org?.tax_number || '91390419', // POPRAVLJENO 29.7.2026
      premiseId: premiseRow.premise_id,
      deviceId: 'RACUNKO01',
      privateKeyPem,
      certificatePem,
      isTest: org?.furs_test_mode ?? false,
    }

    const result = await confirmBusinessPremiseWithFurs(config, premise)

    if (result.success) {
      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json({ success: false, error: result.errorMessage }, { status: 500 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
