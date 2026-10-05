import { test, expect } from '@playwright/test'
import {
  najdiIzdanRacun, najdiKarticniObracun, najdiPrejetiRacun, karticniObracuniIzKpo, razcleniPriliv,
  type BancnaTransakcija,
} from '../lib/banka-ujemanje'
import { knjiziKarticniObracun, odlociPrihodek } from '../lib/kartice-knjizenje'
import { laznaBaza } from './pomoc/lazna-baza'

/**
 * REVIZIJA V1/V2 (oktober 2026): bancni uvoz in kartični obracuni ne smejo
 * knjiziti prometa, ki je ze v knjigi.
 *
 * Primeri so vzeti iz podatkov SIRM (Q2 2026):
 *   · 6.4. kartični obracun Worldline 1.215,58 bruto (provizija 1,5 %), 7.4.
 *     bancno izplacilo 1.195,19 (sklic RE…-303684912) - knjizeno kot "Drugo"
 *   · 30.6. izplacilo 375,59 za obracun 396,97 (odstopanje 5 %)
 *   · 3., 8., 8.6. trije prilivi po 479,98 - racuni 2026-007/010/011 (placani)
 *   · 18.6. odliv 269,40 - prejeti racun PETROL 8.6.
 */

const tr = (date: string, amount: number, type: 'credit' | 'debit', description = '', reference = ''): BancnaTransakcija => ({ date, amount, type, description, reference })

const RACUNI = [
  { id: 'r7', invoice_number: '2026-007', amount_total: 479.98, issue_date: '2026-06-02', due_date: '2026-06-10', status: 'paid', client_name: 'Bernarda Frelih' },
  { id: 'r10', invoice_number: '2026-010', amount_total: 479.98, issue_date: '2026-06-02', due_date: '2026-06-10', status: 'paid', client_name: 'ARHITEKTURA PETERNEL d.o.o.' },
  { id: 'r11', invoice_number: '2026-011', amount_total: 479.98, issue_date: '2026-06-02', due_date: '2026-06-10', status: 'paid', client_name: 'ELEKTRO MOJS3' },
]
const KPO_KARTICE = [
  { id: 'k1', entry_date: '2026-04-06', category: 'Kartično poslovanje', income: 1215.58, expense: 0, description: 'Kartično poslovanje Wordline / Payten — 2026-03-30 do 2026-04-06' },
  { id: 'f1', entry_date: '2026-04-06', category: 'Bančne provizije', income: 0, expense: 18.23, description: 'Provizija Wordline / Payten — 1.5%' },
  { id: 'k2', entry_date: '2026-06-29', category: 'Kartično poslovanje', income: 396.97, expense: 0, description: 'Kartično poslovanje Wordline / Payten — 2026-06-22 do 2026-06-29' },
  { id: 'f2', entry_date: '2026-06-29', category: 'Bančne provizije', income: 0, expense: 5.95, description: 'Provizija Wordline / Payten — 1.5%' },
]
const PREJETI = [
  { id: 'p1', vendor: 'PETROL, SLOVENSKA ENERGETSKA DRUŽBA, D.D.', amount_total: 269.4, receipt_date: '2026-06-08' },
  { id: 'p2', vendor: 'Lovable Labs Incorporated', amount_total: 30, receipt_date: '2026-04-04' },
  { id: 'p3', vendor: 'Lovable Labs Incorporated', amount_total: 30, receipt_date: '2026-04-09' },
]

test('V1: priliv za ZE PLACAN racun se prepozna (prej: nov prihodek "Drugo")', () => {
  const porabljeni = new Set<string>()
  const izidi = [tr('2026-06-03', 479.98, 'credit'), tr('2026-06-08', 479.98, 'credit'), tr('2026-06-08', 479.98, 'credit')]
    .map(t => { const z = najdiIzdanRacun(t, RACUNI, porabljeni); if (z) porabljeni.add(z.racun.id); return z?.racun.invoice_number })
  expect(new Set(izidi)).toEqual(new Set(['2026-007', '2026-010', '2026-011']))
})

test('V1: sklic s stevilko racuna = gotovo', () => {
  expect(najdiIzdanRacun(tr('2026-06-20', 479.98, 'credit', 'Placilo', 'SI00 2026-010'), RACUNI)).toMatchObject({ racun: { id: 'r10' }, zanesljivost: 'gotovo' })
})

