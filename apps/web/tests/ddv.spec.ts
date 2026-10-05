import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import {
  izracunajDdv,
  izracunajDdvIzPodatkov,
  razcleniIzdanRacun,
  razcleniNarocilo,
  lokalniDanIzCasa,
  type DdvPodatki,
} from '../lib/ddv'
import { generateAccountingXLSX } from '../lib/accounting-export'
import { sestaviDdvOXml } from '../lib/ddv-o'
import { VAT_RATES } from '../lib/tax-constants'
import fiksturaTestSp from './fiksture/ddv-test-sp.json'

/**
 * REGRESIJSKI TESTI DDV (revizija oktober 2026, najdbe K1, K2, K3)
 *
 * K1: DDV je vsaka stran racunala po svoje - za SIRM Q3 2026 so strani kazale
 *     1.778,22 / 1.789,22 / −474,69 / −463,69 EUR. Zdaj je en sam izracun
 *     (lib/ddv.ts), strani ga le prikazujejo.
 *
 * Pricakovane vrednosti so preverjene z rocnim SQL nad produkcijsko bazo:
 *   test s.p., Q3 2026: 151,40 (racuni) + 3,88 (POS) − 31,91 (prejeti) = 123,37
 *   SIRM,      Q3 2026: 896,12 + 2.252,91 − 1.359,81 − 11,00         = 1.778,22
 *
 * Zagon:  npx playwright test tests/ddv.spec.ts
 * Testi nad bazo (zadnji blok) potrebujejo NEXT_PUBLIC_SUPABASE_URL in
 * SUPABASE_SERVICE_ROLE_KEY, sicer se preskocijo.
 */

const testSp = fiksturaTestSp as unknown as DdvPodatki
const Q3_2026 = { leto: 2026, cetrtletje: 3 } as const

const prazniPodatki = (): DdvPodatki => ({ racuni: [], prejeti: [], kpo: [], narocila: [], imaBlagajno: true })

// ─────────────── K1: test s.p., Q3 2026 ───────────────

test('K1: test s.p. Q3 2026 - obveznost 123,37 EUR (racuni + POS - prejeti)', () => {
  const r = izracunajDdvIzPodatkov(testSp, Q3_2026)
  expect(r.izstopniDdv.skupaj).toBe(155.28)
  expect(r.vstopniDdv.skupaj).toBe(31.91)
  expect(r.obveznost).toBe(123.37)
})

test('K1: test s.p. Q3 2026 - razclenitev po virih in stopnjah', () => {
  const r = izracunajDdvIzPodatkov(testSp, Q3_2026)
  // izdani racuni: 2 rocna + 6 Stripe, vsi 22 %
  expect(r.izstopniDdv.izdaniRacuni['22']).toEqual({ osnova: 688.34, ddv: 151.4 })
  // POS: 4 x 3 EUR po 22 %, 4 x 5 EUR po 9,5 % - DDV zaokrozen po racunu
  expect(r.izstopniDdv.blagajna['22']).toEqual({ osnova: 9.84, ddv: 2.16 })
  expect(r.izstopniDdv.blagajna['9.5']).toEqual({ osnova: 18.28, ddv: 1.72 })
  // Stripe KPO vnosi so povezani z racunom (invoice_id) - ne stejejo se dvakrat
  expect(r.izstopniDdv.kpo['22'].ddv).toBe(0)
  // prejeti racun ELLE GI po 9,5 %; racun iz 2024 ne sodi v Q3 2026
  expect(r.vstopniDdv.prejetiRacuni['9.5']).toEqual({ osnova: 335.9, ddv: 31.91 })
  expect(r.stevilo).toEqual({ izdaniRacuni: 8, prejetiRacuni: 1, kpo: 0, narocila: 8 })
})

