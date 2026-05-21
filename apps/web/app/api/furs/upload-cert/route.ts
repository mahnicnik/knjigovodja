import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value },
          set() {}, remove() {},
        },
      }
    )

    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Ni avtentikacije' }, { status: 401 })

    const formData = await req.formData()
    const certFile = formData.get('cert') as File
    const password = formData.get('password') as string

    if (!certFile || !password) {
      return NextResponse.json({ error: 'Manjka certifikat ali geslo' }, { status: 400 })
    }

    const bytes = await certFile.arrayBuffer()
    const certB64 = Buffer.from(bytes).toString('base64')
    const subject = certFile.name.replace('.p12', '').replace('.pfx', '')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: biz } = await supabase
      .from('businesses')
      .select('furs_config')
      .eq('owner_user_id', user.id)
      .single()

    const existing = (biz?.furs_config as any) || {}

    const { error } = await supabase
      .from('businesses')
      .update({
        furs_config: {
          ...existing,
          certB64,
          certPassword: password,
          certSubject: subject,
          certExpiry: '',
        }
      })
      .eq('owner_user_id', user.id)

    if (error) throw error

    return NextResponse.json({ success: true, subject, expiry: '' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
