import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { generateAccountingXLSX, generateAccountingCSV_KIR, generateAccountingCSV_KPR, type ExportInput, type IssuedInvoiceRow, type ReceiptRow } from '../lib/accounting-export'
import { izracunajDdvIzPodatkov, type DdvPodatki } from '../lib/ddv'

/**
 * REVIZIJA V7 (oktober 2026): izvoz za racunovodjo (KIR/KPR) po dejanskih
 * stopnjah - vsota stolpcev mora biti enaka izracunajDdv.
 *
 * Prej: izdani racuni VSI v stolpcu 22 % (splitByVatRate(…, null)), 5 % v
 * stolpcu 0 %, prejeti z 0 % v stolpcu 22 % (vat_rate 0 → null).
 *
 * Podatki: test s.p., Q3 2026 (fiksture/ddv-test-sp.json, dejanski izvoz iz
 * baze) + dodani primeri, ki jih organizacija nima: racun z 22 % in 9,5 %,
 * racun s 5 %, prejeti racun z 0 %, mesanimi stopnjami in pavsalnim
 * nadomestilom.
 */
const f = JSON.parse(readFileSync(join(__dirname, 'fiksture/ddv-test-sp.json'), 'utf8'))
const postavka = (unit_price: number, vat_rate: number, quantity = 1) => ({ quantity, unit_price, vat_rate, discount_pct: 0 })

const racuni: DdvPodatki['racuni'] = [
  ...f.racuni,
  { issue_date: '2026-09-15', amount_net: 150, vat_amount: 20.5, line_items: [postavka(50, 22), postavka(100, 9.5)] },
  { issue_date: '2026-09-16', amount_net: 40, vat_amount: 2, line_items: [postavka(20, 5, 2)] },
]
const prejeti: DdvPodatki['prejeti'] = [
  ...f.prejeti,
  { receipt_date: '2026-09-02', amount_net: 30, vat_amount: 0, vat_rate: 0 },
  { receipt_date: '2026-09-29', amount_net: 334.2, vat_amount: 67.58, vat_rate: 22,
    vat_breakdown: [{ stopnja: 22, osnova: 286.65, ddv: 63.06 }, { stopnja: 9.5, osnova: 47.55, ddv: 4.52 }] },
  { receipt_date: '2026-09-08', amount_net: 172.22, vat_amount: 13.78, vat_rate: 0,
    vat_breakdown: [{ stopnja: 8, osnova: 172.22, ddv: 13.78, vrsta: 'pavsalno_nadomestilo' }] },
]
const podatki: DdvPodatki = { ...f, racuni, prejeti }
const ddv = izracunajDdvIzPodatkov(podatki, { leto: 2026, cetrtletje: 3 })
const vObdobju = (d: string) => d >= ddv.od && d <= ddv.do

const input: ExportInput = {
  orgName: 'test s.p.', orgTaxNumber: null, orgAddress: null,
  periodLabel: 'Q3 2026', periodFrom: ddv.od, periodTo: ddv.do,
  issuedInvoices: racuni.filter(r => vObdobju(r.issue_date)).map((r, i): IssuedInvoiceRow => ({
    invoice_number: `R-${i}`, issue_date: r.issue_date, client_name: 'Stranka', client_tax_number: null, client_address: null,
    service_date_from: null, service_date_to: null, due_date: null,
    amount_net: Number(r.amount_net), vat_amount: Number(r.vat_amount), amount_total: Number(r.amount_net) + Number(r.vat_amount),
    status: 'sent', paid_at: null, zoi: null, eor: null, notes: null, line_items: r.line_items,
  })),
  receipts: prejeti.filter(r => vObdobju(r.receipt_date)).map((r): ReceiptRow => ({
    receipt_number: null, receipt_date: r.receipt_date, vendor: 'Dobavitelj', vendor_tax_num: null,
    amount_net: Number(r.amount_net), vat_rate: r.vat_rate == null ? null : Number(r.vat_rate), vat_amount: Number(r.vat_amount),
    amount_total: Number(r.amount_net) + Number(r.vat_amount), vat_breakdown: r.vat_breakdown,
    category: 'Drugo', description: null, is_deductible: true, status: 'confirmed', has_image: false,
  })),
  kpoEntries: [], zReports: [], ddv,
}

/** List XLSX → { glava → vrednost v vrstici SKUPAJ } */
function skupajIzLista(wb: XLSX.WorkBook, ime: string): Record<string, number> {
  const vrstice = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[ime], { header: 1 })
  const glava = vrstice[3] as string[]
  const skupaj = vrstice.find(v => v?.[0] === 'SKUPAJ') as any[]
  return Object.fromEntries(glava.map((g, i) => [g, Number(skupaj[i] || 0)]))
}

/** CSV → vsota stolpca */
function vsotaCsv(csv: string, stolpec: string): number {
  const [glava, ...vrstice] = csv.split('\r\n').map(v => v.split(';'))
  const i = glava.indexOf(stolpec)
  expect(i, stolpec).toBeGreaterThanOrEqual(0)
  return Math.round(vrstice.reduce((s, v) => s + Number(v[i].replace(',', '.')), 0) * 100) / 100
}

