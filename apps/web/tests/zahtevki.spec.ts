import { test, expect } from '@playwright/test'
import {
  izracunajZahtevek, NeveljavenZahtevek, obdelajPlacanZahtevekZ, razlogNedostopnosti, prikazanoStanje, konecSessiona,
  postavkeZaStripe, jeVeljavenZeton, novZeton,
  type ZahtevkiShramba, type ZahtevekVrstica,
} from '../lib/zahtevki'

/**
 * TESTI ZAHTEVKOV ZA PLACILO NA PORTALU (prelet 360)
 *
 * Brez brskalnika in brez baze: uvozijo PRAVE funkcije. Pokrivajo:
 *   1. znesek izracuna streznik iz postavk (ne brskalnik),
 *   2. podvojen (tudi hkraten) webhook izda NAJVEC EN racun,
 *   3. potekel in preklican zahtevek racuna ne ustvarita,
 *   4. brez FURS certifikata ali Stripe povezave moznost ni na voljo.
 *
 * Zagon:  cd apps/web && npx playwright test tests/zahtevki.spec.ts
 */

// ═══════════════════ ZNESEK NA STREZNIKU ═══════════════════

test('Znesek: Osebni trening, 10 ur × 40 € (nezavezanec) = 400 €', () => {
  const r = izracunajZahtevek([{ description: 'Osebni trening', quantity: 10, unit_price: 40, vat_rate: 22 }], { zavezanecDdv: false })
  expect(r.postavke[0].vat_rate).toBe(0) // nezavezanec: vedno 0 %
  expect(r.neto).toBe(400)
  expect(r.ddv).toBe(0)
  expect(r.skupaj).toBe(400)
  expect(r.centi).toBe(40000)
})

test('Znesek: zavezanec, 22 % in 9,5 % + popust na postavki', () => {
  const r = izracunajZahtevek([
    { description: 'Trening', quantity: 10, unit_price: 32.79, vat_rate: 22 },
    { description: 'Knjiga', quantity: 1, unit_price: 20, vat_rate: 9.5, discount_pct: 10 },
  ], { zavezanecDdv: true })
  // 327,90 + 18,00 = 345,90; DDV 72,138 + 1,71 = 73,848 -> 73,85
  expect(r.neto).toBe(345.9)
  expect(r.ddv).toBe(73.85)
  expect(r.skupaj).toBe(419.75)
  expect(r.centi).toBe(41975)
})

test('Znesek: brskalnikov "znesek" se NE uposteva', () => {
  const r = izracunajZahtevek([{ description: 'Trening', quantity: 1, unit_price: 50, vat_rate: 0, amount_total: 0.01, znesek: 0.01 } as any], { zavezanecDdv: false })
  expect(r.skupaj).toBe(50)
})

test('Znesek: prazne vrstice obrazca se preskocijo', () => {
  const r = izracunajZahtevek([{ description: '', quantity: 1, unit_price: 0, vat_rate: 22 }, { description: 'A', quantity: '2', unit_price: '1,5', vat_rate: 0 }], { zavezanecDdv: true })
  expect(r.postavke.length).toBe(1)
  expect(r.skupaj).toBe(3)
})

test('Znesek: neveljavne postavke so zavrnjene', () => {
  const z = (p: any, zav = true) => () => izracunajZahtevek(p, { zavezanecDdv: zav })
  expect(z([])).toThrow(NeveljavenZahtevek)
  expect(z([{ description: 'A', quantity: 1, unit_price: -5, vat_rate: 22 }])).toThrow(/negativna/)
  expect(z([{ description: 'A', quantity: 0, unit_price: 5, vat_rate: 22 }])).toThrow(/količina/)
  expect(z([{ description: 'A', quantity: 1, unit_price: 5, vat_rate: 13 }])).toThrow(/stopnja/)
  expect(z([{ description: 'A', quantity: 1, unit_price: 5, vat_rate: 22, discount_pct: 120 }])).toThrow(/popust/)
  expect(z([{ description: 'A', quantity: 1, unit_price: 0.4, vat_rate: 0 }])).toThrow(/0,50/)
  expect(z([{ description: '', quantity: 1, unit_price: 5, vat_rate: 0 }])).toThrow(/opis/)
})