test('K1: test s.p. - mesecna shema: julij + avgust + september = Q3', () => {
  const m = [7, 8, 9].map(mesec => izracunajDdvIzPodatkov(testSp, { leto: 2026, mesec }).obveznost)
  expect(m).toEqual([0, 98.97, 24.4])
  expect(Math.round(m.reduce((s, x) => s + x, 0) * 100) / 100).toBe(123.37)
})

// ─────────────── K1: pravila izracuna ───────────────

test('K1: negativna obveznost (vracilo) se NE skrije', () => {
  const p = prazniPodatki()
  p.prejeti.push({ receipt_date: '2026-08-01', amount_net: 1000, vat_amount: 220, vat_rate: 22 })
  expect(izracunajDdvIzPodatkov(p, Q3_2026).obveznost).toBe(-220)
})

test('K1: KPO povzetki blagajne se ne stejejo poleg narocil (dvojno stetje)', () => {
  const p = prazniPodatki()
  p.narocila.push({ closed_at: '2026-08-10T10:00:00Z', total: 12.2, tip_amount: 0, order_lines: [{ total: 12.2, qty: 1, unit_price: 12.2, vat_rate: 22, voided: false }], payments: [{ method: 'cash' }] })
  for (const category of ['pos_prodaja', 'pos_storitve', 'POS promet']) {
    p.kpo.push({ entry_date: '2026-08-31', category, income: 10, expense: 0, vat_out: 2.2, vat_in: 0, vat_rate: 22, invoice_id: null, receipt_id: null })
  }
  const r = izracunajDdvIzPodatkov(p, Q3_2026)
  expect(r.izstopniDdv.skupaj).toBe(2.2)
  expect(r.izstopniDdv.kpo['22'].ddv).toBe(0)
})

test('K1: brez blagajne se KPO kategorija pos_prodaja steje (ni narocil, iz katerih bi brali)', () => {
  const p = { ...prazniPodatki(), imaBlagajno: false }
  p.kpo.push({ entry_date: '2026-08-31', category: 'pos_prodaja', income: 10, expense: 0, vat_out: 2.2, vat_in: 0, vat_rate: 22, invoice_id: null, receipt_id: null })
  expect(izracunajDdvIzPodatkov(p, Q3_2026).izstopniDdv.skupaj).toBe(2.2)
})

test('K1: KPO prihodek brez DDV (kartice, banka) gre v 0 %, ne v 22 %', () => {
  const p = prazniPodatki()
  p.kpo.push({ entry_date: '2026-08-31', category: 'Kartično poslovanje', income: 500, expense: 0, vat_out: 0, vat_in: 0, vat_rate: null, invoice_id: null, receipt_id: null })
  const r = izracunajDdvIzPodatkov(p, Q3_2026)
  expect(r.izstopniDdv.kpo['0']).toEqual({ osnova: 500, ddv: 0 })
  expect(r.izstopniDdv.kpo['22']).toEqual({ osnova: 0, ddv: 0 })
})

test('K1: KPO vstopni DDV brez prejetega racuna se uposteva; vnosi brez DDV (place) niso nabave', () => {
  const p = prazniPodatki()
  p.kpo.push({ entry_date: '2026-08-15', category: 'Gorivo', income: 0, expense: 50, vat_out: 0, vat_in: 11, vat_rate: null, invoice_id: null, receipt_id: null })
  p.kpo.push({ entry_date: '2026-08-15', category: 'Plače', income: 0, expense: 1924.04, vat_out: 0, vat_in: 0, vat_rate: null, invoice_id: null, receipt_id: null })
  p.kpo.push({ entry_date: '2026-08-15', category: 'Prehrana', income: 0, expense: 100, vat_out: 0, vat_in: 22, vat_rate: null, invoice_id: null, receipt_id: 'r1' })
  const r = izracunajDdvIzPodatkov(p, Q3_2026)
  expect(r.vstopniDdv.kpo['22']).toEqual({ osnova: 50, ddv: 11 })
  expect(r.vstopniDdv.osnovaSkupaj).toBe(50)
})

