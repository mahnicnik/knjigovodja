import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'

/**
 * PRELET 309 — Eskalacija iz podpornega klepeta ("Vprašaj Računko") na
 * pravega človeka: če bot ne reši težave, uporabnik s klikom pošlje
 * celoten pogovor na support@xn--raunko-j2a.si (obstoječi uradni naslov,
 * ze prikazan v modalu Pomoč). Pošiljatelj (uporabnikov e-mail in
 * podjetje) je JASNO viden v telesu e-maila in kot `replyTo`, da je
 * mogoče odgovoriti neposredno.
 */
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
    }

    const member = await resolveActiveOrg(supabase, user.id, getRequestedOrgId(req), 'name')
    const org = (member as any)?.organizations

    const { messages, currentPath } = await req.json()
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Ni vsebine za pošiljanje' }, { status: 400 })
    }

    const pogovorHtml = messages.map((m: any) => `
      <div style="margin-bottom:12px;">
        <div style="font-size:11px; font-weight:700; color:${m.role === 'user' ? '#0D1F12' : '#1D9E75'}; text-transform:uppercase; letter-spacing:.04em; margin-bottom:2px;">
          ${m.role === 'user' ? 'Uporabnik' : 'Bot'}
        </div>
        <div style="font-size:13px; color:#333; line-height:1.6; white-space:pre-wrap;">${String(m.content || '').replace(/</g, '&lt;')}</div>
      </div>`).join('')

    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; max-width: 620px; margin: 0 auto; color: #0D1F12;">
  <div style="background: #0D1F12; padding: 20px 24px; border-radius: 12px 12px 0 0;">
    <div style="color: #E8B547; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;">RAČUNKO — PODPORNI KLEPET</div>
    <div style="color: #fff; font-size: 18px; font-weight: 500; margin-top: 6px;">Uporabnik potrebuje pomoč</div>
  </div>
  <div style="background: #F7F6F2; border: 1px solid rgba(0,0,0,0.08); border-top: 0; padding: 16px 24px; font-size: 13px; color: #444;">
    <div><strong>Od:</strong> ${user.email}</div>
    <div><strong>Podjetje:</strong> ${org?.name || 'ni znano'}</div>
    ${currentPath ? `<div><strong>Stran v aplikaciji:</strong> ${currentPath}</div>` : ''}
  </div>
  <div style="background: #fff; border: 1px solid rgba(0,0,0,0.08); border-top: 0; border-radius: 0 0 12px 12px; padding: 20px 24px;">
    <div style="font-size:11px; color:#aaa; text-transform:uppercase; letter-spacing:.05em; margin-bottom:14px;">Pogovor</div>
    ${pogovorHtml}
  </div>
</body></html>`

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ['support@xn--raunko-j2a.si'],
      replyTo: user.email,
      subject: `Podpora: ${org?.name || user.email} potrebuje pomoč`,
      html,
    } as any)

    if (error) {
      console.error('Support escalation email error:', error)
      return NextResponse.json({ error: 'E-mail ni bil poslan: ' + JSON.stringify(error) }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('Support escalation error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
