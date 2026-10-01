import { test, expect } from '@playwright/test'
import { izracunajZnesekNarocila, postavkeZaCheckout, provizijaCenti } from '../lib/stripe-connect'
import { zakljuciPosPlacilo, type PosShramba, type PlaciloVrstica, type FursIzid } from '../lib/pos-stripe'

/**
 * TESTI PLACIL S STRIPE V BLAGAJNI (prelet 357)
 *
 * Brez brskalnika in brez baze: uvozijo PRAVE funkcije. Pokrivajo tri stvari,
 * ki se pri placilu s kartico ne smejo nikoli zgoditi:
 *   1. da stranka placa znesek, ki ga je izracunal brskalnik (ne streznik),
 *   2. da ima odprt racun dve hkratni placili,
 *   3. da podvojen webhook zakljuci (in davcno potrdi) racun dvakrat.
 *
 * Zagon:  cd apps/web && npx playwright test tests/stripe-connect.spec.ts
 */

// ═══════════════════ ZNESEK NA STREZNIKU ═══════════════════

test('Znesek: dve postavki brez popusta = vsota kolicina × cena', () => {
  const r = izracunajZnesekNarocila({}, [
    { name: 'Kava', qty: 2, unit_price: 1.8 },
    { name: 'Rogljic', qty: 1, unit_price: 2.2 },
  ])
  expect(r.skupaj).toBe(5.8)
  expect(r.centi).toBe(580)
})

test('Znesek: doplacila modifikatorjev so del cene', () => {
  const r = izracunajZnesekNarocila({}, [
    { name: 'Kava z mlekom', qty: 2, unit_price: 1.8, mods: [{ name: 'Ovseno', delta: 0.3 }] },
  ])
  expect(r.skupaj).toBe(4.2)
})

test('Znesek: stornirane vrstice ne stejejo', () => {
  const r = izracunajZnesekNarocila({}, [
    { name: 'Kava', qty: 1, unit_price: 2 },
    { name: 'Pivo', qty: 1, unit_price: 3.5, voided: true },
  ])
  expect(r.skupaj).toBe(2)
})

test('Znesek: popust (odstotek + evri) in napitnina kot sprozilec v bazi', () => {
  // trg_recalc_order_total: popust = min(vmesna, round(vmesna*pct/100,2)+fiksni),
  // skupaj = vmesna - popust + napitnina
  const r = izracunajZnesekNarocila({ discount_pct: 10, discount_fixed: 1, tip_amount: 2 }, [
    { name: 'Kosilo', qty: 2, unit_price: 12.5 },
  ])
  expect(r.vmesna).toBe(25)
  expect(r.popust).toBe(3.5)
  expect(r.skupaj).toBe(23.5)
})

test('Znesek: popust nikoli vecji od racuna', () => {
  const r = izracunajZnesekNarocila({ discount_fixed: 50 }, [{ name: 'Kava', qty: 1, unit_price: 2 }])
  expect(r.skupaj).toBe(0)
})

test('Znesek: brskalnikov "total" v vrstici se NE uposteva', () => {
  // Vrstica nosi prirejen total = 0,01 €; streznik ga izracuna znova iz
  // kolicine in cene.
  const r = izracunajZnesekNarocila({}, [{ name: 'Vino', qty: 3, unit_price: 4, total: 0.01 } as any])
  expect(r.skupaj).toBe(12)
})

test('Znesek: plavajoca vejica ne pokvari centov', () => {
  const r = izracunajZnesekNarocila({}, [
    { name: 'A', qty: 3, unit_price: 0.1 },
    { name: 'B', qty: 1, unit_price: 0.2 },
  ])
  expect(r.centi).toBe(50)
})

test('Checkout: brez popusta gre vsaka postavka posebej, vsota = znesek', () => {
  const r = izracunajZnesekNarocila({}, [
    { name: 'Kava', qty: 2, unit_price: 1.8 },
    { name: 'Rogljic', qty: 1, unit_price: 2.2 },
  ])
  const p = postavkeZaCheckout(r, 'Racun 12')
  expect(p).toHaveLength(2)
  expect(p.reduce((s, x) => s + x.price_data.unit_amount * x.quantity, 0)).toBe(r.centi)
  expect(p[0].price_data.product_data.name).toBe('2× Kava')
})

test('Checkout: s popustom ena postavka s tocnim zneskom (Stripe ne pozna negativnih)', () => {
  const r = izracunajZnesekNarocila({ discount_pct: 10 }, [
    { name: 'Kava', qty: 2, unit_price: 1.8 },
    { name: 'Rogljic', qty: 1, unit_price: 2.2 },
  ])
  const p = postavkeZaCheckout(r, 'Racun 12')
  expect(p).toHaveLength(1)
  expect(p[0].price_data.unit_amount).toBe(r.centi)
})

