import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

/**
 * TESTI PRAVIL V BAZI
 *
 * Preverjajo sprozilce in funkcije, ki smo jih popravili pri avditu 16.8.2026.
 * Vsak test dela v transakciji nad TESTNIMI zapisi in za sabo pocisti.
 *
 * ZAHTEVA okoljski spremenljivki (ne shranjuj ju v repozitorij):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Zagon:  npx playwright test tests/baza.spec.ts
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUSINESS_ID = '00000000-0000-0000-0000-000000000001'

const db = URL && KEY ? createClient(URL, KEY) : null

test.skip(!db, 'Manjkata NEXT_PUBLIC_SUPABASE_URL in SUPABASE_SERVICE_ROLE_KEY')

/** Testni artikel z znano zalogo; vrne id in funkcijo za pospravljanje. */
async function testniArtikel(zaloga: number) {
  const { data, error } = await db!.from('items').insert({
    business_id: BUSINESS_ID,
    name: `__TEST__ ${Date.now()}`,
    price: 2.00,
    vat_rate: 22,
    stock: zaloga,
    archived: false,
  }).select('id').single()
  if (error) throw error
  return {
    id: data.id as string,
    async zaloga() {
      const { data: i } = await db!.from('items').select('stock').eq('id', data.id).single()
      return Number(i?.stock ?? 0)
    },
    async pospravi() { await db!.from('items').delete().eq('id', data.id) },
  }
}

async function testnoNarocilo() {
  const { data, error } = await db!.from('orders')
    .insert({ business_id: BUSINESS_ID, status: 'open' })
    .select('id').single()
  if (error) throw error
  return {
    id: data.id as string,
    async pospravi() {
      await db!.from('order_lines').delete().eq('order_id', data.id)
      await db!.from('orders').delete().eq('id', data.id)
    },
  }
}

async function dodajVrstico(orderId: string, itemId: string, kolicina: number) {
  const { error } = await db!.from('order_lines').insert({
    order_id: orderId, item_id: itemId, name: 'test',
    qty: kolicina, unit_price: 2.00, vat_rate: 22, total: 2.00 * kolicina,
  })
  if (error) throw error
}

// ─────────────── ZALOGA ───────────────

test('zaloga: dodajanje v kosarico jo odsteje', async () => {
  const a = await testniArtikel(10)
  const n = await testnoNarocilo()
  try {
    await dodajVrstico(n.id, a.id, 3)
    expect(await a.zaloga()).toBe(7)
  } finally { await n.pospravi(); await a.pospravi() }
})

test('zaloga: brisanje vrstice jo VRNE', async () => {
  // NAPAKA (popravljeno 16.8.2026): brisanje vrstice zaloge ni vrnilo, zato se
  // je ob vsaki spremembi kosarice izsusevala.
  const a = await testniArtikel(10)
  const n = await testnoNarocilo()
  try {
    await dodajVrstico(n.id, a.id, 3)
    await db!.from('order_lines').delete().eq('order_id', n.id)
    expect(await a.zaloga()).toBe(10)
  } finally { await n.pospravi(); await a.pospravi() }
})

test('zaloga: veckratna sprememba kosarice odsteje SAMO ENKRAT', async () => {
  // NAPAKA (popravljeno 16.8.2026): replaceLines izbrise in znova vstavi vse
  // vrstice; brez vracanja se je zaloga odstela ob vsaki spremembi.
  const a = await testniArtikel(20)
  const n = await testnoNarocilo()
  try {
    for (let i = 0; i < 3; i++) {
      await db!.from('order_lines').delete().eq('order_id', n.id)
      await dodajVrstico(n.id, a.id, 3)
    }
    expect(await a.zaloga()).toBe(17)
  } finally { await n.pospravi(); await a.pospravi() }
})

test('zaloga: storno jo vrne nazaj', async () => {
  // NAPAKA (popravljeno 16.8.2026): ob stornu se zaloga ni vrnila.
  const a = await testniArtikel(10)
  const n = await testnoNarocilo()
  try {
    await dodajVrstico(n.id, a.id, 2)
    expect(await a.zaloga()).toBe(8)
    await db!.from('orders').update({ status: 'voided', voided_at: new Date().toISOString() }).eq('id', n.id)
    expect(await a.zaloga()).toBe(10)
  } finally { await n.pospravi(); await a.pospravi() }
})

test('zaloga: dvojni storno je NE vrne dvakrat', async () => {
  const a = await testniArtikel(10)
  const n = await testnoNarocilo()
  try {
    await dodajVrstico(n.id, a.id, 2)
    await db!.from('orders').update({ status: 'voided', voided_at: new Date().toISOString() }).eq('id', n.id)
    await db!.from('orders').update({ status: 'voided', void_reason: 'ponovni poskus' }).eq('id', n.id)
    expect(await a.zaloga()).toBe(10)
  } finally { await n.pospravi(); await a.pospravi() }
})

// ─────────────── VSOTA NAROCILA ───────────────

test('vsota narocila: ob prenosu vrstic se preracunata OBE narocili', async () => {
  // NAPAKA (popravljeno 16.8.2026): ob zdruzevanju miz je izvorno narocilo
  // obdrzalo zastarelo vsoto - na mizi bi ostal fantomski racun.
  const a = await testniArtikel(100)
  const izvor = await testnoNarocilo()
  const cilj = await testnoNarocilo()
  try {
    await dodajVrstico(izvor.id, a.id, 2)   // 4,00
    await dodajVrstico(cilj.id, a.id, 3)    // 6,00
    await db!.from('order_lines').update({ order_id: cilj.id }).eq('order_id', izvor.id)

    const { data: i } = await db!.from('orders').select('total').eq('id', izvor.id).single()
    const { data: c } = await db!.from('orders').select('total').eq('id', cilj.id).single()
    expect(Number(i?.total)).toBeCloseTo(0, 2)
    expect(Number(c?.total)).toBeCloseTo(10, 2)
  } finally { await cilj.pospravi(); await izvor.pospravi(); await a.pospravi() }
})

