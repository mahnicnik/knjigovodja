/**
 * RAČUNKO — Tax Calculator
 * 
 * Pure functions for calculating net income (čisti prihodek) for Slovenian
 * legal forms: s.p. (normirani 80%, normirani 40%, dejanski) and d.o.o.
 * 
 * IMPORTANT: These are simplified calculations for dashboard projection only.
 * Real tax filings should be done via official FURS forms and verified by 
 * a certified accountant. The numbers here aim for ±10% accuracy of actual liability.
 * 
 * Sources:
 * - ZDoh-2 (Zakon o dohodnini) — progressive rates and deductions
 * - ZDDV-1 (Zakon o DDV) — 22% standard rate
 * - ZPIZ-2 (Zakon o pokojninskem zavarovanju) — contribution rates
 * - Furs.si — 2025 minimum/average wage thresholds
 */
import { INCOME_TAX_BRACKETS as TC_BRACKETS, GENERAL_RELIEF_YEAR, MIN_WAGE as TC_MIN_WAGE } from './tax-constants'

export type LegalForm = 'sp' | 'doo' | 'zavod'
export type TaxSystem = 'normirani_80' | 'normirani_40' | 'dejanski' | 'doo_obdavcitev'

export interface TaxInput {
  /** Monthly revenue (gross, excluding VAT) in EUR */
  monthlyRevenue: number
  /** Monthly actual expenses (only relevant for 'dejanski' or 'doo_obdavcitev') */
  monthlyExpenses: number
  /** Year-to-date revenue total in EUR (used for normirani threshold checks) */
  yearlyRevenueToDate: number
  /** Pravna oblika */
  legalForm: LegalForm | null
  /** Sistem obdavčitve */
  taxSystem: TaxSystem | null
  /** Ali je org DDV zavezanec */
  isVatRegistered: boolean
}

export interface TaxBreakdown {
  /** Final net income (Čisti prihodek) — what owner actually keeps */
  netIncome: number
  /** Gross revenue (same as input.monthlyRevenue) */
  grossRevenue: number
  /** Total taxes + contributions */
  totalDeductions: number
  /** Breakdown details */
  details: {
    /** Recognized expenses (priznani odhodki) — 80% / 40% / actual */
    recognizedExpenses: number
    /** Tax base (davčna osnova) */
    taxBase: number
    /** Akontacija dohodnine (income tax advance) */
    incomeTax: number
    /** Prispevki za s.p. (social contributions) */
    contributions: number
    /** DDV obveznost (VAT liability — only if VAT registered) */
    vatLiability: number
    /** Effective tax rate as decimal (0.22 = 22%) */
    effectiveRate: number
  }
  /** Human-readable label for the tax system */
  systemLabel: string
}

// ===== KONSTANTE 2025/2026 =====

/** Minimalna plača bruto 2026 — osnova za minimalne prispevke s.p.
 *  POSODOBLJENO 30.7.2026: prej 1253,90 EUR (vrednost izpred dveh let).
 *  Uradni vir: Uradni list RS 2026-01-0175 (velja od 1.1.2026). */
const MIN_WAGE_2025 = TC_MIN_WAGE // iz lib/tax-constants.ts

/** Povprečna plača RS — osnova za maksimalne prispevke (predvideno 2025)
 *  ⚠️ NEPREVERJENO ZA 2026 (audit 30.7.2026) — ta vrednost je iz 2025 in
 *  je nisem uradno preveril. Vpliva na izračun maksimalnih prispevkov.
 *  Priporočilo: preveriti pri računovodji in posodobiti. */
const AVG_WAGE_2025 = 2280.30

/** Prispevki s.p. — približno ~33% bruto osnove (najnižja osnova) */
const SP_CONTRIBUTIONS_MIN = 522.13 // dejansko ~€522 na mesec (ZPIZ + ZZZS + zaposlovanje)

/** DDV standardna stopnja Slovenija */
const VAT_RATE = 0.22

/** Davek od dobička pravnih oseb (d.o.o.) */
const CIT_RATE = 0.19

/** Dohodnina — progresivna lestvica 2026 (mesečno, /12)
 *  POSODOBLJENO 30.7.2026: prej lestvica 2025
 *  (8755,06 / 25750,50 / 51500 / 74160). Vir: FURS, preverjeno 26.7.2026. */