test('Provizija Racunka: privzeto 0 (polje se ne poslje)', () => {
  expect(provizijaCenti(1000, 0)).toBe(0)
  expect(provizijaCenti(1000, NaN)).toBe(0)
  expect(provizijaCenti(1000, 1)).toBe(10)
})

// ═══════════════════ EN AKTIVEN SESSION NA RACUN ═══════════════════

test('En aktiven session na racun: drugo cakajoce placilo za isti racun se zavrne', () => {
  // Zrcali enolicni delni indeks pos_placila_stripe_en_aktiven
  // (order_id) WHERE status = 'cakanje'.
  const tabela = new ZrcaloIndeksa()
  expect(tabela.vstavi({ id: 'a', order_id: 'o1', status: 'cakanje' })).toBe(true)
  expect(tabela.vstavi({ id: 'b', order_id: 'o1', status: 'cakanje' })).toBe(false)
  // drug racun - dovoljeno
  expect(tabela.vstavi({ id: 'c', order_id: 'o2', status: 'cakanje' })).toBe(true)
  // po preklicu prvega je novo placilo za o1 spet mogoce
  tabela.nastavi('a', 'preklicano')
  expect(tabela.vstavi({ id: 'd', order_id: 'o1', status: 'cakanje' })).toBe(true)
})

class ZrcaloIndeksa {
  vrstice: { id: string; order_id: string; status: string }[] = []
  vstavi(v: { id: string; order_id: string; status: string }) {
    if (v.status === 'cakanje' && this.vrstice.some(x => x.order_id === v.order_id && x.status === 'cakanje')) return false
    this.vrstice.push(v)
    return true
  }
  nastavi(id: string, status: string) { const v = this.vrstice.find(x => x.id === id); if (v) v.status = status }
}

// ═══════════════════ PODVOJEN WEBHOOK ═══════════════════

function lazna(status: PlaciloVrstica['status'] = 'cakanje') {
  const vrstica: PlaciloVrstica & { zaklep: boolean } = {
    id: 'p1', business_id: 'b', org_id: 'o', staff_id: 's', order_id: 'ord', premise_id: null,
    znesek_centi: 580, status, payment_intent_id: null, payment_id: null,
    zakljuceno_ob: null, napaka: null, rezultat: null, zaklep: false,
  }
  const klici = { placaj: 0, furs: 0 }
  const pocakaj = () => new Promise(r => setTimeout(r, 5))
  const s: PosShramba = {
    async oznaciPlacano(_id, pi) {
      await pocakaj()
      if (vrstica.status === 'cakanje' || vrstica.status === 'poteklo') { vrstica.status = 'placano'; vrstica.payment_intent_id = pi; return true }
      return false
    },
    async zakleni() {
      // atomarno: preveri in nastavi v istem koraku (kot UPDATE ... RETURNING)
      if (vrstica.zakljuceno_ob || vrstica.zaklep) return null
      vrstica.zaklep = true
      return { ...vrstica }
    },
    async preberi() { return { ...vrstica } },
    async placajNarocilo() { klici.placaj++; await pocakaj(); return { paymentId: 'pay1', paidAt: '2026-09-30T10:00:00Z' } },
    async shraniPaymentId(_id, pid) { vrstica.payment_id = pid },
    async casPlacila() { return '2026-09-30T10:00:00Z' },
    async potrdiFurs(): Promise<FursIzid> {
      klici.furs++; await pocakaj()
      return { success: true, zoi: 'DEMO-X', eor: 'DEMO-X', invoiceNumber: 'DEMO1-BLAG1-7', issuedAt: '2026-09-30T10:00:00Z', napaka: null }
    },
    async koncaj(_id, r) { vrstica.zakljuceno_ob = new Date().toISOString(); vrstica.rezultat = r; vrstica.zaklep = false },
    async sprosti(_id, n) { vrstica.zaklep = false; vrstica.napaka = n || null },
  }
  return { s, vrstica, klici }
}

test('Podvojen webhook (zaporedno): racun se zakljuci in davcno potrdi ENKRAT', async () => {
  const { s, klici } = lazna()
  const a = await zakljuciPosPlacilo(s, 'p1', 'pi_1')
  const b = await zakljuciPosPlacilo(s, 'p1', 'pi_1')
  expect(a.stanje).toBe('zakljuceno')
  expect(b.stanje).toBe('zakljuceno')
  expect((b as any).ponovno).toBe(true)
  expect(klici.placaj).toBe(1)
  expect(klici.furs).toBe(1)
})

