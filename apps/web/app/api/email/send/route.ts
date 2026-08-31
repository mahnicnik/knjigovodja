import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { FROM_EMAIL } from '@/lib/resend'
import { escapeHtml } from '@/lib/html-escape'

// POPRAVLJENO (audit 23.7.2026): endpoint je bil ODPRT RELAY - poljuben
// poslji {to, subject, html} brez avtorizacije. Zdaj zahteva ALI prijavljeno
// uporabnisko sejo (klic iz pos/page.tsx) ALI pravilen CRON_SECRET
// (interni klic iz cron/notifications/route.ts).
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return !!user
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAuthorized(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { to, subject, html, customerName, packageName, expiresAt, validFrom, remaining, severity, orgPhone, orgEmail, obnovaUrl, unsubscribeToken } = await req.json()

    if (!to || !subject) {
      return NextResponse.json({ error: 'Manjka prejemnik ali zadeva' }, { status: 400 })
    }

    // DODANO (17.8.2026): preverba oblike e-naslova. Prej se je preverjalo samo,
    // da naslov OBSTAJA - napacno vnesen naslov je sel v posiljanje in tam
    // spodletel, uporabnik pa je videl le splosno napako ponudnika. Zdaj se
    // ustavi prej, s sporocilom, ki pove, kaj je narobe.
    const naslovi = String(to).split(',').map(s => s.trim()).filter(Boolean)
    const neveljavni = naslovi.filter(a => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a))
    if (naslovi.length === 0 || neveljavni.length > 0) {
      return NextResponse.json({
        error: neveljavni.length
          ? `Neveljaven e-naslov: ${neveljavni.join(', ')}`
          : 'Manjka prejemnik',
      }, { status: 400 })
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
    }

    // Sestavi HTML email
    const emailHtml = html || buildEmailTemplate({ customerName, packageName, expiresAt, validFrom, remaining, severity, orgPhone, orgEmail, obnovaUrl })

    const res = await fetch('https://api.resend.com/emails', {
      // POPRAVLJENO (17.8.2026): casovna omejitev - brez nje zahteva ob
      // neodzivni storitvi visi, dokler je streznik sam ne prekine.
      signal: AbortSignal.timeout(15000),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // POPRAVLJENO (22.8.2026): trdo zapisan `noreply@racunko.si` z domeno,
        // ki pri Resendu ni preverjena - posiljanje je bilo zavrnjeno. Ostala
        // aplikacija ze uporablja skupno konstanto FROM_EMAIL
        // ('racuni@xn--raunko-j2a.si'), zato jo uporabimo tudi tu. Obrocni
        // racun je zato prisel, opomnik stranki pa ne.
        // POPRAVLJENO (22.8.2026): `RESEND_FROM_EMAIL` iz okolja je PREVLADAL
        // nad skupno konstanto. V Vercelu je nastavljen na domeno
        // `racunko.si`, ki pri Resendu NI preverjena - posiljanje je bilo
        // zavrnjeno z "The racunko.si domain is not verified".
        // Uporabljamo isti naslov kot preostala aplikacija, ki dokazano dela
        // (obrocni racun je prisel).
        from: FROM_EMAIL,
        to: [to],
        subject,
        html: emailHtml,
        // ── DOSTAVLJIVOST (prelet 167) ────────────────────────────────
        //
        // 1. BESEDILNA RAZLICICA. Sporocilo samo v HTML je klasicen znak
        //    vsiljene poste - pravi posiljatelji skoraj vedno prilozijo tudi
        //    golo besedilo. Resend ga sam ne naredi, zato ga sestavimo iz
        //    HTML: odstranimo oznake, povezave pustimo kot naslov v oklepaju.
        text: emailHtml
          .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/(p|div|tr|h1|h2|h3)>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/\n{3,}/g, '\n\n')
          .split('\n').map((v: string) => v.trim()).join('\n').trim(),
        // 2. ODGOVOR NA PRAVI NASLOV. Posiljatelj, na katerega ni mogoce
        //    odgovoriti, dobi slabso oceno - in odgovori strank se izgubijo.
        ...(orgEmail ? { reply_to: orgEmail } : {}),
        // 3. ODJAVA Z ENIM KLIKOM. Gmail in Yahoo od februarja 2024 za
        //    mnozicno posto zahtevata glavo `List-Unsubscribe`; brez nje
        //    sporocila pogosteje koncajo med vsiljenimi. Mehanizem ze
        //    obstaja (customers.unsubscribe_token in stran /odjava/),
        //    uporabljale pa so ga doslej samo rojstnodnevne cestitke.
        ...(unsubscribeToken ? {
          headers: {
            'List-Unsubscribe': `<${process.env.NEXT_PUBLIC_APP_URL || 'https://xn--raunko-j2a.si'}/odjava/${unsubscribeToken}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        } : {}),
      }),
    })

    if (!res.ok) {
      // POPRAVLJENO (22.8.2026): vracali smo CELOTEN predmet napake od Resenda.
      // Odjemalec ga je vstavil v `new Error(...)`, kar je dalo besedilo
      // "[object Object]" - uporabnik je videl, da posiljanje ni uspelo, ne pa
      // ZAKAJ. Zdaj izluscimo berljivo sporocilo in ga zabelezimo v dnevnik.
      const err = await res.json().catch(() => ({}))
      const sporocilo =
        (typeof err?.message === 'string' && err.message) ||
        (typeof err?.error === 'string' && err.error) ||
        (typeof err?.error?.message === 'string' && err.error.message) ||
        (typeof err?.name === 'string' && err.name) ||
        `Resend je zavrnil sporočilo (HTTP ${res.status})`
      console.error('Resend napaka:', JSON.stringify(err))
      return NextResponse.json({ error: sporocilo, podrobnosti: err }, { status: 500 })
    }

    const data = await res.json()
    return NextResponse.json({ success: true, id: data.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ================================================================
// EMAIL TEMPLATE
// ================================================================
function buildEmailTemplate({ customerName, packageName, expiresAt, validFrom, remaining, severity, orgPhone, orgEmail, obnovaUrl }: {
  customerName: string
  packageName: string
  validFrom?: string | null
  remaining?: number | null
  orgPhone?: string | null
  orgEmail?: string | null
  obnovaUrl?: string | null
  expiresAt: string
  severity: 'warning' | 'danger' | 'info'
}) {
  const colors = {
    warning: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', icon: '⚠️' },
    danger:  { bg: '#fee2e2', border: '#ef4444', text: '#7f1d1d', icon: '🔴' },
    info:    { bg: '#dbeafe', border: '#3b82f6', text: '#1e3a8a', icon: 'ℹ️' },
  }
  const c = colors[severity] || colors.warning
  const dateStr = expiresAt ? new Date(expiresAt).toLocaleDateString('sl-SI', { day:'numeric', month:'long', year:'numeric' }) : ''
  const odStr = validFrom ? new Date(validFrom).toLocaleDateString('sl-SI', { day:'numeric', month:'long', year:'numeric' }) : ''
  const preostaliObiski = (remaining === null || remaining === undefined) ? null : Number(remaining)

  return `
<!DOCTYPE html>
<html lang="sl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(String(packageName || 'Obvestilo'))} — obvestilo</title>
</head>
<body style="margin:0;padding:0;background:#f4efe5;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4efe5;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#0d2818;border-radius:12px 12px 0 0;padding:24px 32px;text-align:center;">
            <div style="display:inline-flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;background:#e9b949;border-radius:8px;display:inline-block;line-height:36px;text-align:center;font-weight:800;font-size:18px;color:#0d2818;">R</div>
              <span style="color:#f6f1e8;font-size:18px;font-weight:700;vertical-align:middle;">Računko</span>
            </div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:32px 32px 24px;">
            <p style="margin:0 0 8px;font-size:15px;color:#6b6962;">Spoštovani/a,</p>
            <h1 style="margin:0 0 24px;font-size:24px;font-weight:800;color:#1a1f1a;">
              ${customerName ? customerName + ',' : ''} vaša karta poteče kmalu
            </h1>

            <!-- Alert box -->
            <div style="background:${c.bg};border:1.5px solid ${c.border};border-radius:10px;padding:16px 20px;margin-bottom:24px;">
              <p style="margin:0;font-size:15px;font-weight:600;color:${c.text};">
                ${c.icon}&nbsp; <strong>${escapeHtml(String(packageName || ''))}</strong>
                ${dateStr ? `poteče <strong>${dateStr}</strong>` : 'kmalu poteče'}
              </p>

              <!-- DODANO (22.8.2026): OBDOBJE VELJAVNOSTI. Prej je bil naveden
                   samo datum poteka - stranka ni videla, od kdaj karta velja
                   in koliko obiskov ji je ostalo. -->
              ${(odStr || preostaliObiski !== null) ? `
              <table role="presentation" style="border-collapse:collapse;margin-top:12px;">
                ${odStr ? `
                <tr>
                  <td style="font-size:13px;color:${c.text};opacity:.85;padding:2px 12px 2px 0;">Velja:</td>
                  <td style="font-size:13px;color:${c.text};font-weight:600;padding:2px 0;">${odStr} – ${dateStr}</td>
                </tr>` : ''}
                ${preostaliObiski !== null ? `
                <tr>
                  <td style="font-size:13px;color:${c.text};opacity:.85;padding:2px 12px 2px 0;">Preostali obiski:</td>
                  <td style="font-size:13px;color:${c.text};font-weight:600;padding:2px 0;">${preostaliObiski}</td>
                </tr>` : ''}
              </table>` : ''}
            </div>

            <p style="margin:0 0 24px;font-size:14px;color:#6b6962;line-height:1.6;">
              Da ne bi izgubili dostopa do svojih ugodnosti, vas vabimo, da kartico obnovite pri nas.
              Naš tim vam bo z veseljem pomagal pri podaljšanju ali nadgradnji paketa.
            </p>

            <!-- POPRAVLJENO (22.8.2026): gumb je imel href="#" in ni vodil
                 NIKAMOR - stranka je kliknila, mislila, da je uredila, in se
                 ni zgodilo nic. Zdaj vodi na javno stran, kjer si sama naroci
                 predracun; ce te poti ni, ponudimo klic ali odgovor. -->
            ${obnovaUrl ? `
            <div style="text-align:center;margin-bottom:16px;">
              <a href="${escapeHtml(String(obnovaUrl))}"
                 style="display:inline-block;background:#1f6b3a;color:#ffffff;padding:14px 32px;border-radius:9px;text-decoration:none;font-weight:700;font-size:15px;">
                Podaljšaj kartico
              </a>
              <div style="font-size:12px;color:#8a8880;margin-top:8px;">
                Predračun prejmete takoj, kartico podaljšamo po plačilu.
              </div>
            </div>` : ''}

            ${(orgPhone || orgEmail) ? `
            <div style="text-align:center;margin-bottom:24px;">
              ${orgPhone ? `
              <a href="tel:${escapeHtml(String(orgPhone).replace(/\s/g, ''))}"
                 style="display:inline-block;background:${obnovaUrl ? '#ffffff' : '#1f6b3a'};color:${obnovaUrl ? '#1f6b3a' : '#ffffff'};${obnovaUrl ? 'border:1.5px solid #1f6b3a;padding:12px 28px;' : 'padding:14px 32px;'}border-radius:9px;text-decoration:none;font-weight:700;font-size:15px;margin:0 4px 8px;">
                Pokličite ${escapeHtml(String(orgPhone))}
              </a>` : ''}
              ${orgEmail ? `
              <a href="mailto:${escapeHtml(String(orgEmail))}?subject=${encodeURIComponent('Podaljšanje kartice')}"
                 style="display:inline-block;background:#ffffff;color:#1f6b3a;border:1.5px solid #1f6b3a;padding:12px 28px;border-radius:9px;text-decoration:none;font-weight:700;font-size:15px;margin:0 4px 8px;">
                Pišite nam
              </a>` : ''}
            </div>` : ''}

            <p style="margin:0;font-size:13px;color:#9a9890;text-align:center;line-height:1.5;">
              ${(orgPhone || orgEmail)
                ? `Imate vprašanja? ${orgPhone ? escapeHtml(String(orgPhone)) : ''}${(orgPhone && orgEmail) ? ' · ' : ''}${orgEmail ? escapeHtml(String(orgEmail)) : ''}`
                : 'Imate vprašanja? Oglasite se pri nas.'}<br>
              To sporočilo je bilo samodejno poslano prek sistema Računko.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f4efe5;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;border-top:1px solid #e5e1d8;">
            <p style="margin:0;font-size:12px;color:#9a9890;">
              © ${new Date().getFullYear()} Računko · Davčna blagajna za storitve
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
  `.trim()
}
