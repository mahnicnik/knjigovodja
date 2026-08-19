import { NextRequest, NextResponse } from 'next/server'
import { readCertificateInfo } from '@/lib/furs'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { resolveActiveOrgId, resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'

// POPRAVLJENO (26.7.2026): sprejme is_test polje in upsert-a na
// (org_id, is_test) namesto samo org_id - prej bi nalaganje testnega
// certifikata PREPISALO obstojeci produkcijski (in obratno).
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value }, set() {}, remove() {} } }
    )
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Ni avtentikacije' }, { status: 401 })

    const formData = await req.formData()
    const certFile = formData.get('cert') as File
    const password = formData.get('password') as string
    const isTest = formData.get('is_test') === 'true'
    if (!certFile || !password) return NextResponse.json({ error: 'Manjka file ali geslo' }, { status: 400 })

    const bytes = await certFile.arrayBuffer()
    const certBuffer = Buffer.from(bytes)
    const certB64 = certBuffer.toString('base64')

    // POPRAVLJENO (19.8.2026): doslej se vsebina certifikata NI prebrala -
    // shranila sta se samo binarni zapis in geslo, ime pa se je vzelo kar iz
    // imena datoteke. Zato so `tax_number`, `valid_from` in `valid_to` ostali
    // prazni, FURS pa je prejel davcno stevilko iz organizacije namesto tiste
    // iz certifikata. Pri testnem certifikatu sta to razlicni stevilki, zato
    // je FURS zahtevek zavrnil ("tezave pri komunikaciji").
    const info = readCertificateInfo(certBuffer, password)

    // Ce je bilo geslo napacno, iz certifikata ne dobimo nicesar - to je
    // najpogostejsi vzrok in ga je bolje povedati takoj kot pustiti, da se
    // pokaze sele ob prvi prodaji.
    if (!info.subject && !info.taxNumber) {
      return NextResponse.json({
        error: 'Certifikata ni bilo mogoce prebrati. Najverjetneje je geslo napacno ali datoteka ni veljaven .p12/.pfx.'
      }, { status: 400 })
    }

    const subject = info.subject || certFile.name.replace('.p12','').replace('.pfx','')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { orgId: __orgId, role: __role } = await resolveActiveOrgId(supabase, user.id, getRequestedOrgId(req))
    const member = __orgId ? { org_id: __orgId, role: __role } : null // vec-org podpora (30.7.2026)

    if (!member) return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })

    const { error } = await supabase
      .from('furs_certificates')
      .upsert({
        org_id: member.org_id,
        certificate_data: certB64,
        certificate_password: password,
        issuer: subject,
        tax_number: info.taxNumber,
        valid_from: info.validFrom ? info.validFrom.toISOString() : null,
        valid_to: info.validTo ? info.validTo.toISOString() : null,
        is_active: true,
        is_test: isTest,
      }, { onConflict: 'org_id,is_test' })

    if (error) throw error

    return NextResponse.json({
      success: true,
      subject,
      taxNumber: info.taxNumber,
      expiry: info.validTo ? info.validTo.toISOString() : '',
      isTest,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
