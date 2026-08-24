import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { FROM_EMAIL } from '@/lib/resend'
import { renderToBuffer } from '@react-pdf/renderer'
import { InvoicePDF, generateUpnQr } from '@/lib/invoice-pdf'
import { buildInvoiceEmailHtml } from '@/lib/invoice-email'
import { lokalniDatum } from '@/lib/tax-constants'

/**
 * POTRDITEV PLACILA PODALJSANJA (24.8.2026) — korak 4.
 *
 * Ko lastnik potrdi, da je placilo predracuna prispelo:
 *   1. izda se RACUN (issued_invoices) in poslje stranki s PDF in QR
 *   2. kartica se PODALJSA
 *   3. obvestilo o izteku se opusti, da ne visi naprej
 *
 * ZACETEK NOVEGA OBDOBJA: dan PO izteku stare kartice.
 * Ce kartica velja do 22., novo obdobje tece od 23. Tako clan ne izgubi dni,
 * ki jih je placal, in med obdobjema ni luknje. Ce je stara ze potekla,
 * novo obdobje tece od danes.
 */

function sluzbeni() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  // Potrjuje LASTNIK, zato zahtevamo prijavo - to ni javna pot.
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Neprijavljen uporabnik' }, { status: 401 })

  const { zahtevekId } = await req.json()
  if (!zahtevekId) return NextResponse.json({ error: 'Manjka zahtevek' }, { status: 400 })

  const db = sluzbeni()

  const { data: z } = await db
    .from('renewal_requests')
    .select(`
      id, status, business_id, customer_id, customer_package_id, quote_id, invoice_id,
      customers (name, email),
      customer_packages (id, name, expires, remaining, template_id),
      quotes (quote_number, amount_net, vat_amount, amount_total, line_items)
    `)
    .eq('id', zahtevekId)
    .maybeSingle()

  if (!z) return NextResponse.json({ error: 'Zahtevek ni najden' }, { status: 404 })
  if (z.status === 'paid') {
    return NextResponse.json({ error: 'To podaljšanje je že potrjeno.' }, { status: 409 })
  }
  if (!z.quote_id) {
    return NextResponse.json({ error: 'Za ta zahtevek še ni predračuna.' }, { status: 409 })
  }

  // Pravice: uporabnik mora biti lastnik te blagajne.
  const { data: biz } = await db
    .from('businesses').select('owner_user_id').eq('id', z.business_id).maybeSingle()
  if (biz?.owner_user_id !== user.id) {
    return NextResponse.json({ error: 'Za to dejanje nimate pravic' }, { status: 403 })
  }

  const { data: mem } = await db
    .from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const { data: org } = await db
    .from('organizations').select('*').eq('id', mem!.org_id).maybeSingle()

  const stranka: any = z.customers
  const kartica: any = z.customer_packages
  const predracun: any = z.quotes

  // ─── 1. Izdaj racun ──────────────────────────────────────────────────
  const leto = new Date().getFullYear()
  const { data: zadnji } = await db.from('issued_invoices')
    .select('invoice_number').eq('org_id', org!.id)
    .like('invoice_number', `${leto}-%`)
    .order('invoice_number', { ascending: false }).limit(1)

  const zaporedna = zadnji?.[0]
    ? Number(String(zadnji[0].invoice_number).split('-')[1] || 0) + 1
    : 1
  const stevilka = `${leto}-${String(zaporedna).padStart(3, '0')}`

  const { data: racun, error: rErr } = await db.from('issued_invoices').insert({
    org_id: org!.id,
    invoice_number: stevilka,
    client_name: stranka?.name ?? '',
    client_email: stranka?.email ?? null,
    issue_date: lokalniDatum(),
    service_date: lokalniDatum(),
    due_date: lokalniDatum(),
    line_items: predracun?.line_items ?? [],
    amount_net: predracun?.amount_net ?? 0,
    vat_amount: predracun?.vat_amount ?? 0,
    amount_total: predracun?.amount_total ?? 0,
    status: 'paid',
    reference: `SI00 ${stevilka}`,
    notes: `Podaljšanje kartice. Predračun ${predracun?.quote_number ?? ''}.`,
  }).select('*').single()

  if (rErr) {
    console.error('Racuna ni bilo mogoce izdati:', rErr.message)
    return NextResponse.json({ error: 'Računa ni bilo mogoče izdati: ' + rErr.message }, { status: 500 })
  }

  // ─── 2. Podaljsaj kartico ────────────────────────────────────────────
  //
  // Novo obdobje se zacne DAN PO izteku stare. Ce kartica velja do 22.,
  // novo obdobje tece od 23. - clan ne izgubi placanih dni, luknje pa ni.
  const { data: predloga } = kartica?.template_id
    ? await db.from('package_templates')
        .select('validity_days, visits').eq('id', kartica.template_id).maybeSingle()
    : { data: null as any }

  const danes = new Date(); danes.setHours(0, 0, 0, 0)
  const staroPotece = kartica?.expires ? new Date(kartica.expires) : null
  if (staroPotece) staroPotece.setHours(0, 0, 0, 0)

  const zacetek = (staroPotece && staroPotece.getTime() >= danes.getTime())
    ? new Date(staroPotece.getTime() + 86400000)   // dan PO izteku
    : new Date(danes)                              // ze potekla -> od danes

  const dni = Number(predloga?.validity_days ?? 30)
  const noviPotek = new Date(zacetek.getTime() + (dni - 1) * 86400000)

  const posodobitve: any = { expires: lokalniDatum(noviPotek), active: true }
  // Pri kartah obiskov se novi obiski PRISTEJEJO - stranka jih je placala.
  if (kartica?.remaining !== null && kartica?.remaining !== undefined && predloga?.visits) {
    posodobitve.remaining = Number(kartica.remaining) + Number(predloga.visits)
  }

  const { error: kErr } = await db.from('customer_packages')
    .update(posodobitve).eq('id', z.customer_package_id)
  if (kErr) {
    console.error('Kartice ni bilo mogoce podaljsati:', kErr.message)
    return NextResponse.json({
      error: 'Račun je izdan, kartice pa NI bilo mogoče podaljšati: ' + kErr.message,
    }, { status: 500 })
  }

  // ─── 3. Poslji racun stranki ─────────────────────────────────────────
  let poslano = false
  let napakaPoste: string | null = null
  if (stranka?.email && process.env.RESEND_API_KEY) {
    try {
      const qr = await generateUpnQr(racun, org)
      const pdf = await renderToBuffer(InvoicePDF({ invoice: racun, org, qrDataUrl: qr }) as any)
      const html = buildInvoiceEmailHtml({
        orgName: org!.name,
        invoiceNumber: racun.invoice_number,
        issueDate: racun.issue_date,
        amount: Number(racun.amount_total),
        dueDate: racun.due_date,
        iban: org!.iban ?? null,
        reference: racun.reference ?? null,
        qrCid: qr ? 'upnqr' : null,
        customMessage: `Kartica „${kartica?.name ?? ''}" je podaljšana do ${new Date(posodobitve.expires).toLocaleDateString('sl-SI')}. Hvala za zaupanje.`,
      })

      const resend = new Resend(process.env.RESEND_API_KEY)
      const { data: rd, error: reErr } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [stranka.email],
        subject: `Račun ${racun.invoice_number} — kartica je podaljšana`,
        html,
        attachments: [
          { filename: `racun-${racun.invoice_number}.pdf`, content: pdf },
          ...(qr ? [{
            filename: 'upnqr.png',
            content: Buffer.from(qr.split(',')[1] || '', 'base64'),
            contentId: 'upnqr',
          }] : []),
        ],
      } as any)

      await db.from('invoice_emails').insert({
        invoice_id: racun.id,
        org_id: org!.id,
        to_email: stranka.email,
        subject: `Račun ${racun.invoice_number} — kartica je podaljšana`,
        message: 'Samodejno poslan račun ob potrditvi podaljšanja',
        status: reErr ? 'failed' : 'sent',
        resend_email_id: (rd as any)?.id ?? null,
        error_message: reErr ? String(reErr.message) : null,
        sent_at: reErr ? null : new Date().toISOString(),
      })

      if (reErr) napakaPoste = String(reErr.message)
      else poslano = true
    } catch (e: any) {
      napakaPoste = e?.message || String(e)
      console.error('Racuna ni bilo mogoce poslati:', napakaPoste)
    }
  }

  // ─── 4. Zakljuci zahtevek in opusti obvestilo ────────────────────────
  await db.from('renewal_requests').update({
    status: 'paid',
    invoice_id: racun.id,
    paid_at: new Date().toISOString(),
  }).eq('id', z.id)

  // Obvestilo o izteku ne sme viseti naprej - kartica je podaljsana.
  await db.from('pos_notifications')
    .update({ dismissed: true })
    .eq('package_id', z.customer_package_id)
    .in('type', ['expiring_soon', 'expired'])

  return NextResponse.json({
    ok: true,
    stevilka: racun.invoice_number,
    veljaDo: posodobitve.expires,
    poslano,
    napakaPoste,
  })
}