test('V1: priliv brez ustreznega racuna ni ujemanje', () => {
  expect(najdiIzdanRacun(tr('2026-06-03', 480, 'credit'), RACUNI)).toBeNull()
  expect(najdiIzdanRacun(tr('2026-06-03', 479.98, 'debit'), RACUNI)).toBeNull()
})

test('V1/V2: izplacilo kartičnega obracuna (bruto − provizija, 1 dan pozneje) = ze v knjigi', () => {
  const obracuni = karticniObracuniIzKpo(KPO_KARTICE)
  expect(najdiKarticniObracun(tr('2026-04-07', 1195.19, 'credit', 'Bančni priliv', 'RE202604060012167-303684912'), obracuni))
    .toMatchObject({ obracun: { id: 'k1' }, zanesljivost: 'gotovo' })
  // 5 % odstopanja: le predlog, ki ga mora uporabnik potrditi
  expect(najdiKarticniObracun(tr('2026-06-30', 375.59, 'credit'), obracuni)).toMatchObject({ obracun: { id: 'k2' }, zanesljivost: 'verjetno' })
  // pred obracunom ali vec kot 7 dni pozneje - ni izplacilo tega obracuna
  expect(najdiKarticniObracun(tr('2026-04-05', 1195.19, 'credit'), obracuni)).toBeNull()
  expect(najdiKarticniObracun(tr('2026-04-20', 1195.19, 'credit'), obracuni)).toBeNull()
})

test('V1: odliv za ze vnesen prejeti racun = ze v knjigi (ime dobavitelja -> gotovo)', () => {
  expect(najdiPrejetiRacun(tr('2026-06-18', 269.4, 'debit', 'PETROL D.D. LJUBLJANA'), PREJETI)).toMatchObject({ racun: { id: 'p1' }, zanesljivost: 'gotovo' })
  // brez imena in vec kandidatov: le predlog
  expect(najdiPrejetiRacun(tr('2026-04-11', 30, 'debit', 'Bančni odliv'), PREJETI)).toMatchObject({ zanesljivost: 'verjetno' })
  // vsak prejeti racun se porabi le enkrat
  const porabljeni = new Set(['p1'])
  expect(najdiPrejetiRacun(tr('2026-06-18', 269.4, 'debit', 'PETROL'), PREJETI, porabljeni)).toBeNull()
})

test('V1: priliv brez racuna pri DDV zavezancu: bruto -> osnova + DDV po izbrani stopnji', () => {
  expect(razcleniPriliv(122, 22)).toEqual({ neto: 100, ddv: 22 })
  expect(razcleniPriliv(109.5, 9.5)).toEqual({ neto: 100, ddv: 9.5 })
  expect(razcleniPriliv(500, 0)).toEqual({ neto: 500, ddv: 0 })
})

test('V1: SIRM Q2 vzorec - po popravku se nobeden od podvojenih prilivov/odlivov ne knjizi znova', () => {
  // Bancni izpis kot ga je SIRM uvozil (vrstice, ki so bile knjizene kot "Drugo")
  const izpis = [
    tr('2026-04-07', 1195.19, 'credit', 'Bančni priliv', 'RE202604060012167-303684912'),
    tr('2026-06-03', 479.98, 'credit'), tr('2026-06-08', 479.98, 'credit'), tr('2026-06-08', 479.98, 'credit'),
    tr('2026-06-18', 269.4, 'debit', 'PETROL'),
    tr('2026-06-20', 1500, 'credit', 'Posojilo'), // NOV promet - mora ostati
  ]
  const obracuni = karticniObracuniIzKpo(KPO_KARTICE)
  const pR = new Set<string>(), pK = new Set<string>(), pP = new Set<string>()
  const novo = izpis.filter(t => {
    const r = najdiIzdanRacun(t, RACUNI, pR); if (r) { pR.add(r.racun.id); return false }
    const k = najdiKarticniObracun(t, obracuni, pK); if (k?.zanesljivost === 'gotovo') { pK.add(k.obracun.id); return false }
    const p = najdiPrejetiRacun(t, PREJETI, pP); if (p?.zanesljivost === 'gotovo') { pP.add(p.racun.id); return false }
    return true
  })
  expect(novo).toEqual([tr('2026-06-20', 1500, 'credit', 'Posojilo')])
})