test.describe('V7: izvoz za racunovodjo po stopnjah', () => {
  const wb = XLSX.read(generateAccountingXLSX(input), { type: 'buffer' })

  test('KIR (XLSX): vsota stolpcev po stopnjah = izracunajDdv, izdani racuni', () => {
    const s = skupajIzLista(wb, 'Izdani računi (KIR)')
    const i = ddv.izstopniDdv.izdaniRacuni
    expect(s['Osnova 22%']).toBeCloseTo(i['22'].osnova, 2)
    expect(s['DDV 22%']).toBeCloseTo(i['22'].ddv, 2)
    expect(s['Osnova 9,5%']).toBeCloseTo(i['9.5'].osnova, 2)
    expect(s['DDV 9,5%']).toBeCloseTo(i['9.5'].ddv, 2)
    expect(s['Osnova 5%']).toBeCloseTo(i['5'].osnova, 2)
    expect(s['DDV 5%']).toBeCloseTo(i['5'].ddv, 2)
    expect(s['Osnova 0%']).toBeCloseTo(i['0'].osnova, 2)
    expect(s['DDV druge st.']).toBeCloseTo(i.drugo.ddv, 2)
    // dodana racuna sta res razdeljena (prej: vse v 22 %)
    const prej = izracunajDdvIzPodatkov(f, { leto: 2026, cetrtletje: 3 }).izstopniDdv.izdaniRacuni
    const r2 = (n: number) => Math.round(n * 100) / 100
    expect({ osnova: r2(i['9.5'].osnova - prej['9.5'].osnova), ddv: r2(i['9.5'].ddv - prej['9.5'].ddv) }).toEqual({ osnova: 100, ddv: 9.5 })
    expect({ osnova: r2(i['22'].osnova - prej['22'].osnova), ddv: r2(i['22'].ddv - prej['22'].ddv) }).toEqual({ osnova: 50, ddv: 11 })
    expect(i['5']).toEqual({ osnova: 40, ddv: 2 })
    const ddvKir = s['DDV 22%'] + s['DDV 9,5%'] + s['DDV 5%'] + s['DDV druge st.']
    expect(ddvKir).toBeCloseTo(i['22'].ddv + i['9.5'].ddv + i['5'].ddv + i.drugo.ddv, 2)
  })

  test('KPR (XLSX): vsota stolpcev = izracunajDdv, prejeti racuni (s pavsalnim nadomestilom)', () => {
    const s = skupajIzLista(wb, 'Prejeti računi (KPR)')
    const p = ddv.vstopniDdv.prejetiRacuni
    expect(s['Osnova 22%']).toBeCloseTo(p['22'].osnova, 2)
    expect(s['DDV 22% (vstop)']).toBeCloseTo(p['22'].ddv, 2)
    expect(s['Osnova 9,5%']).toBeCloseTo(p['9.5'].osnova, 2)
    expect(s['DDV 9,5% (vstop)']).toBeCloseTo(p['9.5'].ddv, 2)
    expect(s['DDV 5% (vstop)']).toBeCloseTo(p['5'].ddv, 2)
    expect(s['Osnova 0%']).toBeCloseTo(p['0'].osnova, 2)
    expect(s['Pavšalno nadomestilo 8%']).toBeCloseTo(ddv.vstopniDdv.pavsalnoNadomestilo.ddv, 2)
    expect(s['Pavšalno nadomestilo 8%'] + s['DDV druge st.']).toBeCloseTo(p.drugo.ddv, 2)
    expect(s['Osnova 0%']).toBe(30) // prej v stolpcu 22 %
    const vstop = s['DDV 22% (vstop)'] + s['DDV 9,5% (vstop)'] + s['DDV 5% (vstop)'] + s['Pavšalno nadomestilo 8%'] + s['DDV druge st.']
    expect(Math.round(vstop * 100) / 100).toBe(Math.round(Object.values(p).reduce((a, x) => a + x.ddv, 0) * 100) / 100)
  })

  test('CSV KIR/KPR: iste vsote kot XLSX', () => {
    const kir = generateAccountingCSV_KIR(input), kpr = generateAccountingCSV_KPR(input)
    expect(vsotaCsv(kir, 'DDV_22')).toBeCloseTo(ddv.izstopniDdv.izdaniRacuni['22'].ddv, 2)
    expect(vsotaCsv(kir, 'DDV_95')).toBeCloseTo(ddv.izstopniDdv.izdaniRacuni['9.5'].ddv, 2)
    expect(vsotaCsv(kir, 'DDV_5')).toBeCloseTo(ddv.izstopniDdv.izdaniRacuni['5'].ddv, 2)
    expect(vsotaCsv(kpr, 'DDV_22_vstop')).toBeCloseTo(ddv.vstopniDdv.prejetiRacuni['22'].ddv, 2)
    expect(vsotaCsv(kpr, 'DDV_95_vstop')).toBeCloseTo(ddv.vstopniDdv.prejetiRacuni['9.5'].ddv, 2)
    expect(vsotaCsv(kpr, 'Pavsalno_nadomestilo_8')).toBeCloseTo(13.78, 2)
  })

  test('rekapitulacija: DDV bilanca iz izracunajDdv (z blagajno in KPO)', () => {
    const vrstice = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[2]], { header: 1 })
    const vrednost = (oznaka: string) => Number(vrstice.find(v => v?.[0] === oznaka)?.[1])
    expect(vrednost('DDV izhodni')).toBeCloseTo(ddv.izstopniDdv.skupaj, 2)
    expect(vrednost('DDV vstopni')).toBeCloseTo(ddv.vstopniDdv.skupaj, 2)
    expect(vrednost('DDV za plačilo (oz. vračilo če negativen)')).toBeCloseTo(ddv.obveznost, 2)
  })

  test('test s.p. brez dodanih primerov: obveznost Q3 2026 ostaja 123,37', () => {
    expect(izracunajDdvIzPodatkov(f, { leto: 2026, cetrtletje: 3 }).obveznost).toBe(123.37)
  })
})