test('Stripe: ena postavka z zneskom zahtevka (v centih)', () => {
  const r = izracunajZahtevek([{ description: 'Osebni trening', quantity: 10, unit_price: 40, vat_rate: 0 }], { zavezanecDdv: false })
  const li = postavkeZaStripe({ postavke: r.postavke, znesek: r.skupaj, stevilka: 'ZP-2026-001' }, 'Fit d.o.o.')
  expect(li).toHaveLength(1)
  expect(li[0].price_data.unit_amount).toBe(40000)
  expect(li[0].price_data.product_data.name).toBe('Fit d.o.o. — ZP-2026-001')
  expect(li[0].price_data.product_data.description).toContain('10× Osebni trening')
})

test('Zeton: nakljucen, dovolj dolg, samo varni znaki', () => {
  const a = novZeton(), b = novZeton()
  expect(a).not.toBe(b)
  expect(jeVeljavenZeton(a)).toBe(true)
  expect(jeVeljavenZeton('../../etc')).toBe(false)
  expect(jeVeljavenZeton('kratek')).toBe(false)
})

test('Stanje: poslan zahtevek po roku je potekel; session najvec 24 ur', () => {
  const zdaj = Date.parse('2026-10-01T10:00:00Z')
  expect(prikazanoStanje({ status: 'poslan', velja_do: '2026-09-30T10:00:00Z' }, zdaj)).toBe('potekel')
  expect(prikazanoStanje({ status: 'poslan', velja_do: '2026-10-10T10:00:00Z' }, zdaj)).toBe('poslan')
  expect(prikazanoStanje({ status: 'placan', velja_do: '2026-09-30T10:00:00Z' }, zdaj)).toBe('placan')
  const k = konecSessiona('2026-10-15T10:00:00Z', zdaj)
  expect(k.expiresAt * 1000 - zdaj).toBeLessThanOrEqual(24 * 3600_000)
  expect(k.podaljsajZahtevek).toBe(false)
  const kratek = konecSessiona('2026-10-01T10:05:00Z', zdaj)
  expect(kratek.expiresAt * 1000 - zdaj).toBeGreaterThanOrEqual(30 * 60_000)
  expect(kratek.podaljsajZahtevek).toBe(true)
})

// ═══════════════════ NA VOLJO SAMO S STRIPE + FURS ═══════════════════

const vseOk = { nastavljeno: true, stripeAktiven: true, stripePovezan: true, fursOk: true, fursRazlog: null, paketPortal: true }

test('Na voljo: Stripe povezan + FURS + Pro', () => {
  expect(razlogNedostopnosti(vseOk)).toBeNull()
})

test('Ni na voljo brez Stripe povezave (z razlago in povezavo do nastavitev)', () => {
  const r = razlogNedostopnosti({ ...vseOk, stripeAktiven: false, stripePovezan: false })
  expect(r?.razlog).toMatch(/povežite Stripe/)
  expect(r?.povezava).toBe('/nastavitve?razdelek=placila')
  expect(razlogNedostopnosti({ ...vseOk, stripeAktiven: false, stripePovezan: true })?.razlog).toMatch(/ne sprejema plačil/)
})

test('Ni na voljo brez FURS certifikata ali poslovnega prostora', () => {
  const r = razlogNedostopnosti({ ...vseOk, fursOk: false, fursRazlog: 'Za plačila s kartico mora biti naložen veljaven FURS certifikat.' })
  expect(r?.razlog).toMatch(/FURS certifikat/)
  expect(r?.povezava).toBe('/nastavitve?razdelek=blagajna')
})

test('Ni na voljo v brezplacnem paketu', () => {
  expect(razlogNedostopnosti({ ...vseOk, paketPortal: false })?.razlog).toMatch(/Pro/)
})

// ═══════════════════ PO PLACILU: EN ZAHTEVEK = NAJVEC EN RACUN ═══════════════════

