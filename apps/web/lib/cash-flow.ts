/**
 * RAČUNKO — Cash Flow Forecast
 * 
 * Pure functions for generating 30-day cash flow projection based on:
 * - Open invoices (expected inflow on due_date)
 * - Tax deadlines (prispevki 15., dohodnina 15., DDV konec meseca)
 * - REK-1 obveznosti (25. v mesecu, če ima zaposlene)
 * - Recurring expenses (placeholder za prihodnost)
 * 
 * Vrne strukturo primerno za rendering grafa in summary panela.
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

export interface CashFlowInput {
  /** Open invoices (status === 'sent', not yet paid) */
  openInvoices: OpenInvoice[]
  /** Org pravna oblika */
  legalForm: LegalForm | null
  /** Sistem obdavčitve */
  taxSystem: TaxSystem | null
  /** Ali je DDV zavezanec */
  isVatRegistered: boolean
  /** Ali ima zaposlene (za REK-1) */
  hasEmployees: boolean
  /** Pričakovana mesečna DDV obveznost (iz tax calculator) */
  monthlyVatLiability: number
  /** Pričakovana mesečna dohodnina */
  monthlyIncomeTax: number
  /** Pričakovani mesečni prispevki */
  monthlyContributions: number
  /** Pricakovan mesecni strosek plac (bruto + prispevki delodajalca) -
      DODANO 11.8.2026, prej trdo kodiranih €800 "Placeholder" */
  monthlyPayrollCost?: number
  /** Trenutni datum (default: now) */
  now?: Date
}

export interface CashFlowDay {
  /** Datum 'YYYY-MM-DD' */
  date: string
  /** Dan v mesecu (1-31) */
  day: number
  /** Pričakovani dotok ta dan */
  inflow: number
  /** Pričakovani odtok ta dan */
  outflow: number
  /** Kumulativna bilanca od today do tega dne */
  balance: number
  /** Razlogi za dotok (npr. ime stranke + #račun) */
  inflowReasons: string[]
  /** Razlogi za odtok (npr. "Prispevki s.p.") */
  outflowReasons: string[]
}

export interface CashFlowSummary {
  /** Skupni pričakovani dotok v naslednjih 30 dneh */
  totalInflow: number
  /** Skupni pričakovani odtok */
  totalOutflow: number
  /** Bilanca po 30 dneh */
  endBalance: number
  /** Število dni z negativno bilanco */
  daysNegative: number
  /** Število open invoices */
  openInvoiceCount: number
  /** Človeški povzetek */
  message: string
}

export interface CashFlowResult {
  days: CashFlowDay[]
  summary: CashFlowSummary
  /** DODANO 11.8.2026: surovi seznam vseh napovedanih odtokov (za
      razclenitveno tabelo - "od kod prihaja ta znesek") */
  deadlines: Array<{ date: string; amount: number; label: string }>
}

// ===== POMOŽNE FUNKCIJE =====

