import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  // Preveri secret da ne more kdorkoli klicati tega endpointa
  const secret = request.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const day2Start = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000)
  const day2End = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000)
  const day5Start = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000)
  const day5End = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000)

  let sent2 = 0, sent5 = 0

  // Dan 2 — uporabniki ki so se registrirali pred ~2 dnemi
  const { data: users2 } = await sb.auth.admin.listUsers()
  const eligible2 = (users2?.users || []).filter(u => {
    const created = new Date(u.created_at)
    return created >= day2Start && created <= day2End && u.email
  })

  for (const user of eligible2) {
    const name = user.user_metadata?.full_name || 'podjetnik'
    await sendEmail(user.email!, 'Ste že izdali prvi račun? 📄', getDay2Email(name))
    sent2++
  }

  // Dan 5 — uporabniki ki so se registrirali pred ~5 dnevi
  const eligible5 = (users2?.users || []).filter(u => {
    const created = new Date(u.created_at)
    return created >= day5Start && created <= day5End && u.email
  })

  for (const user of eligible5) {
    const name = user.user_metadata?.full_name || 'podjetnik'
    await sendEmail(user.email!, 'Vprašajte AI računovodja 🤖', getDay5Email(name))
    sent5++
  }

  console.log(`✅ Cron: poslano dan2=${sent2}, dan5=${sent5}`)
  return NextResponse.json({ success: true, sent2, sent5 })
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Računko <noreply@xn--raunko-j2a.si>',
      to,
      subject,
      html,
    }),
  })
  if (!res.ok) {
    const err = await res.json()
    console.error('Resend error:', err)
  }
}

function getDay2Email(name: string): string {
  return `<!DOCTYPE html>
<html lang="sl">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F7F7F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F7F5;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%">
        <tr><td align="center" style="padding:0 0 24px">
          <table cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="background:#0A3D2B;border-radius:8px;padding:8px 14px">
              <span style="color:#9FE1CB;font-size:14px;font-weight:500">rč</span>
              <span style="color:#fff;font-size:14px;font-weight:500;margin-left:8px">Računko</span>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#fff;border-radius:14px;border:0.5px solid #E8E8E8">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:32px 40px 28px;border-bottom:0.5px solid #F0F0F0">
              <p style="margin:0 0 8px;font-size:22px">📄</p>
              <h2 style="margin:0 0 8px;font-size:22px;font-weight:500;color:#111">Ste že izdali prvi račun?</h2>
              <p style="margin:0;font-size:14px;color:#888">Večina naših uporabnikov izda prvi račun v prvih 24 urah.</p>
            </td></tr>
            <tr><td style="padding:28px 40px">
              <p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.7">Pozdravljeni ${name},</p>
              <p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.7">Izdaja računa v Računko traja <strong>30 sekund</strong>. Vnesete stranko, znesek, kliknete Izdaj — PDF z UPN QR kodo je takoj pripravljen.</p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px">
                <tr><td style="background:#E8F5EE;border-radius:10px;padding:18px 22px;border-left:3px solid #1D9E75">
                  <p style="margin:0 0 6px;font-size:13px;font-weight:500;color:#085041">Kaj je UPN QR koda?</p>
                  <p style="margin:0;font-size:13px;color:#444;line-height:1.6">Stranka jo poskenira z mobilno banko — plačilni nalog se samodejno izpolni. Brez ročnega vnosa.</p>
                </td></tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px">
                <tr><td align="center">
                  <a href="https://xn--raunko-j2a.si/invoices/new" style="display:inline-block;background:#1D9E75;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:13px 32px;border-radius:9px">Izdaj prvi račun →</a>
                </td></tr>
              </table>
              <p style="margin:0;font-size:14px;color:#888">Vprašanja? <a href="mailto:podpora@xn--raunko-j2a.si" style="color:#1D9E75;text-decoration:none">podpora@računko.si</a></p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 0;text-align:center">
          <p style="margin:0;font-size:11px;color:#aaa">© 2026 Računko · <a href="https://xn--raunko-j2a.si/privacy" style="color:#aaa;text-decoration:none">Zasebnost</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function getDay5Email(name: string): string {
  return `<!DOCTYPE html>
<html lang="sl">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F7F7F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F7F5;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%">
        <tr><td align="center" style="padding:0 0 24px">
          <table cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="background:#0A3D2B;border-radius:8px;padding:8px 14px">
              <span style="color:#9FE1CB;font-size:14px;font-weight:500">rč</span>
              <span style="color:#fff;font-size:14px;font-weight:500;margin-left:8px">Računko</span>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#fff;border-radius:14px;border:0.5px solid #E8E8E8">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:32px 40px 28px;border-bottom:0.5px solid #F0F0F0">
              <p style="margin:0 0 8px;font-size:22px">🤖</p>
              <h2 style="margin:0 0 8px;font-size:22px;font-weight:500;color:#111">Vprašajte AI računovodja</h2>
              <p style="margin:0;font-size:14px;color:#888">Odgovori z vašimi dejanskimi podatki — ne splošni nasveti.</p>
            </td></tr>
            <tr><td style="padding:28px 40px">
              <p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.7">Pozdravljeni ${name},</p>
              <p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.7">AI računovodja pozna vaše prihodke, odhodke in davčne roke. Odgovori konkretno — z vašimi številkami.</p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px">
                <tr><td style="background:#F7F7F5;border-radius:10px;padding:20px 24px">
                  <p style="margin:0 0 14px;font-size:12px;font-weight:500;color:#999;letter-spacing:0.06em">POGOSTA VPRAŠANJA</p>
                  <p style="margin:0 0 8px;font-size:13px;color:#333">💬 "Koliko dohodnine bom plačal letos?"</p>
                  <p style="margin:0 0 8px;font-size:13px;color:#333">💬 "Kdaj moram plačati prispevke?"</p>
                  <p style="margin:0;font-size:13px;color:#333">💬 "Ali mi ustreza normirani ali dejanski s.p.?"</p>
                </td></tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px">
                <tr><td align="center">
                  <a href="https://xn--raunko-j2a.si/ai" style="display:inline-block;background:#0A3D2B;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:13px 32px;border-radius:9px">Vprašaj AI računovodja →</a>
                </td></tr>
              </table>
              <p style="margin:0;font-size:14px;color:#888">Vprašanja? <a href="mailto:podpora@xn--raunko-j2a.si" style="color:#1D9E75;text-decoration:none">podpora@računko.si</a></p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 0;text-align:center">
          <p style="margin:0;font-size:11px;color:#aaa">© 2026 Računko · <a href="https://xn--raunko-j2a.si/privacy" style="color:#aaa;text-decoration:none">Zasebnost</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}