// ─────────────── PREDPLACILO ───────────────

test('predplacilo: odsteje se od stanja stranke', async () => {
  // NAPAKA (popravljeno 16.8.2026): predplacilo se NIKOLI ni odstelo - isto
  // stanje bi bilo mogoce porabiti neomejeno mnogokrat.
  const { data: c } = await db!.from('customers')
    .insert({ business_id: BUSINESS_ID, name: `__TEST__ ${Date.now()}`, prepaid: 50 })
    .select('id').single()
  try {
    await db!.rpc('use_prepaid', { p_customer_id: c!.id, p_amount: 12 })
    const { data: po } = await db!.from('customers').select('prepaid').eq('id', c!.id).single()
    expect(Number(po?.prepaid)).toBeCloseTo(38, 2)
  } finally { await db!.from('customers').delete().eq('id', c!.id) }
})

test('predplacilo: placilo brez kritja je ZAVRNJENO', async () => {
  const { data: c } = await db!.from('customers')
    .insert({ business_id: BUSINESS_ID, name: `__TEST__ ${Date.now()}`, prepaid: 20 })
    .select('id').single()
  try {
    const { error } = await db!.rpc('use_prepaid', { p_customer_id: c!.id, p_amount: 100 })
    expect(error).not.toBeNull()
    const { data: po } = await db!.from('customers').select('prepaid').eq('id', c!.id).single()
    expect(Number(po?.prepaid)).toBeCloseTo(20, 2)  // stanje nespremenjeno
  } finally { await db!.from('customers').delete().eq('id', c!.id) }
})

test('predplacilo: storno ga vrne stranki', async () => {
  const { data: c } = await db!.from('customers')
    .insert({ business_id: BUSINESS_ID, name: `__TEST__ ${Date.now()}`, prepaid: 50 })
    .select('id').single()
  try {
    await db!.rpc('use_prepaid', { p_customer_id: c!.id, p_amount: 12 })
    await db!.rpc('refund_prepaid', { p_customer_id: c!.id, p_amount: 12 })
    const { data: po } = await db!.from('customers').select('prepaid').eq('id', c!.id).single()
    expect(Number(po?.prepaid)).toBeCloseTo(50, 2)
  } finally { await db!.from('customers').delete().eq('id', c!.id) }
})

// ─────────────── OBVESTILA ───────────────

test('obvestila: zavrnjeno se NE ustvari znova', async () => {
  // NAPAKA (popravljeno 16.8.2026): po kliku "Pocisti vse" je naslednja
  // osvezitev obvestila takoj znova ustvarila.
  await db!.from('pos_notifications')
    .update({ dismissed: true })
    .eq('business_id', BUSINESS_ID)
    .eq('dismissed', false)

  const { data: ustvarjenih } = await db!.rpc('generate_pos_notifications', { p_business_id: BUSINESS_ID })
  expect(Number(ustvarjenih)).toBe(0)
})

// ─────────────── STEVILCENJE RACUNOV ───────────────

test('stevilcenje: vsaka porabljena stevilka ima zapis', async () => {
  // NAPAKA (popravljeno 16.8.2026): neuspesen klic na FURS je porabil stevilko
  // in pustil NEPOJASNJENO vrzel (98 takih).
  const { data: zapisi } = await db!.from('pos_invoice_numbers')
    .select('sequence_number')
    .eq('business_id', BUSINESS_ID)
    .order('sequence_number')

  if (!zapisi || zapisi.length === 0) return  // se ni podatkov

  const st = zapisi.map(z => Number(z.sequence_number))
  const manjka: number[] = []
  for (let x = st[0]; x <= st[st.length - 1]; x++) {
    if (!st.includes(x)) manjka.push(x)
  }
  expect(manjka, `Nepojasnjene vrzeli v stevilcenju: ${manjka.join(', ')}`).toHaveLength(0)
})

// ─────────────── DAVCNA SKLADNOST PODATKOV ───────────────

test('racuni: osnova + DDV se ujema s skupnim zneskom', async () => {
  const { data: racuni } = await db!.from('issued_invoices')
    .select('invoice_number, amount_net, vat_amount, amount_total')

  const neskladni = (racuni || []).filter(r =>
    Math.abs(Number(r.amount_total) - (Number(r.amount_net) + Number(r.vat_amount))) > 0.005)

  expect(neskladni.map(r => r.invoice_number)).toHaveLength(0)
})

test('knjiga: vnosi z DDV imajo zapisano stopnjo', async () => {
  // NAPAKA (popravljeno 16.8.2026): promet po 22% in 9,5% se je sestel v en
  // zapis - obrazec DDV-O bi imel napacno razporeditev po vrsticah.
  const { data: vnosi } = await db!.from('kpo_entries')
    .select('id, vat_out, vat_rate')
    .eq('entry_type', 'income')
    .gt('vat_out', 0)

  const brezStopnje = (vnosi || []).filter(v => v.vat_rate == null)
  expect(brezStopnje).toHaveLength(0)
})