test('Podvojen webhook (hkrati): samo en klic zakljuci racun', async () => {
  const { s, klici } = lazna()
  const izidi = await Promise.all([
    zakljuciPosPlacilo(s, 'p1', 'pi_1'),
    zakljuciPosPlacilo(s, 'p1', 'pi_1'),
    zakljuciPosPlacilo(s, 'p1', 'pi_1'),
  ])
  expect(klici.placaj).toBe(1)
  expect(klici.furs).toBe(1)
  expect(izidi.filter(i => i.stanje === 'zakljuceno' && !(i as any).ponovno)).toHaveLength(1)
})

test('Preklicano placilo se ne zakljuci (ni placano)', async () => {
  const { s, klici } = lazna('preklicano')
  const r = await zakljuciPosPlacilo(s, 'p1', 'pi_1')
  expect(r.stanje).toBe('ni_placano')
  expect(klici.placaj).toBe(0)
  expect(klici.furs).toBe(0)
})

test('Ponovni poskus po napaki ne zapise placila se enkrat', async () => {
  const { s, klici, vrstica } = lazna()
  let prvic = true
  const potrdi = s.potrdiFurs
  s.potrdiFurs = async (...a) => { if (prvic) { prvic = false; throw new Error('baza ni dosegljiva') } return potrdi(...a) }
  const a = await zakljuciPosPlacilo(s, 'p1', 'pi_1')
  expect(a.stanje).toBe('napaka')
  expect(vrstica.payment_id).toBe('pay1')
  const b = await zakljuciPosPlacilo(s, 'p1', 'pi_1')
  expect(b.stanje).toBe('zakljuceno')
  expect(klici.placaj).toBe(1)
})

// ═══════════════════ H2 (prelet 365): ZNESEK = orders.total ═══════════════════

import { znesekZaStripe, centiNarocila } from '../lib/stripe-connect'

/** Kot sprozilec trg_recalc_order_total: vsota order_lines.total, popust, napitnina. */
function totalKotBaza(o: { discount_pct?: number; discount_fixed?: number; tip_amount?: number }, vrstice: { total: number }[]) {
  const sub = vrstice.reduce((s, v) => s + v.total, 0)
  const popust = Math.min(sub, Math.round(sub * (o.discount_pct || 0) / 100 * 100) / 100 + (o.discount_fixed || 0))
  return Math.round((sub - popust + (o.tip_amount || 0)) * 100) / 100
}
const vsotaCheckout = (li: any[]) => li.reduce((s, p) => s + p.price_data.unit_amount * p.quantity, 0)

test('H2: 3 × 2,00 € s popustom 1,00 € → Stripe zaracuna tocno 5,00 € (orders.total)', () => {
  const vrstice = [{ name: 'Kava', qty: 3, unit_price: 2, total: 6 }]
  const order = { discount_fixed: 1, total: 5.0 }
  expect(totalKotBaza(order, vrstice)).toBe(5)
  const z = znesekZaStripe(order, vrstice)
  expect(z.centi).toBe(500)
  expect(centiNarocila(order.total)).toBe(z.centi) // isto kot pay_order in FURS
  expect(vsotaCheckout(postavkeZaCheckout(z, 'Racun'))).toBe(500)
})

test('H2: popust % na modifikatorjih pri qty 2 - znesek je orders.total, ne lasten izracun', () => {
  // Vrstica v bazi: (1,80 + 0,35 mleko) × 2 = 4,30, popust 15 % na vrstici -> 3,655 -> 3,66 (total v order_lines)
  const vrstice = [
    { name: 'Kava z mlekom', qty: 2, unit_price: 1.8, mods: [{ name: 'Ovseno', delta: 0.35 }], total: 3.66 },
    { name: 'Rogljic', qty: 1, unit_price: 2.2, total: 2.2 },
  ]
  const order = { discount_pct: 10, total: totalKotBaza({ discount_pct: 10 }, vrstice) }
  const z = znesekZaStripe(order, vrstice)
  expect(z.centi).toBe(centiNarocila(order.total))
  expect(z.postavkeSeUjemajo).toBe(false) // lasten izracun bi dal drug znesek
  const li = postavkeZaCheckout(z, 'Racun')
  expect(li).toHaveLength(1)
  expect(vsotaCheckout(li)).toBe(z.centi)
})

test('H2: centi brez napake plavajoce vejice', () => {
  expect(centiNarocila(19.99)).toBe(1999)
  expect(centiNarocila('0.29')).toBe(29)
})
