/**
 * RAČUNKO — Napoved pretoka denarja (30 dni)
 *
 * PRELET 341 (29.9.2026) — prenovljeno. Prejsnja razlicica je imela vec
 * napak, zaradi katerih je bila napoved zavajajoca:
 *   1. Bilanca je zacela pri 0 EUR (stanje na racunu ni bilo znano), zato je
 *      ze prvi odtok povlekel "bilanco" v minus -> "29 dni negativne bilance".
 *   2. Dotok so bili SAMO odprti izdani racuni. Promet blagajne / kartic /
 *      banke (pri lokalu ali fitnesu skoraj ves priliv) ni bil zajet.
 *   3. DDV je bil postavljen na konec TEKOCEGA meseca, vsak mesec. Pravilno:
 *      rok je zadnji dan meseca po koncu davcnega obdobja (mesec/cetrtletje),
 *      znesek pa DDV TISTEGA obdobja.
 *   4. Prispevki / akontacija na 15. (pravilno 20.), place na 25. (pravilno
 *      najkasneje 18. - ZDR 134. clen, REK-1 na dan izplacila).
 *   5. Zapadli racuni so se steli kot danasnji priliv (optimisticno).
 *   6. Ponavljajocih stroskov (najemnina, narocnine) ni bilo.
 *
 * Funkcije so ciste - vse podatke pripravi klicatelj (Dashboard).
 */

import type { LegalForm, TaxSystem } from './tax-calculator'
import { lokalniDatum } from '@/lib/tax-constants'

export interface OpenInvoice {
  id: string
  due_date: string  // 'YYYY-MM-DD'
  amount_total: number
  client_name: string
  invoice_number: string
}

export interface RecurringExpense {
  label: string
  amount: number
  /** Tipicen dan v mesecu (1-31) */
  dayOfMonth: number
}

export interface Obligation {
  date: string   // 'YYYY-MM-DD'
  amount: number
  label: string
}

export type VatPeriod = 'monthly' | 'quarterly'

export interface CashFlowInput {
  /** Odprti izdani racuni (status 'sent') - zapadli se locijo avtomatsko */
  openInvoices: OpenInvoice[]
  /** Stanje na TRR (null = neznano -> prikaz neto pretoka) */
  startingBalance?: number | null
  startingBalanceDate?: string | null
  legalForm: LegalForm | null
  taxSystem: TaxSystem | null
  isVatRegistered: boolean
  /** Obveznosti za DDV z roki (glej vatPeriodsInWindow) */
  vatObligations?: Obligation[]
  hasEmployees: boolean
  /** Mesecni prispevki s.p. (iz nastavitev organizacije) */
  monthlyContributions: number
  /** Mesecna akontacija dohodnine */
  monthlyIncomeTax: number
  /** Bruto + prispevki delodajalca */
  monthlyPayrollCost?: number
  /** Povprecen dnevni promet brez racunov (blagajna, kartice, banka) po
      dnevu v tednu: indeks 0 = nedelja ... 6 = sobota */
  dailyIncomeByWeekday?: number[]
  /** Zaznani ponavljajoci stroski */
  recurringExpenses?: RecurringExpense[]
  now?: Date
  /** Stevilo dni napovedi (privzeto 30) */
  horizon?: number
}

export interface CashFlowDay {
  date: string
  day: number
  /** Skupni pricakovani dotok (racuni + ocena prometa) */
  inflow: number
  /** Od tega ocena prometa blagajne/kartic */
  inflowEstimate: number
  outflow: number
  /** Stanje ob koncu dneva (zacetno stanje + kumulativni pretok) */
  balance: number
  inflowReasons: string[]
  outflowReasons: string[]
}

export interface CashFlowSummary {
  totalInflow: number
  /** Od tega iz izdanih racunov */
  invoiceInflow: number
  /** Od tega ocena prometa blagajne/kartic/banke */
  estimatedInflow: number
  totalOutflow: number
  /** Stanje po zadnjem dnevu (ali neto pretok, ce stanje ni znano) */
  endBalance: number
  hasStartingBalance: boolean
  startingBalance: number
  /** Najnizje stanje in dan */
  minBalance: number
  minBalanceDate: string
  /** Dnevi s stanjem pod 0 (samo ce je stanje znano) */
  daysNegative: number
  /** Prvi dan pod 0 */
  firstNegativeDate: string | null
  openInvoiceCount: number
  overdueCount: number
  overdueAmount: number
  message: string
}