test('K1: POS - popust na racunu zmanjsa DDV sorazmerno, napitnina ni obdavcena', () => {
  // 2 artikla po 10 EUR (22 %), popust 50 % -> zaracunano 10 EUR + 1 EUR napitnine
  const d = razcleniNarocilo({
    closed_at: '2026-08-10T10:00:00Z', total: 11, tip_amount: 1,
    order_lines: [{ total: 10, qty: 1, unit_price: 10, vat_rate: 22, voided: false }, { total: 10, qty: 1, unit_price: 10, vat_rate: 22, voided: false }],
    payments: [{ method: 'cash' }],
  })
  expect(d).toEqual([{ stopnja: '22', osnova: 820, ddv: 180 }]) // centi: 8,20 + 1,80 = 10,00
})

test('K1: POS - stornirane vrstice, unovcenje karte (pkg) in DEMO racuni niso promet', () => {
  const p = prazniPodatki()
  const vrstica = (total: number, voided = false) => ({ total, qty: 1, unit_price: total, vat_rate: 22, voided })
  p.narocila.push({ closed_at: '2026-08-10T10:00:00Z', total: 12.2, tip_amount: 0, order_lines: [vrstica(12.2), vrstica(50, true)], payments: [{ method: 'cash' }] })
  p.narocila.push({ closed_at: '2026-08-10T11:00:00Z', total: 0, tip_amount: 0, order_lines: [vrstica(50)], payments: [{ method: 'pkg' }] })
  p.narocila.push({ closed_at: '2026-08-10T12:00:00Z', total: 12.2, tip_amount: 0, invoice_number: 'DEMO1-BLAG1-5', order_lines: [vrstica(12.2)], payments: [{ method: 'cash' }] })
  const r = izracunajDdvIzPodatkov(p, Q3_2026)
  expect(r.izstopniDdv.blagajna['22']).toEqual({ osnova: 10, ddv: 2.2 })
  expect(r.stevilo.narocila).toBe(1)
})

test('K1: POS - prodaja ob 0:30 po slovenskem casu sodi v NASLEDNJI dan (in cetrtletje)', () => {
  // 30.9.2026 22:30 UTC = 1.10.2026 00:30 CEST
  expect(lokalniDanIzCasa('2026-09-30T22:30:00Z')).toBe('2026-10-01')
  const p = prazniPodatki()
  p.narocila.push({ closed_at: '2026-09-30T22:30:00Z', total: 12.2, tip_amount: 0, order_lines: [{ total: 12.2, qty: 1, unit_price: 12.2, vat_rate: 22, voided: false }], payments: [{ method: 'cash' }] })
  expect(izracunajDdvIzPodatkov(p, Q3_2026).izstopniDdv.skupaj).toBe(0)
  expect(izracunajDdvIzPodatkov(p, { leto: 2026, cetrtletje: 4 }).izstopniDdv.skupaj).toBe(2.2)
})

test('K2: izdan racun z mesanimi stopnjami - razclenitev iz postavk, vsota = glava racuna', () => {
  const d = razcleniIzdanRacun({
    issue_date: '2026-08-01', amount_net: 200, vat_amount: 31.5,
    line_items: [{ quantity: 1, unit_price: 100, vat_rate: 22 }, { quantity: 1, unit_price: 100, vat_rate: 9.5 }],
  })
  expect(d).toEqual([
    { stopnja: '22', osnova: 10000, ddv: 2200 },
    { stopnja: '9.5', osnova: 10000, ddv: 950 },
  ])
})