function zahtevek(p: Partial<ZahtevekVrstica> = {}): ZahtevekVrstica {
  return {
    id: 'z1', org_id: 'o1', stevilka: 'ZP-2026-001', stranka_ime: 'Ana', stranka_email: 'ana@primer.si',
    stranka_naslov: null, stranka_davcna: null,
    postavke: [{ description: 'Osebni trening', quantity: 10, unit_price: 40, vat_rate: 0, discount_pct: 0 }],
    znesek_neto: 400, ddv: 0, znesek: 400, opomba: null, vat_exemption_code: null, vat_exemption_text: null,
    service_date: null, service_date_to: null, header_text: null,
    status: 'poslan', checkout_session_id: null, payment_intent_id: null, invoice_id: null, placano_ob: null,
    izdajanje_od: null, racun_poslan_ob: null, napaka: null, ...p,
  }
}

function pomnilnik(zacetek: ZahtevekVrstica, o: { fursUspe?: boolean; zamik?: number } = {}) {
  const z = { ...zacetek }
  const racuni: string[] = []
  const knjiga: string[] = []
  const furs: string[] = []
  const poslano: string[] = []
  const vracila: string[] = []
  const pocakaj = () => new Promise(r => setTimeout(r, o.zamik ?? 1))
  const s: ZahtevkiShramba = {
    async preberi() { await pocakaj(); return { ...z } },
    async oznaciPlacan(_id, p) {
      const pravocasno = !!p.placanoOb && !!z.velja_do && p.placanoOb <= z.velja_do
      if (!(z.status === 'poslan' || (z.status === 'potekel' && pravocasno))) return false
      z.status = 'placan'; z.placano_ob = p.placanoOb || new Date().toISOString(); z.checkout_session_id = p.sessionId; z.payment_intent_id = p.paymentIntentId
      return true
    },
    async zakleni() {
      // atomaren (brez await med preverbo in zapisom), kot UPDATE ... WHERE v bazi
      if (z.izdajanje_od) return null
      z.izdajanje_od = new Date().toISOString()
      return { ...z }
    },
    async izdajRacun() {
      await pocakaj()
      // enolicni indeks external_reference: drugi vpis za isti zahtevek vrne obstojecega
      if (racuni.length) return { id: racuni[0] }
      racuni.push('r' + (racuni.length + 1))
      return { id: racuni[racuni.length - 1] }
    },
    async shraniRacun(_id, inv) { z.invoice_id = inv },
    async vpisiVKnjigo(_z, inv) { if (!knjiga.includes(inv)) knjiga.push(inv) },
    async potrdiFurs(_z, inv) { furs.push(inv); await pocakaj(); return o.fursUspe === false ? { success: false, napaka: 'Timeout' } : { success: true, napaka: null } },
    async posljiRacun(zz, inv) { if (z.racun_poslan_ob) return; poslano.push(inv); z.racun_poslan_ob = new Date().toISOString() },
    async koncaj(_id, op) { z.izdajanje_od = null; z.napaka = op },
    async sprosti(_id, n) { z.izdajanje_od = null; z.napaka = n },
    async vrniPlaciloBrezRacuna(_z, pi, razlog) { vracila.push(String(pi)); z.napaka = razlog },
  }
  return { s, z, racuni, knjiga, furs, poslano, vracila }
}

const placilo = { sessionId: 'cs_test_1', paymentIntentId: 'pi_test_1' }

test('Placilo: racun izdan, v knjigi, davcno potrjen, poslan; zahtevek placan', async () => {
  const m = pomnilnik(zahtevek())
  const izid = await obdelajPlacanZahtevekZ(m.s, 'z1', placilo)
  expect(izid.stanje).toBe('izdan')
  expect(izid.fursPotrjen).toBe(true)
  expect(m.racuni).toEqual(['r1'])
  expect(m.knjiga).toEqual(['r1'])
  expect(m.furs).toEqual(['r1'])
  expect(m.poslano).toEqual(['r1'])
  expect(m.z.status).toBe('placan')
  expect(m.z.invoice_id).toBe('r1')
  expect(m.z.placano_ob).toBeTruthy()
  expect(m.z.payment_intent_id).toBe('pi_test_1')
  expect(m.z.izdajanje_od).toBeNull()
})

test('Podvojen webhook (zaporedno) NE ustvari drugega racuna', async () => {
  const m = pomnilnik(zahtevek())
  await obdelajPlacanZahtevekZ(m.s, 'z1', placilo)
  const drugi = await obdelajPlacanZahtevekZ(m.s, 'z1', placilo)
  expect(drugi.stanje).toBe('ze')
  expect(m.racuni).toHaveLength(1)
  expect(m.poslano).toHaveLength(1)
  expect(m.furs).toHaveLength(1)
})

