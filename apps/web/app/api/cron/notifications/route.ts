import { NextRequest, NextResponse } from 'next/server'
import { escapeHtml } from '@/lib/html-escape'
import { createClient } from '@supabase/supabase-js'

// Supabase service role klient (bypass RLS za cron)
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key)
}

// Vercel cron — zaščita z secret
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const results: any[] = []

  try {
    // 1. Pridobi vse aktivne businessse
    const { data: businesses } = await supabase
      .from('businesses')
      .select('id, name, owner_user_id')

    if (!businesses || businesses.length === 0) {
      return NextResponse.json({ message: 'No businesses found', sent: 0 })
    }

    // DODANO (17.8.2026): zemljevid podatkov o podjetju/organizaciji po business_id.
    // Razdelek 2 spodaj (predracuni za podaljsanje) je v e-postni predlogi
    // uporabljal `biz` in `orgForBiz`, ceprav se zanka po podjetjih tam ze zakljuci
    // - kar je pomenilo ReferenceError in sesut cron ob vsakem podaljsanju.
    // Zdaj si kontekst shranimo tukaj in ga spodaj poiscemo po stranki.
    const bizContext = new Map<string, { biz: any; org: any }>()

    for (const biz of businesses) {
      // POPRAVLJENO (30.7.2026, audit K10): naloži PRAVE podatke
      // organizacije - prej trdo kodiran (nicelni!) IBAN in Nikovi
      // podatki podjetja v vsaki poslani e-posti.
      let orgForBiz: any = null
      if (biz.owner_user_id) {
        const { data: mem } = await supabase
          .from('org_members')
          .select('org_id')
          .eq('user_id', biz.owner_user_id)
          .maybeSingle()
        if (mem?.org_id) {
          const { data: o } = await supabase
            .from('organizations')
            .select('name, tax_number, iban, bic, email')
            .eq('id', mem.org_id)
            .maybeSingle()
          orgForBiz = o
        }
      }

      bizContext.set(biz.id, { biz, org: orgForBiz })

      // 2. Generiraj notifikacije za ta business
      await supabase.rpc('generate_pos_notifications', { p_business_id: biz.id })

      // 3. Pridobi neposlane notifikacije s customer emailom
      const { data: notifs } = await supabase
        .from('pos_notifications')
        .select(`
          id, message, severity, type, customer_id, package_id,
          customers (id, name, email, notification_email),
          customer_packages (id, expires, name, template_type, activated_at, purchased_at, remaining, template_id)
        `)
        .eq('business_id', biz.id)
        .eq('dismissed', false)
        .eq('email_sent', false)
        .in('type', ['expiring_soon', 'expired', 'low_visits'])
        .order('created_at', { ascending: false })

      if (!notifs || notifs.length === 0) continue

      for (const notif of notifs) {
        const customer = notif.customers as any
        const pkg = notif.customer_packages as any

        // Preskoči če ni emaila ali je opt-out
        if (!customer?.email || customer?.notification_email === false) {
          continue
        }

        // DODANO (16.8.2026): SAMODEJNO se poslje SAMO ENO sporocilo na stranko
        // in kartico. Brez tega bi stranka pri poteku kartice prejela vec
        // sporocil zapored (potece cez 3 dni, potece danes, potekla 1 dan
        // nazaj...), ker je vsako svoje obvestilo. Vsa nadaljnja sporocila se
        // posljejo LE ROCNO iz POS terminala, s potrditvijo.
        const { data: zeObvescena } = await supabase
          .from('pos_notifications')
          .select('id')
          .eq('customer_id', notif.customer_id)
          .eq('package_id', notif.package_id)
          .eq('email_sent', true)
          .limit(1)
        if (zeObvescena?.length) {
          results.push({
            customer: customer.name,
            package: pkg?.name,
            status: 'skipped',
            reason: 'Stranka je bila o tej kartici že samodejno obveščena — nadaljnja sporočila pošljite ročno.',
          })
          continue
        }

        // Sestavi zadevo
        // Zeton za javno podaljsanje (24.8.2026) - enaka logika kot pri rocnem
        // posiljanju iz blagajne: obstojecega ponovno uporabimo, sicer nov.
        let zetonObnove: string | null = null
        if (notif.package_id && (pkg as any)?.template_id) {
          const { data: obstojec } = await supabase
            .from('renewal_requests')
            .select('token')
            .eq('customer_package_id', notif.package_id)
            .in('status', ['pending', 'quoted'])
            .gt('expires_at', new Date().toISOString())
            .maybeSingle()

          if (obstojec?.token) {
            zetonObnove = obstojec.token
          } else {
            const nov = crypto.randomUUID().replace(/-/g, '')
            const { error: zErr } = await supabase.from('renewal_requests').insert({
              token: nov,
              business_id: biz.id,
              customer_id: notif.customer_id,
              customer_package_id: notif.package_id,
              template_id: (pkg as any).template_id,
            })
            if (!zErr) zetonObnove = nov
            else console.error('Zetona za podaljsanje ni bilo mogoce ustvariti:', zErr.message)
          }
        }

        const subject = notif.type === 'expired'
          ? `Vaša karta "${pkg?.name}" je potekla`
          : notif.type === 'low_visits'
          ? `Zmanjkuje vam obiskov — ${pkg?.name}`
          : `Vaša karta "${pkg?.name}" kmalu poteče`

        // Pošlji email
        try {
          const emailRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/email/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
            body: JSON.stringify({
              to: customer.email,
              subject,
              customerName: customer.name,
              packageName: pkg?.name || 'kartica',
              expiresAt: pkg?.expires,
              // DODANO (24.8.2026): povezava za podaljsanje in kontakt. Prej
              // ju je nosilo SAMO rocno posiljanje iz blagajne - v produkciji,
              // kjer opomnike poslje cron, gumba in kontakta ni bilo.
              orgPhone: (orgForBiz as any)?.phone ?? null,
              orgEmail: (orgForBiz as any)?.email ?? null,
              obnovaUrl: zetonObnove
                ? `${process.env.NEXT_PUBLIC_APP_URL}/obnova/${zetonObnove}`
                : null,
              // Obdobje veljavnosti in preostali obiski (22.8.2026) - da imata
              // samodejni in rocni opomnik ENAKO vsebino.
              validFrom: (pkg as any)?.activated_at ?? (pkg as any)?.purchased_at ?? null,
              remaining: (pkg as any)?.remaining ?? null,
              severity: notif.severity,
            }),
          })

          if (emailRes.ok) {
            // Označi kot poslano
            // DODANO (16.8.2026): zabelezimo tudi CAS posiljanja, da je v POS
            // terminalu vidno, kdaj je bila stranka obvescena.
            const { error: markErr } = await supabase
              .from('pos_notifications')
              .update({ email_sent: true, email_sent_at: new Date().toISOString(), read: false })
              .eq('id', notif.id)
            // POPRAVLJENO (16.8.2026): prej brez preverbe - ce se oznaka ne
            // shrani, bi stranka naslednji dan prejela ISTO sporocilo znova.
            if (markErr) console.error('Obvestilo', notif.id, 'je bilo poslano, oznake pa NI bilo mogoce shraniti - stranka lahko prejme podvojeno sporocilo:', markErr)

            results.push({
              customer: customer.name,
              email: customer.email,
              package: pkg?.name,
              status: 'sent',
            })
          } else {
            const err = await emailRes.json()
            results.push({ customer: customer.name, status: 'failed', error: err })
          }
        } catch (emailErr: any) {
          results.push({ customer: customer.name, status: 'error', error: emailErr.message })
        }

        // Rate limiting — max 2 emaila na sekundo (Resend free tier)
        await new Promise(r => setTimeout(r, 500))
      }
    }

    // ─── 2. Predračuni za ponavljajoče pakete ───────────────────
    const renewalResults: any[] = []

    const { data: expiringPkgs } = await supabase
      .from('customer_packages')
      .select(`
        id, name, expires, remaining, total, purchase_price,
        customers (id, name, email, notification_email, business_id),
        package_templates (id, name, price, validity_days, auto_renew, notify_before_days, recurring)
      `)
      .eq('active', true)
      .eq('renewal_notice_sent', false)
      .not('expires', 'is', null)

    for (const pkg of (expiringPkgs || [])) {
      const tmpl = pkg.package_templates as any
      const cust = pkg.customers as any

      // DODANO (17.8.2026): poisci podjetje/organizacijo te stranke (glej
      // bizContext zgoraj). Brez tega sta `biz` in `orgForBiz` spodaj
      // nedefinirana in cron se sesuje.
      const ctx = cust?.business_id ? bizContext.get(cust.business_id) : undefined
      const biz = ctx?.biz
      const orgForBiz = ctx?.org
      // Brez podatkov o podjetju ne moremo sestaviti verodostojne e-poste
      // (ime izdajatelja, IBAN) - raje preskocimo, kot da posljemo prazno.
      if (!biz) continue

      // Preskoči če ni recurring ali auto_renew
      if (!tmpl?.recurring && !tmpl?.auto_renew) continue
      if (!cust?.email || cust?.notification_email === false) continue

      const daysLeft = Math.floor((new Date(pkg.expires).getTime() - Date.now()) / 86400000)
      const noticeDays = tmpl?.notify_before_days || 7

      if (daysLeft > noticeDays || daysLeft < 0) continue

      // Sestavi predračun email
      const renewPrice = tmpl?.price || pkg.purchase_price || 0
      const newExpiry = new Date(pkg.expires)
      newExpiry.setDate(newExpiry.getDate() + (tmpl?.validity_days || 30))
      const proformaNum = 'PRE-' + Date.now().toString().slice(-6)

      try {
        const emailRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/email/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
          body: JSON.stringify({
            to: cust.email,
            subject: `Predračun za podaljšanje: ${pkg.name}`,
            customerName: cust.name,
            html: `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#fff">
              <div style="text-align:center;margin-bottom:28px">
                <div style="font-size:22px;font-weight:800;color:#0d2818">${escapeHtml(biz.name)}</div>

              </div>
              <h2 style="color:#0d2818">Vaša kartica poteče čez ${daysLeft} dni</h2>
              <p style="color:#444;font-size:15px">Spoštovani/a <strong>${cust.name}</strong>,</p>
              <p style="color:#444;font-size:15px">Vaša kartica <strong>${pkg.name}</strong> poteče dne <strong>${new Date(pkg.expires).toLocaleDateString('sl-SI')}</strong>.</p>
              <div style="background:#f4efe5;border-radius:12px;padding:20px 24px;margin:20px 0">
                <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">PREDRAČUN ZA PODALJŠANJE</div>
                <div style="font-size:18px;font-weight:800;color:#0d2818;margin-bottom:12px">${tmpl?.name || pkg.name}</div>
                <table style="width:100%;font-size:14px;color:#444">
                  <tr><td style="padding:4px 0;color:#666">Znesek:</td><td style="text-align:right;font-weight:700">€${Number(renewPrice).toFixed(2).replace('.',',')}</td></tr>
                  ${tmpl?.validity_days ? `<tr><td style="padding:4px 0;color:#666">Veljavnost:</td><td style="text-align:right;font-weight:700">${tmpl.validity_days} dni</td></tr>` : ''}
                  <tr><td style="padding:4px 0;color:#666">Nova veljavnost do:</td><td style="text-align:right;font-weight:700">${newExpiry.toLocaleDateString('sl-SI')}</td></tr>
                  <tr style="border-top:1px solid #e5e1d8"><td style="padding:8px 0 4px;font-weight:700">SKUPAJ:</td><td style="text-align:right;font-weight:800;font-size:16px">€${Number(renewPrice).toFixed(2).replace('.',',')}</td></tr>
                </table>
              </div>
              <div style="background:#fff;border:1px solid #e5e1d8;border-radius:10px;padding:16px 20px;margin:16px 0">
                <div style="font-size:13px;font-weight:700;color:#0d2818;margin-bottom:8px">Plačilni podatki</div>
                <div style="font-size:13px;color:#444;line-height:1.8">
                  <div>IBAN: <strong>${orgForBiz?.iban || '(IBAN ni nastavljen — dopolnite v Nastavitvah)'}</strong></div>
                  ${orgForBiz?.bic ? `<div>BIC/SWIFT: <strong>${orgForBiz.bic}</strong></div>` : ''}
                  <div>Referenca: <strong>${proformaNum}</strong></div>
                  <div>Namen: Podaljšanje — ${pkg.name}</div>
                </div>
              </div>
              <p style="color:#888;font-size:13px">Po prejemu plačila vam bomo podaljšali kartico in poslali potrdilo. Predračun ni davčno potrjen račun.</p>
              ${orgForBiz?.email ? `<p style="color:#444;font-size:14px">Za vprašanja nas kontaktirajte na <a href="mailto:${orgForBiz.email}" style="color:#1f6b3a">${orgForBiz.email}</a>.</p>` : ''}
              <div style="border-top:1px solid #e5e1d8;margin-top:28px;padding-top:16px;text-align:center;font-size:12px;color:#999">
                ${orgForBiz?.name || biz.name}${orgForBiz?.tax_number ? ` · Davčna: ${orgForBiz.tax_number}` : ''}<br/>
                Izdano s sistemom RAČUNKO · www.racunko.si
              </div>
            </div>`,
          }),
        })

        if (emailRes.ok) {
          // Označi da je predračun poslan
          await supabase
            .from('customer_packages')
            .update({ renewal_notice_sent: true })
            .eq('id', pkg.id)

          renewalResults.push({ customer: cust.name, package: pkg.name, daysLeft, status: 'sent' })
        } else {
          renewalResults.push({ customer: cust.name, package: pkg.name, status: 'failed' })
        }
      } catch (e: any) {
        renewalResults.push({ customer: cust.name, status: 'error', error: e.message })
      }

      await new Promise(r => setTimeout(r, 500))
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      sent: results.filter(r => r.status === 'sent').length,
      failed: results.filter(r => r.status !== 'sent').length,
      renewals_sent: renewalResults.filter(r => r.status === 'sent').length,
      details: results,
      renewal_details: renewalResults,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