const INCOME_TAX_BRACKETS = TC_BRACKETS.map(b => ({ upTo: b.upTo === Infinity ? Infinity : b.upTo / 12, rate: b.rate })) // mesecne meje iz lib/tax-constants.ts

/** Splošna olajšava 2026 (mesečno)
 *  POSODOBLJENO 30.7.2026: prej 5000 EUR (2025). Vir: FURS. */
const GENERAL_ALLOWANCE = GENERAL_RELIEF_YEAR / 12 // iz lib/tax-constants.ts

// ===== POMOŽNE FUNKCIJE =====

/**
 * Izračuna progresivno dohodnino za mesečno davčno osnovo.
 * Vrne EUR znesek dohodnine (ne odstotek).
 */
function calculateProgressiveTax(monthlyTaxBase: number): number {
  if (monthlyTaxBase <= 0) return 0
  
  // Odštej splošno olajšavo
  const taxable = Math.max(0, monthlyTaxBase - GENERAL_ALLOWANCE)
  if (taxable === 0) return 0
  
  let tax = 0
  let remaining = taxable
  let prevThreshold = 0
  
  for (const bracket of INCOME_TAX_BRACKETS) {
    const bracketWidth = bracket.upTo - prevThreshold
    const inBracket = Math.min(remaining, bracketWidth)
    tax += inBracket * bracket.rate
    remaining -= inBracket
    prevThreshold = bracket.upTo
    if (remaining <= 0) break
  }
  
  return tax
}

/**
 * Vrne pravilno human-readable labelo za davčni sistem.
 */
export function getTaxSystemLabel(taxSystem: TaxSystem | null): string {
  switch (taxSystem) {
    case 'normirani_80': return 'Normirani 80%'
    case 'normirani_40': return 'Normirani 40%'
    case 'dejanski': return 'Dejanski stroški'
    case 'doo_obdavcitev': return 'd.o.o. obdavčitev'
    default: return '—'
  }
}

// ===== GLAVNA FUNKCIJA =====

/**
 * Izračuna čisti prihodek (net income) za podan mesec.
 * 
 * Predpostavke:
 * - Revenue je brez DDV (neto)
 * - Prispevki s.p. so fiksno €522/mes (minimalna osnova)
 * - Dohodnina se izračuna progresivno mesečno (poenostavljeno)
 * - DDV se izračuna kot 22% × revenue, če je org DDV zavezanec
 * - Pri d.o.o. predpostavljamo da je vse revenue obdavčen po 19%
 */
export function calculateNetIncome(input: TaxInput): TaxBreakdown {
  const {
    monthlyRevenue,
    monthlyExpenses,
    yearlyRevenueToDate,
    legalForm,
    taxSystem,
    isVatRegistered,
  } = input

  // Fallback če sistem ni nastavljen
  const system = taxSystem ?? (legalForm === 'doo' ? 'doo_obdavcitev' : 'normirani_80')

  let recognizedExpenses = 0
  let taxBase = 0
  let incomeTax = 0
  let contributions = 0
  let vatLiability = 0

  // ===== PRIZNANI ODHODKI =====
  switch (system) {
    case 'normirani_80':
      recognizedExpenses = monthlyRevenue * 0.80
      taxBase = monthlyRevenue * 0.20
      break
    case 'normirani_40':
      recognizedExpenses = monthlyRevenue * 0.40
      taxBase = monthlyRevenue * 0.60
      break
    case 'dejanski':
      recognizedExpenses = monthlyExpenses
      taxBase = Math.max(0, monthlyRevenue - monthlyExpenses)
      break
    case 'doo_obdavcitev':
      recognizedExpenses = monthlyExpenses
      taxBase = Math.max(0, monthlyRevenue - monthlyExpenses)
      break
  }

  // ===== DOHODNINA / DAVEK OD DOBIČKA =====
  if (system === 'doo_obdavcitev') {
    // d.o.o. — 19% davek od dobička (CIT)
    incomeTax = taxBase * CIT_RATE
  } else {
    // s.p. — progresivna dohodnina
    incomeTax = calculateProgressiveTax(taxBase)
  }

  // ===== PRISPEVKI =====
  if (legalForm === 'sp') {
    // s.p. plača €522/mes prispevkov (ne glede na revenue)
    contributions = SP_CONTRIBUTIONS_MIN
  } else if (legalForm === 'doo') {
    // d.o.o. nima prispevkov na ravni podjetja (direktor jih plača posebej)
    contributions = 0
  }

  // ===== DDV =====
  if (isVatRegistered) {
    // Poenostavljeno: 22% od revenue
    // (V realnosti je to izhodna DDV - vstopna DDV)
    vatLiability = monthlyRevenue * VAT_RATE
  }

  // ===== ČISTI PRIHODEK =====
  // Za s.p.: revenue - dohodnina - prispevki - (DDV če zavezanec)
  // Za d.o.o.: revenue - CIT - DDV
  // Pri normirancu: revenue - dohodnina - prispevki - DDV (DDV vpliva ker je revenue neto)
  
  let netIncome = 0
  let totalDeductions = 0

  if (system === 'doo_obdavcitev') {
    // d.o.o.: revenue je promet, profit je revenue - expenses, davek je 19% × profit
    totalDeductions = incomeTax + vatLiability
    netIncome = monthlyRevenue - monthlyExpenses - incomeTax - vatLiability
  } else {
    // s.p.
    totalDeductions = incomeTax + contributions + vatLiability
    netIncome = monthlyRevenue - incomeTax - contributions - vatLiability
    // Za dejanski s.p. odštejemo še dejanske stroške
    if (system === 'dejanski') {
      netIncome -= monthlyExpenses
    }
  }

  // Sanitize — nikoli ne pokaži negativnega netIncome kot smiselno vrednost
  netIncome = Math.max(0, netIncome)

  const effectiveRate = monthlyRevenue > 0 ? totalDeductions / monthlyRevenue : 0

  return {
    netIncome,
    grossRevenue: monthlyRevenue,
    totalDeductions,
    details: {
      recognizedExpenses,
      taxBase,
      incomeTax,
      contributions,
      vatLiability,
      effectiveRate,
    },
    systemLabel: getTaxSystemLabel(system),
  }
}