test('Podvojen webhook (HKRATI) NE ustvari drugega racuna', async () => {
  const m = pomnilnik(zahtevek(), { zamik: 5 })
  const izidi = await Promise.all([1, 2, 3].map(() => obdelajPlacanZahtevekZ(m.s, 'z1', placilo)))
  expect(m.racuni).toHaveLength(1)
  expect(m.poslano).toHaveLength(1)
  expect(izidi.filter(i => i.stanje === 'izdan')).toHaveLength(1)
  // ostali: ze obdelan ali "v teku" (webhook vrne 500, Stripe ponovi -> 'ze')
  for (const i of izidi.filter(i => i.stanje !== 'izdan')) expect(['ze', 'v_teku']).toContain(i.stanje)
  const ponovitev = await obdelajPlacanZahtevekZ(m.s, 'z1', placilo)
  expect(ponovitev.stanje).toBe('ze')
  expect(m.racuni).toHaveLength(1)
})

test('Preklican zahtevek NE ustvari racuna (denar se vrne)', async () => {
  const m = pomnilnik(zahtevek({ status: 'preklican' }))
  const izid = await obdelajPlacanZahtevekZ(m.s, 'z1', placilo)
  expect(izid.stanje).toBe('preskoceno')
  expect(m.racuni).toHaveLength(0)
  expect(m.knjiga).toHaveLength(0)
  expect(m.furs).toHaveLength(0)
  expect(m.vracila).toEqual(['pi_test_1'])
  expect(m.z.status).toBe('preklican')
})

test('Potekel zahtevek NE ustvari racuna (denar se vrne)', async () => {
  const m = pomnilnik(zahtevek({ status: 'potekel' }))
  const izid = await obdelajPlacanZahtevekZ(m.s, 'z1', placilo)
  expect(izid.stanje).toBe('preskoceno')
  expect(m.racuni).toHaveLength(0)
  expect(m.vracila).toEqual(['pi_test_1'])
})

test('FURS ne odgovori: racun obstaja, ni poslan, vidno opozorilo; ponovitev ne izda drugega', async () => {
  const m = pomnilnik(zahtevek(), { fursUspe: false })
  const izid = await obdelajPlacanZahtevekZ(m.s, 'z1', placilo)
  expect(izid.stanje).toBe('izdan')
  expect(izid.fursPotrjen).toBe(false)
  expect(m.racuni).toEqual(['r1'])
  expect(m.knjiga).toEqual(['r1'])
  expect(m.poslano).toHaveLength(0) // stranka dobi racun sele potrjen
  expect(m.z.napaka).toMatch(/ni davčno potrjen/)
  const znova = await obdelajPlacanZahtevekZ(m.s, 'z1', placilo)
  expect(znova.stanje).toBe('ze')
  expect(m.racuni).toHaveLength(1)
  expect(m.furs).toEqual(['r1', 'r1']) // ponovno poskusi potrditi ISTI racun
})

// ═══════════════════ PRODUKCIJSKI (ZIVI) NACIN - prelet 363 ═══════════════════

import { jeZiviKljuc, racunUstrezaNacinu, zivoNiDovoljeno } from '../lib/stripe-connect'

test('Zivi nacin: kljuc sk_live_/rk_live_ je zivi, sk_test_ ni', () => {
  expect(jeZiviKljuc('sk_live_abc')).toBe(true)
  expect(jeZiviKljuc('rk_live_abc')).toBe(true)
  expect(jeZiviKljuc('sk_test_abc')).toBe(false)
  expect(jeZiviKljuc('')).toBe(false)
})

test('Zivi nacin: testni povezan racun ne velja (podjetje mora Stripe povezati znova)', () => {
  expect(racunUstrezaNacinu(false, true)).toBe(false)
  expect(racunUstrezaNacinu(null, true)).toBe(false) // racuni pred preletom 363 so testni
  expect(racunUstrezaNacinu(true, true)).toBe(true)
  expect(racunUstrezaNacinu(null, false)).toBe(true)
  expect(racunUstrezaNacinu(true, false)).toBe(false)
})

