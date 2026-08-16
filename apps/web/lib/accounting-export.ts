/**
 * RAČUNKO — Računovodski izvoz
 * 
 * Generira XLSX in CSV datoteke za pošiljanje računovodji.
 * Struktura je usklajena z slovenskimi računovodskimi praksami in
 * standardnimi formati ki jih sprejemajo Pantheon, Vasco, Minimax, e-racuni.
 * 
 * 3 glavne strukture:
 * 1. Knjiga izdanih računov (KIR)
 * 2. Knjiga prejetih računov (KPR)
 * 3. Mesečna rekapitulacija
 */

import * as XLSX from 'xlsx'

export interface IssuedInvoiceRow {
  invoice_number: string
  issue_date: string
  client_name: string
  client_tax_number: string | null
  client_address: string | null
  service_date_from: string | null
  service_date_to: string | null
  due_date: string | null
  amount_net: number
  vat_amount: number
  amount_total: number
  status: string
  paid_at: string | null
  zoi: string | null
  eor: string | null
  notes: string | null
  line_items: any[]
}

export interface ReceiptRow {
  receipt_number: string | null
  receipt_date: string | null
  vendor: string | null
  vendor_tax_num: string | null
  amount_net: number | null
  vat_rate: number | null
  vat_amount: number | null
  amount_total: number | null
  category: string | null
  description: string | null
  is_deductible: boolean
  status: string
  has_image: boolean
}

export interface KPOEntryRow {
  entry_date: string | null
  description: string | null
  entry_type: string | null
  income: number | null
  expense: number | null
  vat_in: number | null
  vat_out: number | null
  /** DODANO 16.8.2026: stopnja DDV - brez nje racunovodja ne ve, v katero
   *  vrstico obrazca DDV-O spada promet iz blagajne, banke ali kartic. */
  vat_rate?: number | null
  category: string | null
  notes: string | null
  invoice_id: string | null
  receipt_id: string | null // DODANO 30.7.2026: manjkal je za prepoznavo ze stetih STROSKOV
}

export interface ExportInput {
  orgName: string
  orgTaxNumber: string | null
  orgAddress: string | null
  periodLabel: string  // "Maj 2026"
  periodFrom: string   // "2026-05-01"
  periodTo: string     // "2026-05-31"
  issuedInvoices: IssuedInvoiceRow[]
  receipts: ReceiptRow[]
  // DODANO (29.7.2026, audit K6): vsi KPO vnosi za obdobje - POS promet,
  // bancni uvoz, kartice, place, amortizacija itd. (13 razlicnih virov,
  // ki jih izdani/prejeti racuni sami po sebi ne pokrijejo).
  kpoEntries: KPOEntryRow[]
}

// ===== POMOŽNE FUNKCIJE =====

function splitByVatRate(amount_net: number, vat_amount: number, vat_rate: number | null) {
  const rate = vat_rate ?? 22
  if (rate >= 21 && rate <= 23) {
    return { net22: amount_net, vat22: vat_amount, net95: 0, vat95: 0, net0: 0 }
  }
  if (rate >= 9 && rate <= 10) {
    return { net22: 0, vat22: 0, net95: amount_net, vat95: vat_amount, net0: 0 }
  }
  return { net22: 0, vat22: 0, net95: 0, vat95: 0, net0: amount_net }
}

function formatDate(d: string | null): string {
  if (!d) return ''
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  return date.toLocaleDateString('sl-SI')
}

function formatAmount(n: number | null | undefined): number {
  if (n == null) return 0
  return Math.round(n * 100) / 100
}

function statusLabel(s: string): string {
  switch (s) {
    case 'sent': return 'Poslano'
    case 'paid': return 'Plačano'
    case 'overdue': return 'V zamudi'
    case 'cancelled': return 'Stornirano'
    case 'draft': return 'Osnutek'
    case 'pending': return 'V obdelavi'
    case 'confirmed': return 'Potrjen'
    case 'rejected': return 'Zavrnjen'
    default: return s
  }
}

