import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { lokalniDatum } from '@/lib/tax-constants'
import { Resend } from 'resend'
import { FROM_EMAIL } from '@/lib/resend'
import { renderToBuffer } from '@react-pdf/renderer'
import { InvoicePDF, generateUpnQr } from '@/lib/invoice-pdf'
import { buildInvoiceEmailHtml } from '@/lib/invoice-email'

/**
 * JAVNO PODALJŠANJE KARTICE (22.8.2026)
 *
 * Stranka pride sem iz opomnika, BREZ racuna v aplikaciji. Zato tece prek
 * sluzbenega kljuca, dostop pa varuje ZETON: enkraten, vezan na eno kartico
 * in s potekom.
 *
 * GET  — vrne, kaj se podaljsuje (samo BERE, nic ne ustvari)
 * POST — ustvari predracun in ga poslje stranki
 *
 * Locitev je namerna: Gmail in protivirusni programi vsako povezavo
 * PREDHODNO ODPREJO, da preverijo varnost. Ce bi GET ustvaril predracun, bi
 * ti nastajali sami od sebe, brez stranke.
 */

function sluzbeniOdjemalec() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/** Skupno branje zahtevka; vrne null, ce zeton ni veljaven. */
async function preberiZahtevek(token: string) {
  const db = sluzbeniOdjemalec()
  const { data } = await db
    .from('renewal_requests')
    .select(`
      id, token, status, expires_at, business_id, customer_id, customer_package_id, template_id, quote_id,
      customers (name, email),
      customer_packages (name, expires, remaining, total, activation_type),
      package_templates (id, name, price, vat_rate, validity_days, visits, vat_exemption_code)
    `)
    .eq('token', token)
    .maybeSingle()

  if (!data) return null
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return { ...data, status: 'expired' }
  }
  return data
}