/**
 * Ekstrapolira mesečno revenue do konca meseca na podlagi do sedaj zaslužene vrednosti.
 * 
 * @param revenueToDate  Vrednost zaslužena do dneva dayOfMonth
 * @param dayOfMonth     Trenuten dan v mesecu (1-31)
 * @param totalDaysInMonth Skupno dni v mesecu (28-31)
 */
export function projectMonthlyRevenue(
  revenueToDate: number,
  dayOfMonth: number,
  totalDaysInMonth: number
): number {
  if (dayOfMonth <= 0) return revenueToDate
  if (dayOfMonth >= totalDaysInMonth) return revenueToDate
  // Linearna ekstrapolacija
  return (revenueToDate / dayOfMonth) * totalDaysInMonth
}

/**
 * Preveri ali je org blizu/nad pragom normiranega sistema.
 * Vrne warning če:
 * - normirani_80 in yearly_revenue > €50.000 (od 2025 prag €60k)
 * - normirani_40 in yearly_revenue > €85.000 (prag €100k)
 */
export function checkNormirancePragRisk(
  yearlyRevenueToDate: number,
  taxSystem: TaxSystem | null,
  monthsElapsed: number,
): { atRisk: boolean; projectedYearly: number; threshold: number; message: string } {
  if (monthsElapsed === 0) {
    return { atRisk: false, projectedYearly: 0, threshold: 0, message: '' }
  }
  
  const projectedYearly = (yearlyRevenueToDate / monthsElapsed) * 12
  
  if (taxSystem === 'normirani_80') {
    const threshold = 60000
    const atRisk = projectedYearly > threshold * 0.83 // > 83% praga
    return {
      atRisk,
      projectedYearly,
      threshold,
      message: atRisk
        ? `Pri tem tempu boste leto zaključili pri ~€${Math.round(projectedYearly).toLocaleString('sl-SI')}. Prag normiranca 80% je €${threshold.toLocaleString('sl-SI')}.`
        : `V varnem območju za normirani 80%.`
    }
  }
  
  if (taxSystem === 'normirani_40') {
    const threshold = 100000
    const atRisk = projectedYearly > threshold * 0.83
    return {
      atRisk,
      projectedYearly,
      threshold,
      message: atRisk
        ? `Pri tem tempu boste leto zaključili pri ~€${Math.round(projectedYearly).toLocaleString('sl-SI')}. Prag normiranca 40% je €${threshold.toLocaleString('sl-SI')}.`
        : `V varnem območju za normirani 40%.`
    }
  }
  
  return {
    atRisk: false,
    projectedYearly,
    threshold: 0,
    message: ''
  }
}