// ─────────────── V2: kartični obracun ───────────────

test('V2: odlocitev - blagajna s kartičnimi placili: prihodek se NE knjizi (razen ce uporabnik potrdi)', () => {
  expect(odlociPrihodek({ imaBlagajno: true, posKartice: 4675.23, prisili: false, vatRegistered: true, ddvStopnja: 22 })).toBe('izpusti_blagajna')
  expect(odlociPrihodek({ imaBlagajno: true, posKartice: 4675.23, prisili: true, vatRegistered: true, ddvStopnja: 22 })).toBe('knjizi')
  expect(odlociPrihodek({ imaBlagajno: true, posKartice: 0, prisili: false, vatRegistered: true, ddvStopnja: 22 })).toBe('knjizi')
  expect(odlociPrihodek({ imaBlagajno: false, posKartice: 0, prisili: false, vatRegistered: true, ddvStopnja: null })).toBe('manjka_ddv')
  expect(odlociPrihodek({ imaBlagajno: false, posKartice: 0, prisili: false, vatRegistered: false, ddvStopnja: null })).toBe('knjizi')
})

const OBR = { procesor: 'Worldline / Payten', od: '2026-09-01', do: '2026-09-07', bruto: 1220, provizija: 18.3, provizijaPct: 1.5, transakcij: 40, opomba: '', ddvStopnja: 22, prisiliPrihodek: false }

test('V2: organizacija z blagajno - knjizi se samo provizija (kartice so ze v prometu blagajne)', async () => {
  const db = laznaBaza({
    orders: [{ business_id: 'b1', status: 'paid', closed_at: '2026-09-03T10:00:00Z', payments: [{ method: 'card', amount: 1220 }] }],
    kpo_entries: [],
  })
  const izid = await knjiziKarticniObracun(db, { id: 'o1', vat_registered: true, pos_business_id: 'b1' }, OBR)
  expect(izid).toMatchObject({ prihodek: 'izpuscen_blagajna', posKartice: 1220, provizija: true })
  expect(db.tabele.kpo_entries.map((e: any) => e.category)).toEqual(['Bančne provizije'])
})

test('V2: zavezanec brez blagajne - prihodek z izstopnim DDV (prej DDV 0)', async () => {
  const db = laznaBaza({ kpo_entries: [] })
  await knjiziKarticniObracun(db, { id: 'o1', vat_registered: true, pos_business_id: null }, OBR)
  const prihodek = db.tabele.kpo_entries.find((e: any) => e.category === 'Kartično poslovanje')
  expect(prihodek).toMatchObject({ income: 1000, vat_out: 220, vat_rate: 22 })
})

test('V2: zavezanec brez izbrane stopnje DDV - nic se ne knjizi', async () => {
  const db = laznaBaza({ kpo_entries: [] })
  const izid = await knjiziKarticniObracun(db, { id: 'o1', vat_registered: true, pos_business_id: null }, { ...OBR, ddvStopnja: null })
  expect(izid.prihodek).toBe('manjka_ddv')
  expect(db.tabele.kpo_entries).toEqual([])
})

test('V2: ze uvozeno bancno izplacilo istega obracuna se PRETVORI (en vnos, ne dva)', async () => {
  const db = laznaBaza({ kpo_entries: [
    { id: 'banka1', org_id: 'o1', entry_date: '2026-09-08', entry_type: 'income', category: 'Drugo', income: 1201.7, expense: 0, vat_out: 0, invoice_id: null, notes: 'Bančni uvoz · RE2026…' },
  ] })
  const izid = await knjiziKarticniObracun(db, { id: 'o1', vat_registered: true, pos_business_id: null }, OBR)
  expect(izid).toMatchObject({ prihodek: 'pretvorjen', bancniVnosId: 'banka1' })
  const prihodki = db.tabele.kpo_entries.filter((e: any) => e.entry_type === 'income')
  expect(prihodki).toHaveLength(1)
  expect(prihodki[0]).toMatchObject({ id: 'banka1', category: 'Kartično poslovanje', income: 1000, vat_out: 220 })
})