/** Organizacija, ki stoji za blagajno (za podatke na predracunu). */
async function orgZaBlagajno(businessId: string) {
  const db = sluzbeniOdjemalec()
  const { data: biz } = await db
    .from('businesses').select('owner_user_id, name').eq('id', businessId).maybeSingle()
  if (!biz?.owner_user_id) return null
  // POPRAVLJENO (26.8.2026): `maybeSingle()` vrne NULL, ce je lastnik clan
  // VEC organizacij - javna stran bi takrat pokazala prazen naziv brez IBAN-a,
  // stranka pa ne bi imela kam nakazati. Isto past sem ze popravil v
  // `potrdi-placilo`, tu je ostala.
  //
  // Vzamemo organizacijo, ki ji pripada TA blagajna; ce te povezave ni,
  // najstarejso, kar ustreza pricakovanju "moja glavna dejavnost".
  const { data: clanstva } = await db
    .from('org_members').select('org_id').eq('user_id', biz.owner_user_id)
  const orgIdi = (clanstva || []).map((m: any) => m.org_id)
  if (orgIdi.length === 0) return null

  const { data: povezana } = await db
    .from('organizations').select('*')
    .in('id', orgIdi).eq('pos_business_id', businessId).maybeSingle()
  if (povezana) return povezana

  const { data: org } = await db
    .from('organizations').select('*')
    .in('id', orgIdi).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return org
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const z = await preberiZahtevek(token)

  if (!z) {
    return NextResponse.json({ napaka: 'neveljavna_povezava' }, { status: 404 })
  }
  if (z.status === 'expired') {
    return NextResponse.json({ napaka: 'potekla_povezava' }, { status: 410 })
  }

  const org = await orgZaBlagajno(z.business_id)
  const tmpl: any = z.package_templates
  const kartica: any = z.customer_packages

  // POPRAVLJENO (24.8.2026): ob osvezitvi strani so podatki za placilo
  // IZGINILI - stran je pokazala le "predracun je ze izdan", brez stevilke,
  // zneska, IBAN-a in sklica. Stranka jih ni imela od kod dobiti.
  let placilo: any = null
  if (z.quote_id) {
    const db2 = sluzbeniOdjemalec()
    const { data: q } = await db2.from('quotes')
      .select('quote_number, amount_total, valid_until').eq('id', z.quote_id).maybeSingle()
    if (q) {
      // DODANO (26.8.2026): ali je bil predracun DEJANSKO poslan. Prej tega
      // GET ni vrnil, stran pa je vsako vrednost razen `false` stela kot
      // uspeh - ob osvezitvi je trdila, da je bil poslan, cetudi ni bil.
      const { data: posta } = await db2.from('invoice_emails')
        .select('status').eq('quote_id', z.quote_id).order('id', { ascending: false }).limit(1)
      const stanjePoste = posta?.[0]?.status
      placilo = {
        poslano: stanjePoste === 'sent' ? true : stanjePoste === 'failed' ? false : null,
        stevilka: q.quote_number,
        znesek: Number(q.amount_total || 0),
        iban: org?.iban ?? null,
        sklic: `SI00 ${q.quote_number}`,
        veljaDo: q.valid_until,
      }
    }
  }

  // Novo obdobje po ISTEM pravilu kot potrditev placila: zacne se dan PO
  // izteku stare kartice, ce ta se velja, sicer od danes (24.8.2026).
  let novoObdobje: { od: string; do: string } | null = null
  if (tmpl?.validity_days) {
    const danes = new Date(); danes.setHours(0, 0, 0, 0)
    const staro = kartica?.expires ? new Date(kartica.expires) : null
    if (staro) staro.setHours(0, 0, 0, 0)
    const zac = (staro && staro.getTime() >= danes.getTime())
      ? new Date(staro.getTime() + 86400000)
      : new Date(danes)
    const kon = new Date(zac.getTime() + (Number(tmpl.validity_days) - 1) * 86400000)
    novoObdobje = { od: lokalniDatum(zac), do: lokalniDatum(kon) }
  }

  return NextResponse.json({
    status: z.status,
    placilo,
    novoObdobje,
    stranka: (z.customers as any)?.name ?? '',
    paket: tmpl?.name ?? kartica?.name ?? 'Kartica',
    cena: Number(tmpl?.price ?? 0),
    veljavnostDni: tmpl?.validity_days ?? null,
    obiski: tmpl?.visits ?? null,
    trenutnoPotece: kartica?.expires ?? null,
    podjetje: {
      naziv: org?.name ?? '',
      telefon: org?.phone ?? null,
      email: org?.email ?? null,
      imaIban: !!(org?.iban || '').trim(),
    },
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const db = sluzbeniOdjemalec()
  const z = await preberiZahtevek(token)

  if (!z) return NextResponse.json({ napaka: 'neveljavna_povezava' }, { status: 404 })
  if (z.status === 'expired') return NextResponse.json({ napaka: 'potekla_povezava' }, { status: 410 })

  // Ce je predracun ze ustvarjen, ga NE podvojimo - stranka je morda dvakrat
  // kliknila ali osvezila stran.
  if (z.status !== 'pending' && z.quote_id) {
    return NextResponse.json({ ze_ustvarjen: true, status: z.status })
  }

  const org = await orgZaBlagajno(z.business_id)
  if (!org) return NextResponse.json({ napaka: 'organizacija_ni_najdena' }, { status: 500 })
  if (!(org.iban || '').trim()) {
    // Brez IBAN-a je predracun neuporaben - stranka nima kam nakazati.
    return NextResponse.json({ napaka: 'manjka_iban' }, { status: 409 })
  }

  const tmpl: any = z.package_templates
  const stranka: any = z.customers
  const cena = Number(tmpl?.price ?? 0)

  // VAROVALKA (24.8.2026): predracuna za 0 EUR SPLOH NE ustvarimo.
  //
  // Prej je varovalka obstajala samo pri potrditvi placila - torej sele, ko je
  // stranka ze prejela nesmiseln dokument s PDF prilogo in QR kodo za 0 EUR.
  // Cena 0 pomeni, da kartica nima predloge paketa; to je napaka na nasi
  // strani, zato stranki povemo vljudno in je ne obremenimo z njo.
  if (!(cena > 0)) {
    console.error('Predracun ni ustvarjen: paket nima cene (zahtevek ' + z.id + ')')
    return NextResponse.json({ napaka: 'paket_brez_cene' }, { status: 409 })
  }
  const stopnja = Number(tmpl?.vat_rate ?? 22)
  const osnova = stopnja > 0 ? cena / (1 + stopnja / 100) : cena
  const ddv = cena - osnova

  // Zaporedna stevilka predracuna
  const leto = new Date().getFullYear()
  const { count } = await db.from('quotes')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', org.id).like('quote_number', `PRE-${leto}-%`)
  const stevilka = `PRE-${leto}-${String((count || 0) + 1).padStart(3, '0')}`

  const veljaDo = new Date()
  veljaDo.setDate(veljaDo.getDate() + 8)

  const { data: predracun, error: qErr } = await db.from('quotes').insert({
    org_id: org.id,
    quote_number: stevilka,
    client_name: stranka?.name ?? '',
    client_email: stranka?.email ?? null,
    issue_date: lokalniDatum(),
    valid_until: lokalniDatum(veljaDo),
    line_items: [{
      description: `Podaljšanje: ${tmpl?.name ?? 'kartica'}`,
      // POPRAVLJENO (25.8.2026): osnova se je zaokrozila na 2 decimalki, iz nje pa
      // je urejanje racuna preracunalo DDV in dobilo CENT VEC: 36,89 x 1,22 = 45,01,
      // medtem ko seznam in PDF kazeta 45,00. Na davcnem dokumentu je cent razlike
      // dovolj, da se knjiga ne izide.
      //
      // Osnovo zato hranimo na 4 decimalke (36,8852). Vsota se zaokrozi sele na
      // koncu, kar je obicajna praksa: cene postavk smejo imeti vec decimalk,
      // skupni zneski pa so na dve.
      quantity: 1,
      unit_price: Math.round(osnova * 10000) / 10000,
      vat_rate: stopnja,
    }],
    amount_net: Math.round(osnova * 10000) / 10000,
    vat_amount: Math.round(ddv * 100) / 100,
    amount_total: cena,
    status: 'sent',
    notes: 'Predračun za podaljšanje kartice, ustvarjen na zahtevo stranke.',
  }).select('id, quote_number').single()

  if (qErr) {
    console.error('Predracuna ni bilo mogoce ustvariti:', qErr.message)
    return NextResponse.json({ napaka: 'predracun_ni_uspel' }, { status: 500 })
  }

  await db.from('renewal_requests').update({
    status: 'quoted',
    quote_id: predracun.id,
    quoted_at: new Date().toISOString(),
  }).eq('id', z.id)

  // Obvestilo lastniku pod zvoncem - da ve, da nekdo caka na placilo.
  await db.from('pos_notifications').insert({
    business_id: z.business_id,
    customer_id: z.customer_id,
    package_id: z.customer_package_id,
    type: 'expiring_soon',
    severity: 'info',
    message: `${stranka?.name ?? 'Stranka'} želi podaljšati ${tmpl?.name ?? 'kartico'} — izdan predračun ${predracun.quote_number}`,
  })

  // DODANO (24.8.2026): predracun POSLJEMO stranki. Stran je obljubljala
  // "predracun vam posljemo takoj", klica pa ni bilo nikjer - stranka je
  // dobila samo zapis v aplikaciji, ki ga sama ne vidi.
  let poslano = false
  let qrZaStran: string | null = null   // D3: koda tudi na javni strani
  if (stranka?.email && process.env.RESEND_API_KEY) {
    try {
      const zaPdf = {
        invoice_number: predracun.quote_number,
        issue_date: lokalniDatum(),
        due_date: lokalniDatum(veljaDo),
        service_date: lokalniDatum(veljaDo),
        client_name: stranka.name ?? '',
        line_items: [{
          description: `Podaljšanje: ${tmpl?.name ?? 'kartica'}`,
          quantity: 1,
          unit_price: Math.round(osnova * 10000) / 10000,
          vat_rate: stopnja,
        }],
        amount_net: Math.round(osnova * 10000) / 10000,
        vat_amount: Math.round(ddv * 100) / 100,
        amount_total: cena,
        reference: `SI00 ${predracun.quote_number}`,
        is_quote: true,
      }
      const qr = await generateUpnQr(zaPdf, org)
      const pdf = await renderToBuffer(InvoicePDF({ invoice: zaPdf, org, qrDataUrl: qr }) as any)
      const html = buildInvoiceEmailHtml({
        orgName: org.name,
        invoiceNumber: predracun.quote_number,
        issueDate: zaPdf.issue_date,
        amount: cena,
        dueDate: zaPdf.due_date,
        iban: org.iban ?? null,
        reference: zaPdf.reference,
        qrCid: qr ? 'upnqr' : null,
        customMessage: `Predračun za podaljšanje kartice „${tmpl?.name ?? ''}". Kartico podaljšamo takoj, ko je plačilo prejeto.`,
      })

      const resend = new Resend(process.env.RESEND_API_KEY)
      const { error: reErr } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [stranka.email],
        subject: `Predračun ${predracun.quote_number} — podaljšanje kartice`,
        html,
        attachments: [
          { filename: `predracun-${predracun.quote_number}.pdf`, content: pdf },
          ...(qr ? [{
            filename: 'upnqr.png',
            content: Buffer.from(qr.split(',')[1] || '', 'base64'),
            contentId: 'upnqr',
          }] : []),
        ],
      } as any)
      // F3 (24.8.2026): posiljanje predracuna se ni belezilo nikjer - ce ga je
      // Resend zavrnil, se je to videlo samo v strezniskem dnevniku.
      // POPRAVLJENO (24.8.2026): vstavljanje je TIHO SPODLETELO, ker je bil
      // `invoice_id` obvezen, predracun pa racuna nima. SQL 09 doda `quote_id`
      // in sprosti `invoice_id`.
      const { error: logErr } = await db.from('invoice_emails').insert({
        quote_id: predracun.id,
        org_id: org.id,
        to_email: stranka.email,
        subject: `Predračun ${predracun.quote_number} — podaljšanje kartice`,
        message: 'Predračun za podaljšanje kartice, na zahtevo stranke',
        status: reErr ? 'failed' : 'sent',
        error_message: reErr ? String(reErr.message) : null,
        sent_at: reErr ? null : new Date().toISOString(),
      })
      if (logErr) console.error('Zapisa o poslanem predracunu ni bilo mogoce shraniti:', logErr.message)

      if (!reErr) { poslano = true; qrZaStran = qr }
      else console.error('Predracuna ni bilo mogoce poslati:', reErr.message)
    } catch (e: any) {
      // POPRAVLJENO (26.8.2026): ce je posiljanje odpovedalo PRED klicem
      // Resend (npr. pri izdelavi PDF), se ni zabelezilo NIC - v
      // `invoice_emails` ni bilo vrstice, uporabnik pa ni imel kje videti,
      // da predracun ni odsel.
      console.error('Predracuna ni bilo mogoce poslati:', e?.message || e)
      try {
        await db.from('invoice_emails').insert({
          quote_id: predracun.id,
          org_id: org.id,
          to_email: stranka.email,
          subject: `Predračun ${predracun.quote_number} — podaljšanje kartice`,
          message: 'Predračun za podaljšanje kartice, na zahtevo stranke',
          status: 'failed',
          error_message: String(e?.message || e).slice(0, 500),
        })
      } catch { /* ce tudi to ne gre, ostane samo strezniski dnevnik */ }
    }
  }

  // D3 (24.8.2026): stranka, ki placa s telefona, je na strani videla samo
  // IBAN in sklic. Koda ze obstaja - pokazemo jo tudi tu.
  if (!qrZaStran) {
    try {
      qrZaStran = await generateUpnQr({
        invoice_number: predracun.quote_number,
        amount_total: cena,
        due_date: lokalniDatum(veljaDo),
        client_name: stranka?.name ?? '',
        reference: `SI00 ${predracun.quote_number}`,
      }, org)
    } catch { /* brez kode gre naprej - IBAN in sklic sta izpisana */ }
  }

  return NextResponse.json({
    ok: true,
    poslano,
    qr: qrZaStran || null,
    stevilka: predracun.quote_number,
    znesek: cena,
    iban: org.iban,
    sklic: `SI00 ${predracun.quote_number}`,
    veljaDo: lokalniDatum(veljaDo),
  })
}