test('Zivi nacin: brez pravih placil v predstavitvi in s FURS testnim okoljem', () => {
  expect(zivoNiDovoljeno({ furs_demo_mode: true }, true)).toMatch(/predstavitvi/)
  expect(zivoNiDovoljeno({ furs_test_mode: true }, true)).toMatch(/testnem okolju/)
  expect(zivoNiDovoljeno({ furs_demo_mode: false, furs_test_mode: false }, true)).toBeNull()
  expect(zivoNiDovoljeno({ furs_demo_mode: true }, false)).toBeNull() // testni kljuc: demo dovoljen
})

// ═══════════════════ M3 (prelet 369): ODLOCA CAS PLACILA ═══════════════════

test('M3: placano pred velja_do, webhook po izteku (cron ze oznacil potekel) - racun se izda, brez vracila', async () => {
  const m = pomnilnik(zahtevek({ status: 'potekel', velja_do: '2026-10-01T10:00:00.000Z' }))
  const izid = await obdelajPlacanZahtevekZ(m.s, 'z1', { ...placilo, placanoOb: '2026-10-01T09:59:30.000Z' })
  expect(izid.stanje).toBe('izdan')
  expect(m.vracila).toHaveLength(0)
  expect(m.racuni).toEqual(['r1'])
  expect(m.z.status).toBe('placan')
  expect(m.z.placano_ob).toBe('2026-10-01T09:59:30.000Z')
})

test('M3: placano PO velja_do - racuna ni, denar se vrne', async () => {
  const m = pomnilnik(zahtevek({ status: 'potekel', velja_do: '2026-10-01T10:00:00.000Z' }))
  const izid = await obdelajPlacanZahtevekZ(m.s, 'z1', { ...placilo, placanoOb: '2026-10-01T10:00:01.000Z' })
  expect(izid.stanje).toBe('preskoceno')
  expect(m.racuni).toHaveLength(0)
  expect(m.vracila).toEqual(['pi_test_1'])
})

// ═══════════════════ M5 (prelet 371): ISTO PRAVILO PROSTORA ═══════════════════

import { ocenaFurs } from '../lib/stripe-connect'
import { prostorZaPortal } from '../lib/furs-invoice-confirm'

test('M5: prostor samo za blagajno (pos) ne omogoci zahtevkov, blagajno pa', () => {
  const cert = { valid_to: '2030-01-01' }
  const r = ocenaFurs({ cert, prostori: [{ channel: 'pos', is_active: true }], danes: '2026-10-01' })
  expect(r.fursOk).toBe(true)          // blagajna: katerikoli aktiven prostor
  expect(r.fursOkPortal).toBe(false)   // portal: samo web/both, kot confirmIssuedInvoiceWithFurs
  expect(r.fursRazlogPortal).toMatch(/splet/)
  expect(razlogNedostopnosti({ ...vseOk, fursOk: r.fursOk, fursRazlog: r.fursRazlog, fursOkPortal: r.fursOkPortal, fursRazlogPortal: r.fursRazlogPortal })?.razlog).toMatch(/splet/)
})

test('M5: pravilo je isto kot pri davcni potrditvi - web pred both', () => {
  const prostori = [{ id: 'b', channel: 'both', is_active: true }, { id: 'w', channel: 'web', is_active: true }, { id: 'p', channel: 'pos', is_active: true }]
  expect(prostorZaPortal(prostori)?.id).toBe('w')
  expect(prostorZaPortal(prostori.filter(p => p.id !== 'w'))?.id).toBe('b')
  expect(prostorZaPortal([{ id: 'p', channel: 'pos', is_active: true }])).toBeNull()
  const ok = ocenaFurs({ cert: { valid_to: '2030-01-01' }, prostori: [{ channel: 'both', is_active: true }], danes: '2026-10-01' })
  expect(ok.fursOkPortal).toBe(true)
  const potekel = ocenaFurs({ cert: { valid_to: '2026-01-01' }, prostori: [{ channel: 'web', is_active: true }], danes: '2026-10-01' })
  expect(potekel.fursOkPortal).toBe(false)
  expect(potekel.fursRazlogPortal).toMatch(/potekel/)
})
