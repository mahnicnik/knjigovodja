import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name) { return cookieStore.get(name)?.value }, set() {}, remove() {} } }
    )
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Ni avtentikacije' }, { status: 401 })

    const formData = await req.formData()
    const certFile = formData.get('cert') as File
    const password = formData.get('password') as string
    if (!certFile || !password) return NextResponse.json({ error: 'Manjka file ali geslo' }, { status: 400 })

    const bytes = await certFile.arrayBuffer()
    const certB64 = Buffer.from(bytes).toString('base64')
    const subject = certFile.name.replace('.p12','').replace('.pfx','')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Pridobi org_id
    const { data: member } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (!member) return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })

    // Deaktiviraj stare certifikate
    await supabase
      .from('furs_certificates')
      .update({ is_active: false })
      .eq('org_id', member.org_id)

    // Vstavi nov certifikat
    const { error } = await supabase
      .from('furs_certificates')
      .insert({
        org_id: member.org_id,
        certificate_data: certB64,
        certificate_password: password,
        issuer: subject,
        is_active: true,
      })

    if (error) throw error

    return NextResponse.json({ success: true, subject, expiry: '' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