test('K2: izdan racun - zaokrozevanje: vsota po stopnjah je tocno glava racuna', () => {
  const d = razcleniIzdanRacun({
    issue_date: '2026-08-01', amount_net: 10, vat_amount: 1.61,
    line_items: [{ quantity: 1, unit_price: 3.33, vat_rate: 22 }, { quantity: 1, unit_price: 3.33, vat_rate: 9.5 }, { quantity: 1, unit_price: 3.34, vat_rate: 5 }],
  })
  expect(d.reduce((s, x) => s + x.osnova, 0)).toBe(1000)
  expect(d.reduce((s, x) => s + x.ddv, 0)).toBe(161)
  expect(d.map(x => x.stopnja).sort()).toEqual(['22', '5', '9.5'])
})

test('K2: dobropis (negativni zneski, pozitivne postavke) zmanjsa DDV svoje stopnje', () => {
  const p = prazniPodatki()
  p.racuni.push({ issue_date: '2026-08-01', amount_net: 100, vat_amount: 22, line_items: [{ quantity: 1, unit_price: 100, vat_rate: 22 }] })
  p.racuni.push({ issue_date: '2026-08-05', amount_net: -50, vat_amount: -11, line_items: [{ quantity: 1, unit_price: 50, vat_rate: 22 }] })
  expect(izracunajDdvIzPodatkov(p, Q3_2026).izstopniDdv.izdaniRacuni['22']).toEqual({ osnova: 50, ddv: 11 })
})

test('K2: oproscen racun (postavka brez stopnje, glava brez DDV) je 0 %, ne 22 %', () => {
  const d = razcleniIzdanRacun({ issue_date: '2026-08-01', amount_net: 289, vat_amount: 0, line_items: [{ quantity: 1, unit_price: 289 }] })
  expect(d).toEqual([{ stopnja: '0', osnova: 28900, ddv: 0 }])
})

// ─────────────── K2: DDV-O XML ───────────────

const ZAVEZANEC = { tax_number: '12345678', id_za_ddv: 'SI12345678', name: 'test s.p.' }
const polje = (xml: string, ime: string) => {
  const m = xml.match(new RegExp(`<${ime}>([^<]*)</${ime}>`))
  return m ? m[1] : null
}

test('K2: DDV-O XML za test s.p. Q3 2026 - P53 = 123,37 (enako kot izracunajDdv)', () => {
  const r = izracunajDdvIzPodatkov(testSp, Q3_2026)
  const xml = sestaviDdvOXml(ZAVEZANEC, r, { leto: 2026, cetrtletje: 3 }, '2026-10-05')
  expect(polje(xml, 'P11')).toBe('698.18')   // 688,34 racuni + 9,84 POS
  expect(polje(xml, 'P12')).toBe('153.56')
  expect(polje(xml, 'P21')).toBe('18.28')    // POS burgerji po 9,5 % (prej: v 22 %)
  expect(polje(xml, 'P22')).toBe('1.72')
  expect(polje(xml, 'P42')).toBe('31.91')
  expect(polje(xml, 'P51')).toBe('155.28')
  expect(polje(xml, 'P53')).toBe('123.37')
  expect(polje(xml, 'Kvartal')).toBe('3')
})

test('K2: izdan racun po 9,5 % gre v P21/P22, ne v P11/P12 (glava racuna nima stolpca vat_rate)', () => {
  const p = prazniPodatki()
  p.racuni.push({ issue_date: '2026-07-06', amount_net: 1215, vat_amount: 115.43, line_items: [{ quantity: 1, unit_price: 1215, vat_rate: 9.5 }] })
  const xml = sestaviDdvOXml(ZAVEZANEC, izracunajDdvIzPodatkov(p, Q3_2026), { leto: 2026, cetrtletje: 3 }, '2026-10-05')
  expect(polje(xml, 'P11')).toBe('0.00')
  expect(polje(xml, 'P21')).toBe('1215.00')
  expect(polje(xml, 'P22')).toBe('115.43')
})

