import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { knjiziPosDneve, izracunajPosKnjizbe, dneviMed, posKljuc, lokalniDan, type PosNarocilo, type PosVracilo } from '../lib/pos-kpo'
import { izracunajDdvIzPodatkov, type DdvPodatki } from '../lib/ddv'
import { laznaBaza } from './pomoc/lazna-baza'

/**
 * REVIZIJA K5, V4, V5 (oktober 2026): POS → KPO po dnevih, storno in vracila,
 * ena sama pot.
 *
 * Scenarij: izmena od ponedeljka 29.9.2026 (Q3) do cetrtka 2.10.2026 (Q4).
 *   A   29.9.  12,20 po 22 %                              → Q3
 *   B   29.9.  10,95 po 9,5 %, STORNO 1.10. (med izmeno)  → + Q3, − Q4
 *   C   1.10. ob 0:30 (30.9. 22:30 UTC) 24,40 po 22 %     → Q4 (lokalni dan!)
 *   D   1.10.  12,20 po 22 % + 10,95 po 9,5 %, VRACILO 11,58 isti dan
 *   E   2.10.  6,10 po 22 %, STORNO 3.10. - PO zakljucku izmene
 *   K   29.9.  unovcenje karte obiskov (pkg) - ni promet
 * Zakljucek izmene: 2.10. 18:00 UTC.
 *
 * Prej (K5): vse knjizeno z datumom zakljucka (2.10., Q4), storno B izpuscen
 * (ker je bil stornirad pred zakljuckom), storno E in vracilo D NIKJER.
 */

const ORG = 'o1'
const BIZ = 'b1'
const v = (total: number, vat_rate: number) => ({ total, qty: 1, unit_price: total, vat_rate, voided: false, service_id: null, items: { bookable: false } })
const placano = [{ method: 'cash' }]

function narocila(): Record<string, PosNarocilo & { business_id: string }> {
  return {
    A: { id: 'A', business_id: BIZ, status: 'paid', closed_at: '2026-09-29T10:00:00Z', voided_at: null, total: 12.2, tip_amount: 0, order_lines: [v(12.2, 22)], payments: placano },
    B: { id: 'B', business_id: BIZ, status: 'voided', closed_at: '2026-09-29T11:00:00Z', voided_at: '2026-10-01T08:00:00Z', total: 10.95, tip_amount: 0, order_lines: [v(10.95, 9.5)], payments: placano },
    C: { id: 'C', business_id: BIZ, status: 'paid', closed_at: '2026-09-30T22:30:00Z', voided_at: null, total: 24.4, tip_amount: 0, order_lines: [v(24.4, 22)], payments: placano },
    D: { id: 'D', business_id: BIZ, status: 'paid', closed_at: '2026-10-01T09:00:00Z', voided_at: null, total: 23.15, tip_amount: 0, order_lines: [v(12.2, 22), v(10.95, 9.5)], payments: placano },
    E: { id: 'E', business_id: BIZ, status: 'paid', closed_at: '2026-10-02T09:00:00Z', voided_at: null, total: 6.1, tip_amount: 0, order_lines: [v(6.1, 22)], payments: placano },
    K: { id: 'K', business_id: BIZ, status: 'paid', closed_at: '2026-09-29T12:00:00Z', voided_at: null, total: 0, tip_amount: 0, order_lines: [v(50, 22)], payments: [{ method: 'pkg' }] },
  }
}
const IZMENA = { od: '2026-09-29T06:00:00Z', do: '2026-10-02T18:00:00Z' }

function pripravi(legacy: any[] = []) {
  const n = narocila()
  const vracilo = { id: 'R1', business_id: BIZ, refunded_at: '2026-10-01T10:00:00Z', amount: 11.58, orders: n.D }
  const db = laznaBaza({ orders: Object.values(n), refunds: [vracilo], kpo_entries: legacy })
  return { db, n }
}

/** KPO vnosi kot {dan|vrsta|stopnja: [neto, ddv]} v evrih. */
function knjiga(db: any) {
  const out: Record<string, [number, number]> = {}
  for (const e of db.tabele.kpo_entries.filter((e: any) => e.pos_kljuc)) {
    const [, , dan, vrsta, stopnja] = e.pos_kljuc.split(':')
    out[`${dan}|${vrsta}|${stopnja}`] = [e.income, e.vat_out]
  }
  return out
}
const vsotaDdv = (db: any, od: string, do_: string) => Math.round(db.tabele.kpo_entries
  .filter((e: any) => e.entry_date >= od && e.entry_date <= do_)
  .reduce((s: number, e: any) => s + Number(e.vat_out), 0) * 100) / 100

