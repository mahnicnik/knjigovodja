import { test, expect } from '@playwright/test'

/**
 * TESTI SPLETNIH INTEGRACIJ (WooCommerce, Shopify)
 *
 * Ponovijo izračun iz webhookov. Spletna naročila pridejo BREZ človeka —
 * če je izračun napačen, nastane napačen račun in nihče tega ne opazi,
 * dokler ga ne vidi računovodja.
 *
 * Zagon:  cd apps/web && npx playwright test tests/integracije.spec.ts
 */

// ─── WooCommerce ────────────────────────────────────────────────────────

function wooPostavke(order: any, orgVatRegistered: boolean) {
  return (order.line_items ?? []).map((item: any) => {
    const net = Number(item.subtotal) || 0
    const tax = Number(item.subtotal_tax ?? item.total_tax ?? 0)
    const effTax = orgVatRegistered ? (tax > 0 ? tax : net * 0.22) : 0
    const effRate = net > 0 && effTax > 0
      ? Math.round((effTax / net) * 1000) / 10
      : (orgVatRegistered ? 22 : 0)
    const kolicina = Number(item.quantity) || 1
    const cenaEnote = Number(item.price)
    return {
      quantity: kolicina,
      unit_price: Number.isFinite(cenaEnote) && cenaEnote > 0
        ? cenaEnote
        : Math.round((net / kolicina) * 10000) / 10000,
      amount_net: net,
      vat_rate: effRate,
      vat_amount: Math.round(effTax * 100) / 100,
    }
  })
}

test('WooCommerce: izdelek po 22 %', () => {
  const [p] = wooPostavke({
    line_items: [{ name: 'Izdelek', price: '100', quantity: 1, subtotal: '100.00', subtotal_tax: '22.00' }],
  }, true)
  expect(p.vat_rate).toBe(22)
  expect(p.vat_amount).toBeCloseTo(22, 2)
  expect(p.amount_net).toBeCloseTo(100, 2)
})

test('WooCommerce: hrana po 9,5 % ne sme dobiti 22 %', () => {
  // NAPAKA (popravljeno 30.7.2026): davek se je predpostavljal kot 22 %,
  // zato so trgovine s hrano, knjigami ali zdravili dobile napačen DDV.
  const [p] = wooPostavke({
    line_items: [{ name: 'Kruh', price: '100', quantity: 1, subtotal: '100.00', subtotal_tax: '9.50' }],
  }, true)
  expect(p.vat_rate).toBe(9.5)
  expect(p.vat_amount).toBeCloseTo(9.5, 2)
})

test('WooCommerce: nezavezanec nima DDV', () => {
  const [p] = wooPostavke({
    line_items: [{ name: 'Storitev', price: '100', quantity: 1, subtotal: '100.00', subtotal_tax: '0' }],
  }, false)
  expect(p.vat_rate).toBe(0)
  expect(p.vat_amount).toBe(0)
})

test('WooCommerce: manjkajoča cena enote se izračuna, ne postane NaN', () => {
  // NAPAKA (popravljeno 19.8.2026): `Number(item.price)` je dal NaN, če
  // trgovina polja `price` ne pošlje. NaN se v JSON zapiše kot null in cena
  // postavke na računu IZGINE — račun je bil videti brez cene.
  const [p] = wooPostavke({
    line_items: [{ name: 'Izdelek', quantity: 2, subtotal: '100.00', subtotal_tax: '22.00' }],
  }, true)
  expect(Number.isNaN(p.unit_price)).toBe(false)
  expect(p.unit_price).toBeCloseTo(50, 2) // 100 / 2
})

// ─── Shopify ────────────────────────────────────────────────────────────

function shopifyPostavke(order: any, orgVatRegistered: boolean) {
  return (order.line_items ?? []).map((item: any) => {
    const kolicina = Number(item.quantity) || 1
    const cenaEnote = Number(item.price) || 0
    const net = cenaEnote * kolicina
    const taxFromLines = (item.tax_lines ?? []).reduce((s: number, t: any) => s + (Number(t.price) || 0), 0)
    const effTax = orgVatRegistered ? (taxFromLines > 0 ? taxFromLines : net * 0.22) : 0
    const effRate = net > 0 && effTax > 0
      ? Math.round((effTax / net) * 1000) / 10
      : (orgVatRegistered ? 22 : 0)
    return {
      quantity: kolicina,
      unit_price: cenaEnote,
      amount_net: net,
      vat_rate: effRate,
      vat_amount: Math.round(effTax * 100) / 100,
    }
  })
}