test('K2: KPO prihodek brez DDV (kartice) je v vrstici 0 % (P15), ne v osnovi 22 % (P11)', () => {
  const p = prazniPodatki()
  p.kpo.push({ entry_date: '2026-08-31', category: 'Kartično poslovanje', income: 500, expense: 0, vat_out: 0, vat_in: 0, vat_rate: null, invoice_id: null, receipt_id: null })
  const xml = sestaviDdvOXml(ZAVEZANEC, izracunajDdvIzPodatkov(p, Q3_2026), { leto: 2026, cetrtletje: 3 }, '2026-10-05')
  expect(polje(xml, 'P11')).toBe('0.00')
  expect(polje(xml, 'P15')).toBe('500.00')
})

test('K2: 5 % stopnja je podprta (P31/P32)', () => {
  const p = prazniPodatki()
  p.racuni.push({ issue_date: '2026-08-01', amount_net: 100, vat_amount: 5, line_items: [{ quantity: 1, unit_price: 100, vat_rate: 5 }] })
  const xml = sestaviDdvOXml(ZAVEZANEC, izracunajDdvIzPodatkov(p, Q3_2026), { leto: 2026, cetrtletje: 3 }, '2026-10-05')
  expect(polje(xml, 'P31')).toBe('100.00')
  expect(polje(xml, 'P32')).toBe('5.00')
  expect(polje(xml, 'P11')).toBe('0.00')
  expect(VAT_RATES.superReduced).toBe(5)
})

test('K2: vracilo DDV je v P53 NEGATIVNO (prej Math.max(0, ...) = 0,00)', () => {
  const p = prazniPodatki()
  p.racuni.push({ issue_date: '2026-08-01', amount_net: 100, vat_amount: 22, line_items: [{ quantity: 1, unit_price: 100, vat_rate: 22 }] })
  p.prejeti.push({ receipt_date: '2026-08-02', amount_net: 1000, vat_amount: 220, vat_rate: 22 })
  const xml = sestaviDdvOXml(ZAVEZANEC, izracunajDdvIzPodatkov(p, Q3_2026), { leto: 2026, cetrtletje: 3 }, '2026-10-05')
  expect(polje(xml, 'P53')).toBe('-198.00')
})

test('K2: mesecna shema - XML nosi Mesec namesto Kvartal', () => {
  const r = izracunajDdvIzPodatkov(testSp, { leto: 2026, mesec: 9 })
  const xml = sestaviDdvOXml(ZAVEZANEC, r, { leto: 2026, mesec: 9 }, '2026-10-05')
  expect(polje(xml, 'Mesec')).toBe('9')
  expect(polje(xml, 'Kvartal')).toBeNull()
  expect(polje(xml, 'ObdobjeOd')).toBe('2026-09-01')
  expect(polje(xml, 'P53')).toBe('24.40')
})

// ─────────────── K1: ista stevilka v izvozu za racunovodjo ───────────────

test('K1: izvoz XLSX - "DDV za placilo" je enak izracunajDdv (test s.p. Q3 2026)', () => {
  const ddv = izracunajDdvIzPodatkov(testSp, Q3_2026)
  const buf = generateAccountingXLSX({
    orgName: 'test s.p.', orgTaxNumber: null, orgAddress: null,
    periodLabel: 'Q3 2026', periodFrom: '2026-07-01', periodTo: '2026-09-30',
    issuedInvoices: [], receipts: [], kpoEntries: [], ddv,
  })
  const wb = XLSX.read(buf, { type: 'buffer' })
  const vrstice = wb.SheetNames.flatMap(n => XLSX.utils.sheet_to_json<any[]>(wb.Sheets[n], { header: 1 }))
  const vrednost = (oznaka: string) => vrstice.find(r => r[0] === oznaka)?.[1]
  expect(vrednost('DDV izhodni')).toBe(155.28)
  expect(vrednost('DDV vstopni')).toBe(31.91)
  expect(vrednost('DDV za plačilo (oz. vračilo če negativen)')).toBe(123.37)
})

// ─────────────── K1: noben del kode ne racuna DDV po svoje ───────────────