export interface CashFlowResult {
  days: CashFlowDay[]
  summary: CashFlowSummary
  /** Vsi napovedani odtoki (razclenitev) */
  deadlines: Obligation[]
}

// ===== POMOZNE =====

function parseDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** Dan v mesecu, omejen na dolzino meseca (31. -> 30. ali 28./29.) */
function dateInMonth(year: number, month: number, day: number): Date {
  const last = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, last))
}

export function formatEur(n: number, withSign = false): string {
  const r = Math.round(n)
  const abs = Math.abs(r).toLocaleString('sl-SI')
  if (r < 0) return `−€${abs}`
  return `${withSign && r > 0 ? '+' : ''}€${abs}`
}

/**
 * Davcna obdobja za DDV, katerih rok placila pade v okno napovedi.
 * Rok placila DDV: zadnji dan meseca, ki sledi koncu davcnega obdobja.
 * Klicatelj za vsako obdobje izracuna znesek (izhodni - vstopni DDV).
 */
export function vatPeriodsInWindow(
  now: Date,
  period: VatPeriod,
  horizon = 30,
): Array<{ start: string; end: string; deadline: string; label: string; ended: boolean }> {
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const windowEnd = addDays(today, horizon - 1)
  const out: Array<{ start: string; end: string; deadline: string; label: string; ended: boolean }> = []
  const len = period === 'monthly' ? 1 : 3
  // Zacnemo pri obdobju, ki se je zacelo do 6 mesecev nazaj
  let y = today.getFullYear()
  let m = today.getMonth() - 6
  m = Math.floor(m / len) * len
  while (m < 0) { m += 12; y -= 1 }
  for (let i = 0; i < 12; i++) {
    const start = new Date(y, m, 1)
    const end = new Date(y, m + len, 0)
    const deadline = new Date(y, m + len + 1, 0)
    if (deadline >= today && deadline <= windowEnd) {
      const label = period === 'monthly'
        ? `DDV za ${start.toLocaleDateString('sl-SI', { month: 'long', year: 'numeric' })}`
        : `DDV za ${Math.floor(m / 3) + 1}. četrtletje ${y}`
      out.push({
        start: lokalniDatum(start),
        end: lokalniDatum(end),
        deadline: lokalniDatum(deadline),
        label,
        ended: end < today,
      })
    }
    m += len
    if (m >= 12) { m -= 12; y += 1 }
  }
  return out
}

/** Roki, ki se ponavljajo vsak mesec na isti dan, v oknu [today, windowEnd] */
function monthlyDates(today: Date, windowEnd: Date, day: number): Date[] {
  const out: Date[] = []
  for (let off = 0; off <= 2; off++) {
    const d = dateInMonth(today.getFullYear(), today.getMonth() + off, day)
    if (d >= today && d <= windowEnd) out.push(d)
  }
  return out
}

