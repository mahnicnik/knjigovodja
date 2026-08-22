import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { lokalniDatum } from '@/lib/tax-constants'

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
  const { data: mem } = await db
    .from('org_members').select('org_id').eq('user_id', biz.owner_user_id).maybeSingle()
  if (!mem?.org_id) return null
  const { data: org } = await db
    .from('organizations').select('*').eq('id', mem.org_id).maybeSingle()
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

  return NextResponse.json({
    status: z.status,
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
      quantity: 1,
      unit_price: Math.round(osnova * 100) / 100,
      vat_rate: stopnja,
    }],
    amount_net: Math.round(osnova * 100) / 100,
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

  return NextResponse.json({
    ok: true,
    stevilka: predracun.quote_number,
    znesek: cena,
    iban: org.iban,
    sklic: `SI00 ${predracun.quote_number}`,
    veljaDo: lokalniDatum(veljaDo),
  })
}