test('K5: dnevi izmene se dolocijo po LOKALNEM datumu (meja dneva 0:00 CEST)', () => {
  expect(lokalniDan('2026-09-30T22:30:00Z')).toBe('2026-10-01')
  expect(dneviMed(IZMENA.od, IZMENA.do)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
})

test('K5 + V4: zakljucek izmene cez mejo cetrtletja knjizi po dnevih prodaje, storno in vracilo na svoj dan', async () => {
  const { db } = pripravi()
  await knjiziPosDneve(db, ORG, BIZ, dneviMed(IZMENA.od, IZMENA.do))
  expect(knjiga(db)).toEqual({
    '2026-09-29|izdelek|22': [10, 2.2],      // A
    '2026-09-29|izdelek|9.5': [10, 0.95],    // B (prodaja ostane v Q3)
    '2026-10-01|izdelek|22': [25, 5.5],      // C 20,00/4,40 + D 10,00/2,20 − vracilo 5,00/1,10
    '2026-10-01|izdelek|9.5': [-5, -0.48],   // − storno B 10,00/0,95 + D 10,00/0,95 − vracilo 5,00/0,48
    '2026-10-02|izdelek|22': [5, 1.1],       // E (se ni storniran)
  })
  // K (karta obiskov) ni promet; Q3 nosi samo racune Q3
  expect(vsotaDdv(db, '2026-07-01', '2026-09-30')).toBe(3.15)
  expect(vsotaDdv(db, '2026-10-01', '2026-12-31')).toBe(6.12)
})

test('V4: storno PO zakljucku izmene ustvari popravek na dan storna (prej ga ni bilo nikjer)', async () => {
  const { db } = pripravi()
  await knjiziPosDneve(db, ORG, BIZ, dneviMed(IZMENA.od, IZMENA.do))
  // 3.10. storniramo E - izmena 29.9.-2.10. je ze zaprta
  const e = db.tabele.orders.find((o: any) => o.id === 'E')
  Object.assign(e, { status: 'voided', voided_at: '2026-10-03T09:00:00Z' })
  await knjiziPosDneve(db, ORG, BIZ, [lokalniDan('2026-10-03T09:00:00Z')])
  const k = knjiga(db)
  expect(k['2026-10-02|izdelek|22']).toEqual([5, 1.1])    // dan izdaje ostane nespremenjen
  expect(k['2026-10-03|izdelek|22']).toEqual([-5, -1.1])  // popravek na dan storna
  expect(vsotaDdv(db, '2026-10-01', '2026-12-31')).toBe(5.02)
})

test('V5: Z-porocilo, ponovni zakljucek in storno knjizijo ISTE dni - promet ni nikoli podvojen', async () => {
  const { db } = pripravi()
  const dnevi = dneviMed(IZMENA.od, IZMENA.do)
  await knjiziPosDneve(db, ORG, BIZ, dnevi)              // "Zakljuci"
  const prej = JSON.stringify(knjiga(db))
  const stevilo = db.tabele.kpo_entries.length
  await knjiziPosDneve(db, ORG, BIZ, ['2026-10-01'])     // "Z-porocilo, samo obracun" za 1.10.
  await knjiziPosDneve(db, ORG, BIZ, dnevi)              // ponovni klik / ponovni poskus
  expect(db.tabele.kpo_entries.length).toBe(stevilo)
  expect(JSON.stringify(knjiga(db))).toBe(prej)
  expect(db.tabele.kpo_entries.every((e: any) => e.category === 'pos_prodaja' || e.category === 'pos_storitve')).toBe(true)
})

test('V5: dan, kjer je ves promet storniran, se postavi na 0 (ne ostane star znesek)', async () => {
  const { db } = pripravi()
  await knjiziPosDneve(db, ORG, BIZ, ['2026-10-02'])
  expect(knjiga(db)['2026-10-02|izdelek|22']).toEqual([5, 1.1])
  Object.assign(db.tabele.orders.find((o: any) => o.id === 'E'), { status: 'voided', voided_at: '2026-10-02T12:00:00Z' })
  await knjiziPosDneve(db, ORG, BIZ, ['2026-10-02'])
  expect(knjiga(db)['2026-10-02|izdelek|22']).toEqual([0, 0])
})

test('Zdruzljivost: dogodkov, ki jih je ze knjizil STAR zakljucek izmene, ne knjizimo znova', async () => {
  // Star vnos (brez pos_kljuc), ustvarjen ob zakljucku 30.9. ob 12:00 UTC: vsebuje A in B.
  const { db } = pripravi([{ id: 'stari', org_id: ORG, category: 'pos_prodaja', pos_kljuc: null, entry_date: '2026-09-30', income: 20, vat_out: 3.15, created_at: '2026-09-30T12:00:00Z' }])
  await knjiziPosDneve(db, ORG, BIZ, dneviMed(IZMENA.od, IZMENA.do))
  const k = knjiga(db)
  expect(k['2026-09-29|izdelek|22']).toBeUndefined()            // A ze knjizen staro
  expect(k['2026-09-29|izdelek|9.5']).toBeUndefined()           // B ze knjizen staro
  expect(k['2026-10-01|izdelek|9.5']).toEqual([-5, -0.48])      // storno B (1.10.) je NOV dogodek - se odsteje
})

test('K5 + V4 → izracunajDdv: DDV iz racunov = DDV iz dnevnih KPO vnosov, po pravih cetrtletjih', async () => {
  const { db, n } = pripravi()
  await knjiziPosDneve(db, ORG, BIZ, dneviMed(IZMENA.od, IZMENA.do))
  const e = db.tabele.orders.find((o: any) => o.id === 'E')
  Object.assign(e, { status: 'voided', voided_at: '2026-10-03T09:00:00Z' })
  await knjiziPosDneve(db, ORG, BIZ, ['2026-10-03'])

  const podatki: DdvPodatki = {
    racuni: [], prejeti: [], kpo: db.tabele.kpo_entries as DdvPodatki['kpo'], imaBlagajno: true,
    narocila: db.tabele.orders as PosNarocilo[],
    vracila: db.tabele.refunds as PosVracilo[],
  }
  const q3 = izracunajDdvIzPodatkov(podatki, { leto: 2026, cetrtletje: 3 })
  const q4 = izracunajDdvIzPodatkov(podatki, { leto: 2026, cetrtletje: 4 })
  expect(q3.obveznost).toBe(3.15)
  expect(q4.obveznost).toBe(5.02)
  // ista stevilka kot vsota dnevnih KPO vnosov blagajne
  expect(q3.obveznost).toBe(vsotaDdv(db, '2026-07-01', '2026-09-30'))
  expect(q4.obveznost).toBe(vsotaDdv(db, '2026-10-01', '2026-12-31'))
  // KPO povzetki blagajne se v DDV NE stejejo dvakrat (izracunajDdv bere racune)
  expect(q4.izstopniDdv.kpo['22'].ddv).toBe(0)
  void n
})

test('V4: vracilo mesanega racuna se razdeli po stopnjah izvirnika', () => {
  const n = narocila()
  const k = izracunajPosKnjizbe([], [{ refunded_at: '2026-10-01T10:00:00Z', amount: 11.58, orders: n.D }], new Set(['2026-10-01']))
  expect(k.map(x => [x.stopnja, x.neto, x.ddv])).toEqual([[22, -500, -110], [9.5, -500, -48]])
  expect(k.reduce((s, x) => s + x.neto + x.ddv, 0)).toBe(-1158)
})

test('Kljuc KPO vnosa je enolicen po podjetju, dnevu, vrsti in stopnji', () => {
  expect(posKljuc('b1', { dan: '2026-10-01', vrsta: 'storitev', stopnja: 9.5 })).toBe('pos:b1:2026-10-01:storitev:9.5')
})

test('V5: vse poti v KPO uporabljajo lib/pos-kpo (zakljucek, Z-porocilo, storno, vracilo)', () => {
  const vir = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
  const sync = vir('app/api/pos/sync-income/route.ts')
  expect(sync).toMatch(/knjiziPosDneve/)
  expect(sync).not.toMatch(/from\('kpo_entries'\)/)        // nobenega lastnega zapisa
  expect(sync).not.toMatch(/'POS promet'/)
  expect(vir('lib/pos-client.ts')).toMatch(/knjiziPosDneve\(sb\(\)/)
  const pos = vir('app/pos/page.tsx')
  expect(pos.match(/knjiziPosDneve\(/g)?.length).toBeGreaterThanOrEqual(2) // storno + vracilo
  expect(vir('lib/pos-client.ts')).not.toMatch(/from\('kpo_entries'\)\.insert/)
})
