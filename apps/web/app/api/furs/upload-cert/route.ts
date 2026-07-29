import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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
    const certB64 = Buffer.from(bytes).toString('base64')
    const subject = certFile.name.replace('.p12','').replace('.pfx','')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: member } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (!member) return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })

    const { error } = await supabase
      .from('furs_certificates')
      .upsert({
        org_id: member.org_id,
        certificate_data: certB64,
        certificate_password: password,
        issuer: subject,
        is_active: true,
        is_test: isTest,
      }, { onConflict: 'org_id,is_test' })

    if (error) throw error

    return NextResponse.json({ success: true, subject, expiry: '', isTest })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
