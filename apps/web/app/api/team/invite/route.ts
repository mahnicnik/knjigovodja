import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resend, FROM_EMAIL } from '@/lib/resend'

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

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  cashier: 'Blagajnik',
  viewer: 'Gledalec',
  accountant: 'Računovodja',
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })

    const { inviteId, email, role } = await req.json()
    if (!inviteId || !email) return NextResponse.json({ error: 'Manjkajo parametri' }, { status: 400 })

    // Pridobi org info
    const { data: member } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!member) return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })

    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', member.org_id)
      .single()

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://xn--raunko-j2a.si'}/invite/${inviteId}`
    const roleLabel = ROLE_LABELS[role] ?? role

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; max-width: 520px; margin: 0 auto; color: #0D1F12;">
  <div style="background: #0D1F12; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
    <div style="color: #E8B547; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;">RAČUNKO</div>
    <div style="color: #fff; font-size: 22px; font-weight: 500; margin-top: 8px;">Povabljeni ste v ekipo</div>
  </div>
  <div style="background: #fff; border: 1px solid rgba(0,0,0,0.08); border-top: 0; border-radius: 0 0 12px 12px; padding: 28px 24px;">
    <p style="font-size: 14px; line-height: 1.6; color: #444;">
      Povabljeni ste, da se pridružite podjetju <strong>${org?.name ?? 'Računko'}</strong> 
      kot <strong>${roleLabel}</strong>.
    </p>
    <p style="font-size: 13px; color: #888; line-height: 1.6;">
      Računko je pametno računovodsko orodje za slovenskega podjetnika — računi, stroški, POS terminal in davki na enem mestu.
    </p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${inviteUrl}" style="background: #0D1F12; color: #fff; padding: 14px 32px; border-radius: 10px; font-size: 14px; font-weight: 600; text-decoration: none; display: inline-block;">
        Sprejmi povabilo →
      </a>
    </div>
    <p style="font-size: 12px; color: #aaa; text-align: center; line-height: 1.5;">
      Povabilo velja 7 dni. Če niste pričakovali tega emaila, ga lahko ignorirate.
    </p>
  </div>
</body>
</html>`

    const { error: emailError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [email],
      subject: `Povabilo v ${org?.name ?? 'Računko'} — vloga: ${roleLabel}`,
      html,
    } as any)

    if (emailError) {
      console.error('Invite email error:', emailError)
      // Ne failamo — povabilo je v DB, email je sekundarno
    }

    return NextResponse.json({ success: true })

  } catch (e: any) {
    console.error('Team invite error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}