function getObligations(today: Date, windowEnd: Date, input: CashFlowInput): Obligation[] {
  const out: Obligation[] = []

  if (input.legalForm === 'sp') {
    // Prispevki s.p. in akontacija dohodnine: do 20. v mesecu za pretekli mesec
    for (const d of monthlyDates(today, windowEnd, 20)) {
      if (input.monthlyContributions > 0) {
        out.push({ date: lokalniDatum(d), amount: input.monthlyContributions, label: 'Prispevki s.p.' })
      }
      if (input.monthlyIncomeTax > 0) {
        out.push({ date: lokalniDatum(d), amount: input.monthlyIncomeTax, label: 'Akontacija dohodnine' })
      }
    }
  }

  if (input.hasEmployees && (input.monthlyPayrollCost ?? 0) > 0) {
    // Place najkasneje 18. v mesecu za pretekli mesec (ZDR 134. clen);
    // REK-1 in prispevki na dan izplacila.
    for (const d of monthlyDates(today, windowEnd, 18)) {
      out.push({ date: lokalniDatum(d), amount: input.monthlyPayrollCost!, label: 'Plače + REK-1 (bruto + prispevki delodajalca)' })
    }
  }

  if (input.isVatRegistered) {
    for (const v of input.vatObligations || []) {
      if (v.amount > 0) out.push(v)
    }
  }

  for (const r of input.recurringExpenses || []) {
    if (r.amount <= 0) continue
    for (const d of monthlyDates(today, windowEnd, r.dayOfMonth)) {
      out.push({ date: lokalniDatum(d), amount: r.amount, label: r.label })
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// ===== GLAVNA FUNKCIJA =====

export function generateCashFlow(input: CashFlowInput): CashFlowResult {
  const horizon = input.horizon ?? 30
  const today = new Date(input.now ?? new Date())
  today.setHours(0, 0, 0, 0)
  const windowEnd = addDays(today, horizon - 1)

  const days: CashFlowDay[] = []
  for (let i = 0; i < horizon; i++) {
    const d = addDays(today, i)
    days.push({
      date: lokalniDatum(d), day: d.getDate(),
      inflow: 0, inflowEstimate: 0, outflow: 0, balance: 0,
      inflowReasons: [], outflowReasons: [],
    })
  }

  // DOTOK: odprti racuni na dan zapadlosti. Zapadli se NE stejejo - datum
  // placila je neznan; prikazejo se locenno v povzetku.
  let invoiceInflow = 0
  let overdueCount = 0
  let overdueAmount = 0
  for (const inv of input.openInvoices) {
    if (!inv.due_date) continue
    const idx = daysBetween(today, parseDate(inv.due_date))
    const amt = Number(inv.amount_total) || 0
    if (idx < 0) { overdueCount++; overdueAmount += amt; continue }
    if (idx < horizon) {
      days[idx].inflow += amt
      days[idx].inflowReasons.push(`${inv.client_name} (#${inv.invoice_number})`)
      invoiceInflow += amt
    }
  }

  // DOTOK: ocena prometa blagajne/kartic/banke po dnevu v tednu
  let estimatedInflow = 0
  const byWd = input.dailyIncomeByWeekday
  if (byWd && byWd.length === 7) {
    for (let i = 0; i < horizon; i++) {
      const est = Number(byWd[addDays(today, i).getDay()]) || 0
      if (est > 0) {
        days[i].inflow += est
        days[i].inflowEstimate += est
        days[i].inflowReasons.push('Ocena prometa (blagajna, kartice)')
        estimatedInflow += est
      }
    }
  }

  // ODTOK
  const deadlines = getObligations(today, windowEnd, input)
  for (const dl of deadlines) {
    const idx = daysBetween(today, parseDate(dl.date))
    if (idx >= 0 && idx < horizon) {
      days[idx].outflow += dl.amount
      days[idx].outflowReasons.push(dl.label)
    }
  }

  // STANJE
  const hasStartingBalance = input.startingBalance !== null && input.startingBalance !== undefined && !isNaN(Number(input.startingBalance))
  const start = hasStartingBalance ? Number(input.startingBalance) : 0
  let running = start
  for (const d of days) {
    running += d.inflow - d.outflow
    d.balance = running
  }

  const totalInflow = invoiceInflow + estimatedInflow
  const totalOutflow = deadlines.reduce((s, d) => s + d.amount, 0)
  const endBalance = days.length ? days[days.length - 1].balance : start
  let minBalance = days.length ? days[0].balance : start
  let minBalanceDate = days.length ? days[0].date : lokalniDatum(today)
  for (const d of days) if (d.balance < minBalance) { minBalance = d.balance; minBalanceDate = d.date }
  const negDays = hasStartingBalance ? days.filter(d => d.balance < 0) : []
  const firstNegativeDate = negDays.length ? negDays[0].date : null

  const fmtDan = (s: string) => parseDate(s).toLocaleDateString('sl-SI', { day: 'numeric', month: 'long' })
  let message: string
  if (!hasStartingBalance) {
    const neto = totalInflow - totalOutflow
    message = neto >= 0
      ? `Neto pretok v ${horizon} dneh: ${formatEur(neto, true)}. Vnesite stanje na računu za oceno bilance.`
      : `V ${horizon} dneh bo odteklo ${formatEur(-neto)} več, kot bo priteklo. Vnesite stanje na računu, da preverimo, ali zadošča.`
  } else if (firstNegativeDate) {
    message = `Pozor — stanje na računu predvidoma pade pod nič ${fmtDan(firstNegativeDate)} (najnižje ${formatEur(minBalance)}).`
  } else {
    message = `Brez primanjkljaja — najnižje stanje v ${horizon} dneh: ${formatEur(minBalance)} (${fmtDan(minBalanceDate)}).`
  }

  return {
    days,
    summary: {
      totalInflow, invoiceInflow, estimatedInflow, totalOutflow, endBalance,
      hasStartingBalance, startingBalance: start,
      minBalance, minBalanceDate,
      daysNegative: negDays.length, firstNegativeDate,
      openInvoiceCount: input.openInvoices.length,
      overdueCount, overdueAmount,
      message,
    },
    deadlines,
  }
}

// ===== PRIPRAVA PODATKOV (klice Dashboard) =====

/**
 * Povprecen dnevni promet po dnevu v tednu iz KPO vnosov BREZ invoice_id
 * (blagajna, kartice, banka). Racuni so ze zajeti prek odprtih racunov.
 * Upostevajo se zakljuceni dnevi v zadnjih `lookbackDays` dneh, a ne pred
 * prvim vnosom (nov uporabnik nima umetno nizkega povprecja).
 */
export function estimateDailyIncomeByWeekday(
  kpo: Array<{ entry_date: string; income?: number | null; invoice_id?: string | null }>,
  now: Date,
  lookbackDays = 84,
): number[] {
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const from = addDays(today, -lookbackDays)
  const perDay = new Map<string, number>()
  let first: Date | null = null
  for (const e of kpo) {
    if (e.invoice_id || !e.entry_date) continue
    const inc = Number(e.income || 0)
    if (inc <= 0) continue
    const d = parseDate(e.entry_date)
    if (d < from || d >= today) continue
    if (!first || d < first) first = d
    perDay.set(e.entry_date.slice(0, 10), (perDay.get(e.entry_date.slice(0, 10)) || 0) + inc)
  }
  const sums = [0, 0, 0, 0, 0, 0, 0]
  const counts = [0, 0, 0, 0, 0, 0, 0]
  if (!first) return sums
  for (let d = new Date(first); d < today; d = addDays(d, 1)) {
    const wd = d.getDay()
    counts[wd]++
    sums[wd] += perDay.get(lokalniDatum(d)) || 0
  }
  return sums.map((s, i) => (counts[i] ? s / counts[i] : 0))
}

const IZKLJUCI_PONAVLJAJOCE = /furs|finan[čc]na uprava|zzzs|zpiz|prispev|dohodnin|ddv/i

/**
 * Zazna ponavljajoce stroske iz prejetih racunov: isti dobavitelj v vsaj
 * 2 od zadnjih 3 mesecev in vsaj enkrat v zadnjih 45 dneh. Znesek in dan sta
 * mediana. Davki/prispevki so izloceni (ze zajeti kot roki).
 */
export function detectRecurringExpenses(
  receipts: Array<{ vendor?: string | null; vendor_tax_num?: string | null; receipt_date: string; amount_total?: number | null; category?: string | null }>,
  now: Date,
): RecurringExpense[] {
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const from = addDays(today, -95)
  const recent = addDays(today, -45)
  const groups = new Map<string, { name: string; items: Array<{ d: Date; amt: number }> }>()
  for (const r of receipts) {
    if (!r.receipt_date) continue
    const name = String(r.vendor || '').trim()
    if (!name || IZKLJUCI_PONAVLJAJOCE.test(name) || IZKLJUCI_PONAVLJAJOCE.test(String(r.category || ''))) continue
    const d = parseDate(r.receipt_date)
    if (d < from || d >= addDays(today, 1)) continue
    const amt = Number(r.amount_total || 0)
    if (amt <= 0) continue
    const key = String(r.vendor_tax_num || '').replace(/\D/g, '') || name.toLowerCase()
    const g = groups.get(key) || { name, items: [] }
    g.items.push({ d, amt })
    groups.set(key, g)
  }
  const median = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y)
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  }
  const out: RecurringExpense[] = []
  for (const g of groups.values()) {
    const months = new Set(g.items.map(i => `${i.d.getFullYear()}-${i.d.getMonth()}`))
    if (months.size < 2) continue
    if (!g.items.some(i => i.d >= recent)) continue
    // Vec racunov na mesec (npr. tedenske dobave) -> mesecni znesek je vsota
    const perMonth = new Map<string, number>()
    for (const i of g.items) {
      const k = `${i.d.getFullYear()}-${i.d.getMonth()}`
      perMonth.set(k, (perMonth.get(k) || 0) + i.amt)
    }
    out.push({
      label: `${g.name} (ponavljajoč strošek)`,
      amount: Math.round(median([...perMonth.values()]) * 100) / 100,
      dayOfMonth: Math.round(median(g.items.map(i => i.d.getDate()))),
    })
  }
  return out.sort((a, b) => b.amount - a.amount)
}

/** Za skaliranje grafa */
export function getChartMaxValue(days: CashFlowDay[]): number {
  let max = 0
  for (const d of days) max = Math.max(max, d.inflow, d.outflow, Math.abs(d.balance))
  return max || 1
}