function formatDate(d: Date): string {
  return lokalniDatum(d)
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/**
 * Vrne datume davčnih rokov v naslednjih 30 dneh.
 * - Prispevki s.p. + dohodnina: 15. v mesecu
 * - REK-1 + plače: 25. v mesecu (samo če ima zaposlene)
 * - DDV-O: konec naslednjega meseca (mesečno) ali konec kvartala (kvartalno)
 */
function getTaxDeadlines(
  now: Date,
  input: CashFlowInput
): Array<{ date: Date; amount: number; label: string }> {
  const deadlines: Array<{ date: Date; amount: number; label: string }> = []
  const year = now.getFullYear()
  const month = now.getMonth()
  
  // 15. tega meseca (če še ni mimo) in naslednjega meseca
  for (let monthOffset = 0; monthOffset <= 1; monthOffset++) {
    const dueDate = new Date(year, month + monthOffset, 15)
    const days = daysBetween(now, dueDate)
    if (days >= 0 && days <= 30) {
      // Prispevki s.p.
      if (input.legalForm === 'sp' && input.monthlyContributions > 0) {
        deadlines.push({
          date: dueDate,
          amount: input.monthlyContributions,
          label: 'Prispevki s.p.',
        })
      }
      // Akontacija dohodnine (s.p.)
      if (input.legalForm === 'sp' && input.monthlyIncomeTax > 0) {
        deadlines.push({
          date: dueDate,
          amount: input.monthlyIncomeTax,
          label: 'Akontacija dohodnine',
        })
      }
    }
  }
  
  // 25. tega ali naslednjega meseca — REK-1 + plače
  if (input.hasEmployees) {
    for (let monthOffset = 0; monthOffset <= 1; monthOffset++) {
      const dueDate = new Date(year, month + monthOffset, 25)
      const days = daysBetween(now, dueDate)
      if (days >= 0 && days <= 30) {
        deadlines.push({
          date: dueDate,
          amount: input.monthlyPayrollCost ?? 0, // POPRAVLJENO 11.8.2026: prej trdo kodiranih 800
          label: 'REK-1 + plače (bruto + prispevki delodajalca)',
        })
      }
    }
  }
  
  // DDV-O — konec naslednjega meseca (poenostavljeno)
  if (input.isVatRegistered && input.monthlyVatLiability > 0) {
    // Kvartal mejnik: jan, apr, jul, okt — DDV za prejšnji kvartal
    // Za poenostavitev: vsako konec meseca
    const lastDayThisMonth = new Date(year, month + 1, 0)
    const daysThisMonth = daysBetween(now, lastDayThisMonth)
    if (daysThisMonth >= 0 && daysThisMonth <= 30) {
      deadlines.push({
        date: lastDayThisMonth,
        amount: input.monthlyVatLiability,
        label: 'DDV obveznost',
      })
    }
  }
  
  return deadlines
}

// ===== GLAVNA FUNKCIJA =====

/**
 * Generira 30-dnevni cash flow forecast.
 * 
 * Day-by-day struktura, kjer vsak dan vsebuje:
 * - inflow (vsota due_amount od invoices ki due_date == ta dan)
 * - outflow (davčni roki + plače)
 * - balance (kumulativno od day 0)
 */
export function generateCashFlow(input: CashFlowInput): CashFlowResult {
  const now = input.now ?? new Date()
  now.setHours(0, 0, 0, 0)
  
  // Pripravi 30 prazno-iniciranih dni
  const days: CashFlowDay[] = []
  for (let i = 0; i < 30; i++) {
    const d = addDays(now, i)
    days.push({
      date: formatDate(d),
      day: d.getDate(),
      inflow: 0,
      outflow: 0,
      balance: 0,
      inflowReasons: [],
      outflowReasons: [],
    })
  }
  
  // INFLOW — open invoices
  for (const inv of input.openInvoices) {
    const dueDate = new Date(inv.due_date)
    dueDate.setHours(0, 0, 0, 0)
    const dayIdx = daysBetween(now, dueDate)
    if (dayIdx >= 0 && dayIdx < 30) {
      days[dayIdx].inflow += Number(inv.amount_total)
      days[dayIdx].inflowReasons.push(`${inv.client_name} (#${inv.invoice_number})`)
    } else if (dayIdx < 0) {
      // Zapadel račun — štejemo kot day 0 inflow (pesimistično predpostavimo da bo plačan danes)
      // POPRAVLJENO (17.8.2026): pri praznem seznamu dni bi dostop do prvega
      // elementa vrgel napako in podrl izracun pretoka denarja.
      if (days[0]) {
        days[0].inflow += Number(inv.amount_total)
        days[0].inflowReasons.push(`${inv.client_name} (zapadel)`)
      }
    }
  }
  
  // OUTFLOW — davčni roki
  const deadlines = getTaxDeadlines(now, input)
  for (const dl of deadlines) {
    const dayIdx = daysBetween(now, dl.date)
    if (dayIdx >= 0 && dayIdx < 30) {
      days[dayIdx].outflow += dl.amount
      days[dayIdx].outflowReasons.push(dl.label)
    }
  }
  
  // BALANCE — kumulativno
  let runningBalance = 0
  for (const day of days) {
    runningBalance += day.inflow - day.outflow
    day.balance = runningBalance
  }
  
  // SUMMARY
  const totalInflow = days.reduce((s, d) => s + d.inflow, 0)
  const totalOutflow = days.reduce((s, d) => s + d.outflow, 0)
  const endBalance = days[days.length - 1].balance
  const daysNegative = days.filter(d => d.balance < 0).length
  
  let message = ''
  if (endBalance >= 0 && daysNegative === 0) {
    message = `Bilanca po 30 dneh: +€${Math.round(endBalance).toLocaleString('sl-SI')}. Vse je pod kontrolo.`
  } else if (daysNegative > 0) {
    message = `Pozor — pričakujemo ${daysNegative} ${daysNegative === 1 ? 'dan' : 'dni'} z negativno bilanco. Razmislite o pospešitvi plačil.`
  } else if (endBalance < 0) {
    message = `Bilanca po 30 dneh: −€${Math.abs(Math.round(endBalance)).toLocaleString('sl-SI')}. Pričakujte primanjkljaj.`
  }
  
  return {
    days,
    summary: {
      totalInflow,
      totalOutflow,
      endBalance,
      daysNegative,
      openInvoiceCount: input.openInvoices.length,
      message,
    },
    deadlines: deadlines.map(d => ({ date: formatDate(d.date), amount: d.amount, label: d.label })),
  }
}

/**
 * Helper za rendering chart-a — vrne max absolute value za normalization.
 */
export function getChartMaxValue(days: CashFlowDay[]): number {
  let max = 0
  for (const d of days) {
    max = Math.max(max, d.inflow, d.outflow, Math.abs(d.balance))
  }
  return max || 1 // Avoid division by zero
}