// ===== GLAVNA FUNKCIJA — XLSX =====

export function generateAccountingXLSX(input: ExportInput): Buffer {
  const wb = XLSX.utils.book_new()

  // ===== SHEET 1: IZDANI RAČUNI (KIR) =====
  const kirHeaders = [
    'Št. računa',
    'Datum izdaje',
    'Stranka (naziv)',
    'Davčna št.',
    'Naslov',
    'Storitev od',
    'Storitev do',
    'Datum zapadlosti',
    'Osnova 22%',
    'DDV 22%',
    'Osnova 9,5%',
    'DDV 9,5%',
    'Osnova 0%',
    'Skupaj brez DDV',
    'DDV skupaj',
    'Skupaj z DDV',
    'Status',
    'Plačano dne',
    'ZOI',
    'EOR',
    'Opombe',
  ]

  const kirRows = input.issuedInvoices.map(inv => {
    const split = splitByVatRate(inv.amount_net, inv.vat_amount, null)
    return [
      inv.invoice_number,
      formatDate(inv.issue_date),
      inv.client_name,
      inv.client_tax_number ?? '',
      inv.client_address ?? '',
      formatDate(inv.service_date_from),
      formatDate(inv.service_date_to),
      formatDate(inv.due_date),
      formatAmount(split.net22),
      formatAmount(split.vat22),
      formatAmount(split.net95),
      formatAmount(split.vat95),
      formatAmount(split.net0),
      formatAmount(inv.amount_net),
      formatAmount(inv.vat_amount),
      formatAmount(inv.amount_total),
      statusLabel(inv.status),
      formatDate(inv.paid_at),
      inv.zoi ?? '',
      inv.eor ?? '',
      inv.notes ?? '',
    ]
  })

  // Sum row
  const totalNet = input.issuedInvoices.reduce((s, i) => s + Number(i.amount_net), 0)
  const totalVat = input.issuedInvoices.reduce((s, i) => s + Number(i.vat_amount), 0)
  const totalGross = input.issuedInvoices.reduce((s, i) => s + Number(i.amount_total), 0)
  const sumRowKir = [
    'SKUPAJ', '', '', '', '', '', '', '',
    '', '', '', '', '',
    formatAmount(totalNet),
    formatAmount(totalVat),
    formatAmount(totalGross),
    '', '', '', '', '',
  ]

  const wsKir = XLSX.utils.aoa_to_sheet([
    [`KNJIGA IZDANIH RAČUNOV — ${input.periodLabel}`],
    [`${input.orgName} · DŠ: ${input.orgTaxNumber ?? '—'}`],
    [],
    kirHeaders,
    ...kirRows,
    [],
    sumRowKir,
  ])
  
  // Column widths
  wsKir['!cols'] = [
    { wch: 14 }, { wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 35 },
    { wch: 12 }, { wch: 12 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 14 }, { wch: 12 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 30 },
  ]
  
  XLSX.utils.book_append_sheet(wb, wsKir, 'Izdani računi (KIR)')

  // ===== SHEET 2: PREJETI RAČUNI (KPR) =====
  const kprHeaders = [
    'Št. dokumenta',
    'Datum prejema',
    'Dobavitelj',
    'Davčna št.',
    'Osnova 22%',
    'DDV 22% (vstop)',
    'Osnova 9,5%',
    'DDV 9,5% (vstop)',
    'Osnova 0%',
    'Skupaj brez DDV',
    'DDV vstop. skupaj',
    'Skupaj z DDV',
    'Kategorija',
    'Opis',
    'Davčno priznano',
    'Status',
    'Skenirano',
  ]

  const kprRows = input.receipts.map(r => {
    const split = splitByVatRate(r.amount_net ?? 0, r.vat_amount ?? 0, r.vat_rate)
    return [
      r.receipt_number ?? '—',
      formatDate(r.receipt_date),
      r.vendor ?? '—',
      r.vendor_tax_num ?? '',
      formatAmount(split.net22),
      formatAmount(split.vat22),
      formatAmount(split.net95),
      formatAmount(split.vat95),
      formatAmount(split.net0),
      formatAmount(r.amount_net),
      formatAmount(r.vat_amount),
      formatAmount(r.amount_total),
      r.category ?? '',
      r.description ?? '',
      r.is_deductible ? 'Da' : 'Ne',
      statusLabel(r.status),
      r.has_image ? 'Da' : 'Ne',
    ]
  })

  const totalKprNet = input.receipts.reduce((s, r) => s + Number(r.amount_net ?? 0), 0)
  const totalKprVat = input.receipts.reduce((s, r) => s + Number(r.vat_amount ?? 0), 0)
  const totalKprGross = input.receipts.reduce((s, r) => s + Number(r.amount_total ?? 0), 0)
  const sumRowKpr = [
    'SKUPAJ', '', '', '', '', '', '', '', '',
    formatAmount(totalKprNet),
    formatAmount(totalKprVat),
    formatAmount(totalKprGross),
    '', '', '', '', '',
  ]

  const wsKpr = XLSX.utils.aoa_to_sheet([
    [`KNJIGA PREJETIH RAČUNOV — ${input.periodLabel}`],
    [`${input.orgName} · DŠ: ${input.orgTaxNumber ?? '—'}`],
    [],
    kprHeaders,
    ...kprRows,
    [],
    sumRowKpr,
  ])
  
  wsKpr['!cols'] = [
    { wch: 14 }, { wch: 12 }, { wch: 30 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 20 }, { wch: 35 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
  ]
  
  XLSX.utils.book_append_sheet(wb, wsKpr, 'Prejeti računi (KPR)')

  // ===== SHEET 3: REKAPITULACIJA =====
  const vatOut22 = input.issuedInvoices.reduce((s, i) => s + Number(i.vat_amount), 0)
  const vatIn22 = input.receipts.reduce((s, r) => s + Number(r.vat_amount ?? 0), 0)
  const vatBalance = vatOut22 - vatIn22

  const sumRows = [
    [`MESEČNA REKAPITULACIJA — ${input.periodLabel}`],
    [`${input.orgName} · DŠ: ${input.orgTaxNumber ?? '—'}`],
    [`Obdobje: ${formatDate(input.periodFrom)} — ${formatDate(input.periodTo)}`],
    [],
    ['PRIHODKI', '', ''],
    ['Št. izdanih računov', input.issuedInvoices.length, ''],
    ['Skupaj prihodki (brez DDV)', formatAmount(totalNet), 'EUR'],
    ['DDV izhodni (skupaj)', formatAmount(totalVat), 'EUR'],
    ['Skupaj prihodki z DDV', formatAmount(totalGross), 'EUR'],
    [],
    ['ODHODKI / STROŠKI', '', ''],
    ['Št. prejetih računov', input.receipts.length, ''],
    ['Skupaj stroški (brez DDV)', formatAmount(totalKprNet), 'EUR'],
    ['DDV vstopni (skupaj)', formatAmount(totalKprVat), 'EUR'],
    ['Skupaj stroški z DDV', formatAmount(totalKprGross), 'EUR'],
    [],
    ['DDV BILANCA', '', ''],
    ['DDV izhodni', formatAmount(vatOut22), 'EUR'],
    ['DDV vstopni', formatAmount(vatIn22), 'EUR'],
    ['DDV za plačilo (oz. vračilo če negativen)', formatAmount(vatBalance), 'EUR'],
    [],
    ['POSLOVNI REZULTAT', '', ''],
    ['Razlika (prihodki - odhodki, brez DDV)', formatAmount(
      totalNet - totalKprNet
      + input.kpoEntries.filter(e => !e.invoice_id && !e.receipt_id).reduce((s, e) => s + Number(e.income ?? 0) - Number(e.expense ?? 0), 0)
    ), 'EUR'], // POPRAVLJENO 30.7.2026: vkljucuje KPO promet "za knjizenje"
    [],
    ['OPOMBA', '', ''],
    ['Ta izvoz je informativen. Podatki morajo biti pregledani in', '', ''],
    ['potrjeni s strani certificiranega računovodje. Računko ne', '', ''],
    ['nadomešča profesionalne računovodske storitve.', '', ''],
  ]

  const wsSum = XLSX.utils.aoa_to_sheet(sumRows)
  wsSum['!cols'] = [{ wch: 50 }, { wch: 18 }, { wch: 8 }]
  
  XLSX.utils.book_append_sheet(wb, wsSum, 'Rekapitulacija')

  // ===== SHEET 4: KPO EVIDENCA (dodano 29.7.2026, RAZDELJENO 30.7.2026) =====
  // POPRAVLJENO: prej EN mesan seznam, kjer je moral racunovodja SAM
  // prepoznati in izlociti vnose z "Da" v stolpcu "Povezan racun?" - zdaj
  // je seznam RAZDELJEN na dva jasna dela, brez rocnega filtriranja.
  const kpoHeaders = [
    'Datum', 'Opis', 'Tip', 'Prihodek', 'Odhodek',
    'DDV vhod', 'DDV izhod', 'Stopnja DDV', 'Kategorija', 'Opombe',
  ]

  const kpoBookable = input.kpoEntries.filter(e => !e.invoice_id && !e.receipt_id)
  const kpoAlreadyCounted = input.kpoEntries.filter(e => e.invoice_id || e.receipt_id)

  const toKpoRow = (e: KPOEntryRow) => [
    formatDate(e.entry_date),
    e.description ?? '',
    e.entry_type === 'income' ? 'Prihodek' : 'Odhodek',
    formatAmount(e.income),
    formatAmount(e.expense),
    formatAmount(e.vat_in),
    formatAmount(e.vat_out),
    e.vat_rate != null ? `${e.vat_rate}%` : (Number(e.vat_out ?? 0) > 0 ? '22%' : ''),
    e.category ?? '',
    e.notes ?? '',
  ]

  const totalBookableIncome = kpoBookable.reduce((s, e) => s + Number(e.income ?? 0), 0)
  const totalBookableExpense = kpoBookable.reduce((s, e) => s + Number(e.expense ?? 0), 0)
  const sumRowBookable = [
    'SKUPAJ ZA KNJIŽENJE', '', '',
    formatAmount(totalBookableIncome), formatAmount(totalBookableExpense),
    '', '', '', '', '',
  ]

  const kpoSheetData: any[][] = [
    [`KPO EVIDENCA — ${input.periodLabel}`],
    [`${input.orgName} · DŠ: ${input.orgTaxNumber ?? '—'}`],
    [],
    ['DEL 1: ZA KNJIŽENJE — promet brez izdanega računa/prejetega stroška (banka, POS, kartice, plače, amortizacija...)'],
    [],
    kpoHeaders,
    ...kpoBookable.map(toKpoRow),
    [],
    sumRowBookable,
  ]

  if (kpoAlreadyCounted.length > 0) {
    kpoSheetData.push(
      [], [],
      ['DEL 2: SAMO REFERENCA — NE KNJIŽITE PONOVNO'],
      ['Spodnji vnosi so plačila že prikazanih računov/stroškov v listih "Izdani računi (KIR)" / "Prejeti računi (KPR)" zgoraj - prikazani le za sled plačila, NE za dodatno knjiženje.'],
      [],
      kpoHeaders,
      ...kpoAlreadyCounted.map(toKpoRow),
    )
  }

  const wsKpo = XLSX.utils.aoa_to_sheet(kpoSheetData)
  wsKpo['!cols'] = [
    { wch: 12 }, { wch: 35 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 20 }, { wch: 30 },
  ]

  XLSX.utils.book_append_sheet(wb, wsKpo, 'KPO evidenca')

  // Generate buffer
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return buf as Buffer
}

// ===== CSV (semicolon separated, Vasco/Pantheon compatible) =====

export function generateAccountingCSV_KIR(input: ExportInput): string {
  const header = [
    'Stevilka_racuna', 'Datum_izdaje', 'Stranka', 'Davcna_st', 'Naslov',
    'Storitev_od', 'Storitev_do', 'Zapadlost',
    'Osnova_22', 'DDV_22', 'Osnova_95', 'DDV_95', 'Osnova_0',
    'Skupaj_neto', 'DDV_skupaj', 'Skupaj_bruto',
    'Status', 'Placano_dne', 'ZOI', 'EOR', 'Opombe',
  ].join(';')

  const rows = input.issuedInvoices.map(inv => {
    const split = splitByVatRate(inv.amount_net, inv.vat_amount, null)
    return [
      inv.invoice_number,
      formatDate(inv.issue_date),
      `"${(inv.client_name ?? '').replace(/"/g, '""')}"`,
      inv.client_tax_number ?? '',
      `"${(inv.client_address ?? '').replace(/"/g, '""')}"`,
      formatDate(inv.service_date_from),
      formatDate(inv.service_date_to),
      formatDate(inv.due_date),
      formatAmount(split.net22).toString().replace('.', ','),
      formatAmount(split.vat22).toString().replace('.', ','),
      formatAmount(split.net95).toString().replace('.', ','),
      formatAmount(split.vat95).toString().replace('.', ','),
      formatAmount(split.net0).toString().replace('.', ','),
      formatAmount(inv.amount_net).toString().replace('.', ','),
      formatAmount(inv.vat_amount).toString().replace('.', ','),
      formatAmount(inv.amount_total).toString().replace('.', ','),
      statusLabel(inv.status),
      formatDate(inv.paid_at),
      inv.zoi ?? '',
      inv.eor ?? '',
      `"${(inv.notes ?? '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
    ].join(';')
  })

  return [header, ...rows].join('\r\n')
}

export function generateAccountingCSV_KPR(input: ExportInput): string {
  const header = [
    'Stevilka_dokumenta', 'Datum_prejema', 'Dobavitelj', 'Davcna_st',
    'Osnova_22', 'DDV_22_vstop', 'Osnova_95', 'DDV_95_vstop', 'Osnova_0',
    'Skupaj_neto', 'DDV_vstop_skupaj', 'Skupaj_bruto',
    'Kategorija', 'Opis', 'Davcno_priznano', 'Status', 'Skenirano',
  ].join(';')

  const rows = input.receipts.map(r => {
    const split = splitByVatRate(r.amount_net ?? 0, r.vat_amount ?? 0, r.vat_rate)
    return [
      r.receipt_number ?? '',
      formatDate(r.receipt_date),
      `"${(r.vendor ?? '').replace(/"/g, '""')}"`,
      r.vendor_tax_num ?? '',
      formatAmount(split.net22).toString().replace('.', ','),
      formatAmount(split.vat22).toString().replace('.', ','),
      formatAmount(split.net95).toString().replace('.', ','),
      formatAmount(split.vat95).toString().replace('.', ','),
      formatAmount(split.net0).toString().replace('.', ','),
      formatAmount(r.amount_net).toString().replace('.', ','),
      formatAmount(r.vat_amount).toString().replace('.', ','),
      formatAmount(r.amount_total).toString().replace('.', ','),
      r.category ?? '',
      `"${(r.description ?? '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
      r.is_deductible ? 'Da' : 'Ne',
      statusLabel(r.status),
      r.has_image ? 'Da' : 'Ne',
    ].join(';')
  })

  return [header, ...rows].join('\r\n')
}