/**
 * Staticna varovalka: strani in izvozi, ki prikazujejo DDV obveznost, morajo
 * uvoziti lib/ddv in NE smejo sami sestevati vat_amount/vat_out/vat_in.
 * Prav to je povzrocilo K1 - vsaka stran je imela svoj sestevek.
 */
const POTROSNIKI = [
  'app/dashboard/page.tsx',
  'app/ddv/page.tsx',
  'app/ddv/evidenca/page.tsx',
  'app/porocila/page.tsx',
  'app/letni-pregled/page.tsx',
  'app/ai/page.tsx',
  'app/api/v1/stats/route.ts',
  'app/api/exports/accounting/route.ts',
  'lib/accounting-export.ts',
  'lib/ddv-o.ts',
]
const LASTEN_SESTEVEK_DDV = /reduce\([^;]*?Number\(\s*\w+\.(vat_amount|vat_out|vat_in)\b/
/** Vsote, ki NISO DDV obveznost - vsaka z razlogom. */
const DOVOLJENE_VSOTE: Record<string, RegExp[]> = {
  // drseci 12-mesecni PROMET za prag registracije (nezavezanci) - ne DDV
  'app/ddv/page.tsx': [/const kpoNet = /],
  // vsota stolpca DDV v tabelah KIR/KPR (seznam dokumentov), ne obveznost
  'lib/accounting-export.ts': [/const totalVat = /, /const totalKprVat = /],
  // DDV prejetih racunov za izracun neto DOBICKA, ne obveznost
  'app/api/v1/stats/route.ts': [/const receiptsVat = /],
}

for (const pot of POTROSNIKI) {
  test(`K1: ${pot} uporablja lib/ddv in ne racuna DDV sam`, () => {
    const vir = readFileSync(join(__dirname, '..', pot), 'utf8')
    if (pot !== 'lib/accounting-export.ts') expect(vir).toMatch(/from '@\/lib\/ddv(-o)?'/)
    const zadetki = vir.split('\n').filter(v => LASTEN_SESTEVEK_DDV.test(v))
    const izjeme = DOVOLJENE_VSOTE[pot] || []
    expect(zadetki.filter(v => !izjeme.some(re => re.test(v)))).toEqual([])
    // K2: vracilo DDV se ne sme skriti z Math.max(0, ...)
    expect(vir.split('\n').filter(v => /Math\.max\(\s*0\s*,[^)]*(vat|ddv|obveznost)/i.test(v))).toEqual([])
  })
}

// ─────────────── K1: nad bazo (test s.p. in SIRM, Q3 2026) ───────────────

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const bazaNaVoljo = !!URL && !!KEY && /^https?:\/\//.test(URL) && KEY.length >= 40

test.describe('K1 nad bazo', () => {
  test.skip(!bazaNaVoljo, 'Nastavi NEXT_PUBLIC_SUPABASE_URL in SUPABASE_SERVICE_ROLE_KEY (glej tests/baza.spec.ts).')

  test('test s.p. Q3 2026: izracunajDdv vrne 123,37', async () => {
    const db = createClient(URL!, KEY!)
    const r = await izracunajDdv('3a46b81e-97dc-486d-be7a-d08f993704f1', Q3_2026, db)
    expect(r.obveznost).toBe(123.37)
  })

  test('SIRM Q3 2026: izracunajDdv vrne 1.778,22 (vkljucno z blagajno, >1000 narocil)', async () => {
    const db = createClient(URL!, KEY!)
    const r = await izracunajDdv('1d406efe-58d0-4573-8679-d9f666fce964', Q3_2026, db)
    expect(r.izstopniDdv.skupaj).toBe(3149.03)
    expect(r.vstopniDdv.skupaj).toBe(1370.81)
    expect(r.obveznost).toBe(1778.22)
    expect(r.stevilo.narocila).toBeGreaterThan(1000) // branje po straneh deluje
  })
})