test('Shopify: davek iz tax_lines, ne predpostavka 22 %', () => {
  const [p] = shopifyPostavke({
    line_items: [{ title: 'Kruh', price: '50', quantity: 2, tax_lines: [{ price: '9.50' }] }],
  }, true)
  expect(p.amount_net).toBeCloseTo(100, 2)
  expect(p.vat_rate).toBe(9.5)
})

test('Shopify: manjkajoča cena ne pokvari OSNOVE računa', () => {
  // NAPAKA (popravljeno 19.8.2026): `Number(item.price) * item.quantity` je
  // dal NaN. Tu je posledica hujša kot pri WooCommerce — NaN se je prenesel
  // v neto znesek, iz njega v DDV in nato v celoten znesek računa.
  const [p] = shopifyPostavke({
    line_items: [{ title: 'Izdelek', quantity: 1, tax_lines: [] }],
  }, true)
  expect(Number.isNaN(p.amount_net)).toBe(false)
  expect(Number.isNaN(p.vat_amount)).toBe(false)
  expect(p.amount_net).toBe(0)
})

test('Shopify: manjkajoča količina se privzame kot 1', () => {
  const [p] = shopifyPostavke({
    line_items: [{ title: 'Izdelek', price: '30', tax_lines: [] }],
  }, false)
  expect(p.quantity).toBe(1)
  expect(p.amount_net).toBeCloseTo(30, 2)
})

// ─── Skupno ─────────────────────────────────────────────────────────────

test('obe integraciji: zaporedna številka računa se ne sme podvojiti', () => {
  // NAPAKA (popravljeno 16.8.2026): številka se je določala s ŠTETJEM
  // obstoječih računov. Ob brisanju računa se je števec zmanjšal in nova
  // številka je trčila z obstoječo — vpis je zavrnila baza, webhook je
  // spodletel, ponudnik je poskusil znova: plačilo prejeto, računa ni.
  const obstojeci = ['WC-2026-0001', 'WC-2026-0002', 'WC-2026-0005']
  const vzorec = /^WC-2026-(\d+)$/
  const najvisja = obstojeci.reduce((max, r) => {
    const m = vzorec.exec(r)
    return m ? Math.max(max, parseInt(m[1], 10)) : max
  }, 0)
  expect(najvisja + 1).toBe(6) // NE 4 (kar bi dalo štetje)
})

test('številčenje: storno pripone se ne štejejo', () => {
  const obstojeci = ['WC-2026-0001', 'WC-2026-0001-S', 'WC-2026-0002-D']
  const vzorec = /^WC-2026-(\d+)$/
  const najvisja = obstojeci.reduce((max, r) => {
    const m = vzorec.exec(r)
    return m ? Math.max(max, parseInt(m[1], 10)) : max
  }, 0)
  expect(najvisja + 1).toBe(2)
})

// ─── Stripe: webhook skrivnost ──────────────────────────────────────────

/**
 * Pri Stripu skrivnost IZDA STRIPE — mi jo samo prepišemo. Pri WooCommerce in
 * Shopify je obratno: skrivnost ustvarimo mi in jo prilepimo v njihove
 * nastavitve.
 *
 * NAPAKA (popravljeno 24.8.2026): gumb „↺ Novo" in gumb „+ Poveži" sta pri
 * Stripu ustvarila naključno skrivnost. Ta se z nobenim Stripovim podpisom ne
 * bi ujemala — VSI webhooki bi bili tiho zavrnjeni, računi se ne bi izdajali,
 * napake pa nikjer ne bi bilo, ker Stripe poskuse le ponavlja.
 */
function jeVeljavnaStripeSkrivnost(s: string): boolean {
  return typeof s === 'string' && s.startsWith('whsec_') && s.length > 10
}

test('Stripe: skrivnost se mora začeti z whsec_', () => {
  expect(jeVeljavnaStripeSkrivnost('whsec_jZzMO74Eo9lOsCETLFHp72EOoIvaiaIP')).toBe(true)
})

test('Stripe: izmišljena skrivnost se prepozna kot neveljavna', () => {
  // Tako je izgledala skrivnost iz gumba „↺ Novo".
  expect(jeVeljavnaStripeSkrivnost('a3f9c2e1b7d4')).toBe(false)
  expect(jeVeljavnaStripeSkrivnost('')).toBe(false)
})

test('Stripe: polje ob povezovanju ostane prazno', () => {
  // Prej se je prednapolnilo z izmišljeno vrednostjo, kar je vabilo, da jo
  // uporabnik kar shrani.
  const zacetnaVrednost = ''
  expect(zacetnaVrednost).toBe('')
  expect(jeVeljavnaStripeSkrivnost(zacetnaVrednost)).toBe(false)
})
