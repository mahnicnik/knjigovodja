import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { email, name } = await request.json()

    if (!email) return NextResponse.json({ error: 'Manjka email' }, { status: 400 })

    // Sproži Resend automation z user.registered eventom
    const res = await fetch('https://api.resend.com/contacts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        first_name: name?.split(' ')[0] || '',
        last_name: name?.split(' ').slice(1).join(' ') || '',
        audience_id: process.env.RESEND_AUDIENCE_ID || '',
      }),
    })

    // Pošlji welcome email direktno
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Računko <noreply@xn--raunko-j2a.si>',
        to: email,
        subject: 'Dobrodošli v Računko 👋',
        html: getWelcomeEmail(name || 'podjetnik'),
      }),
    })

    if (!emailRes.ok) {
      const err = await emailRes.json()
      console.error('Resend error:', err)
      return NextResponse.json({ error: 'Email ni bil poslan' }, { status: 500 })
    }

    console.log(`✅ Welcome email poslan: ${email}`)
    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Welcome email error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function getWelcomeEmail(name: string): string {
  return `<!DOCTYPE html>
<html lang="sl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
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
        <tr><td style="background:#fff;border-radius:14px;border:0.5px solid #E8E8E8;overflow:hidden">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="background:#0A3D2B;padding:32px 40px 28px">
              <p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.5);letter-spacing:0.05em">DOBRODOŠLI V</p>
              <h1 style="margin:0;font-size:28px;font-weight:500;color:#fff;letter-spacing:-0.5px">Računko 👋</h1>
              <p style="margin:10px 0 0;font-size:15px;color:rgba(255,255,255,0.6);line-height:1.6">Vaš AI računovodja je pripravljen.</p>
            </td></tr>
            <tr><td style="padding:32px 40px">
              <p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.7">Pozdravljeni ${name},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.7">Veseli nas da ste se pridružili Računko. V naslednjih minutah boste imeli vse kar potrebujete za brezskrbno vodenje financ.</p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px">
                <tr><td style="background:#F7F7F5;border-radius:10px;padding:20px 24px">
                  <p style="margin:0 0 14px;font-size:12px;font-weight:500;color:#999;letter-spacing:0.06em">3 STVARI ZA ZAČETEK</p>
                  <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 12px"><tr>
                    <td width="32" valign="top"><div style="width:24px;height:24px;border-radius:50%;background:#0A3D2B;text-align:center;line-height:24px;font-size:11px;font-weight:500;color:#9FE1CB">1</div></td>
                    <td style="padding-left:10px"><p style="margin:0;font-size:13px;font-weight:500;color:#111">Nastavite podatke podjetja</p><p style="margin:2px 0 0;font-size:12px;color:#888">Naziv, davčna številka, IBAN</p></td>
                  </tr></table>
                  <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 12px"><tr>
                    <td width="32" valign="top"><div style="width:24px;height:24px;border-radius:50%;background:#0A3D2B;text-align:center;line-height:24px;font-size:11px;font-weight:500;color:#9FE1CB">2</div></td>
                    <td style="padding-left:10px"><p style="margin:0;font-size:13px;font-weight:500;color:#111">Izdajte prvi račun</p><p style="margin:2px 0 0;font-size:12px;color:#888">PDF z UPN QR kodo v 30 sekundah</p></td>
                  </tr></table>
                  <table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tr>
                    <td width="32" valign="top"><div style="width:24px;height:24px;border-radius:50%;background:#0A3D2B;text-align:center;line-height:24px;font-size:11px;font-weight:500;color:#9FE1CB">3</div></td>
                    <td style="padding-left:10px"><p style="margin:0;font-size:13px;font-weight:500;color:#111">Vprašajte AI računovodja</p><p style="margin:2px 0 0;font-size:12px;color:#888">"Koliko dohodnine bom plačal letos?"</p></td>
                  </tr></table>
                </td></tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px">
                <tr><td align="center">
                  <a href="https://xn--raunko-j2a.si/dashboard" style="display:inline-block;background:#1D9E75;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:13px 32px;border-radius:9px">Odpri Računko →</a>
                </td></tr>
              </table>
              <p style="margin:0;font-size:14px;color:#888;line-height:1.7">Vprašanja? <a href="mailto:podpora@xn--raunko-j2a.si" style="color:#1D9E75;text-decoration:none">podpora@računko.si</a></p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 0;text-align:center">
          <p style="margin:0;font-size:11px;color:#aaa">© 2026 Računko · <a href="https://xn--raunko-j2a.si/privacy" style="color:#aaa;text-decoration:none">Zasebnost</a> · <a href="https://xn--raunko-j2a.si/terms" style="color:#aaa;text-decoration:none">Pogoji</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}