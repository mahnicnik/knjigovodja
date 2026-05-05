// ============================================================
// PAYROLL ENGINE — Izračun plače za slovenskega delodajalca
// Vse stopnje so za leto 2026
// ============================================================

import {
  EE_CONTRIBUTIONS,
  ER_CONTRIBUTIONS,
  INCOME_TAX_BRACKETS,
  GENERAL_RELIEF_ANNUAL,
  DEPENDENT_RELIEF,
  MIN_WAGE,
} from './constants'

export interface PayrollInput {
  grossSalary: number        // Bruto plača
  dependents?: number        // Število vzdrževanih otrok (default 0)
  travelExpenses?: number    // Potni stroški (neobdavčeno)
  mealAllowance?: number     // Dnevnica (neobdavčeno)
  otherAllowances?: number   // Ostali neobdavčeni dodatki
}

export interface PayrollResult {
  // Vhod
  grossSalary: number
  // Prispevki delojemalca
  ee_piz: number             // Pokojnina 15.50%
  ee_zzzs: number            // Zdravstvo 6.36%
  ee_injury: number          // Poškodbe 0.14%
  ee_unemployment: number    // Brezposelnost 0.14%
  ee_total: number           // Skupaj prispevki delojemalca
  // Dohodnina
  taxableBase: number        // Davčna osnova
  generalRelief: number      // Splošna olajšava (mesečna)
  dependentRelief: number    // Olajšava za vzdrževane (mesečna)
  incomeTax: number          // Dohodnina odtegljaj
  // Neto
  netSalary: number          // Neto plača delavcu
  // Prispevki delodajalca
  er_piz: number             // Pokojnina 8.85%
  er_zzzs: number            // Zdravstvo 6.56%
  er_injury: number          // Poškodbe 0.53%
  er_unemployment: number    // Brezposelnost 0.14%
  er_parental: number        // Starševstvo 0.10%
  er_total: number           // Skupaj delodajalec
  // Skupni stroški
  totalCost: number          // Skupaj strošek (bruto + er_total)
  totalFurs: number          // Skupaj plačila FURS (davki + vsi prispevki)
  // Efektivne stopnje
  effectiveTaxRate: number   // Efektivna dohodninska stopnja
  totalDeductionRate: number // Skupni odbitek od bruto
}

/**
 * Izračun mesečne plače — bruto → neto
 * Vsi zneski so zaokroženi na 2 decimalni mesti
 */
export function calculatePayroll(input: PayrollInput): PayrollResult {
  const { grossSalary, dependents = 0, travelExpenses = 0, mealAllowance = 0, otherAllowances = 0 } = input

  if (grossSalary < MIN_WAGE) {
    throw new Error(`Bruto plača (€${grossSalary}) je pod minimalno plačo (€${MIN_WAGE})`)
  }

  // ── 1. PRISPEVKI DELOJEMALCA ──────────────────────────────
  const ee_piz          = round(grossSalary * EE_CONTRIBUTIONS.piz)
  const ee_zzzs         = round(grossSalary * EE_CONTRIBUTIONS.zzzs)
  const ee_injury       = round(grossSalary * EE_CONTRIBUTIONS.injury)
  const ee_unemployment = round(grossSalary * EE_CONTRIBUTIONS.unemployment)
  const ee_total        = round(ee_piz + ee_zzzs + ee_injury + ee_unemployment)

  // ── 2. DOHODNINA ─────────────────────────────────────────
  // Osnova za dohodnino = bruto - prispevki delojemalca
  const grossMinusContributions = round(grossSalary - ee_total)

  // Mesečna splošna olajšava
  const generalRelief   = round(GENERAL_RELIEF_ANNUAL / 12)

  // Mesečna olajšava za vzdrževane otroke
  const annualDepRelief = dependents > 0
    ? (DEPENDENT_RELIEF[Math.min(dependents, 3) as keyof typeof DEPENDENT_RELIEF] ?? 0)
    : 0
  const dependentRelief = round(annualDepRelief / 12)

  // Davčna osnova
  const taxableBase = Math.max(0, round(grossMinusContributions - generalRelief - dependentRelief))

  // Dohodnina po lestvici (mesečna)
  const annualTaxableBase = taxableBase * 12
  const annualTax = calculateIncomeTax(annualTaxableBase)
  const incomeTax = round(annualTax / 12)

  // ── 3. NETO PLAČA ─────────────────────────────────────────
  const netSalary = round(grossSalary - ee_total - incomeTax)

  // ── 4. PRISPEVKI DELODAJALCA ──────────────────────────────
  const er_piz          = round(grossSalary * ER_CONTRIBUTIONS.piz)
  const er_zzzs         = round(grossSalary * ER_CONTRIBUTIONS.zzzs)
  const er_injury       = round(grossSalary * ER_CONTRIBUTIONS.injury)
  const er_unemployment = round(grossSalary * ER_CONTRIBUTIONS.unemployment)
  const er_parental     = round(grossSalary * ER_CONTRIBUTIONS.parental)
  const er_total        = round(er_piz + er_zzzs + er_injury + er_unemployment + er_parental)

  // ── 5. SKUPNI STROŠKI ─────────────────────────────────────
  const totalCost = round(grossSalary + er_total)
  const totalFurs = round(ee_total + incomeTax + er_total)

  // ── 6. EFEKTIVNE STOPNJE ──────────────────────────────────
  const effectiveTaxRate      = grossSalary > 0 ? round((incomeTax / grossSalary) * 100) : 0
  const totalDeductionRate    = grossSalary > 0 ? round(((ee_total + incomeTax) / grossSalary) * 100) : 0

  return {
    grossSalary,
    ee_piz, ee_zzzs, ee_injury, ee_unemployment, ee_total,
    taxableBase, generalRelief, dependentRelief, incomeTax,
    netSalary,
    er_piz, er_zzzs, er_injury, er_unemployment, er_parental, er_total,
    totalCost, totalFurs,
    effectiveTaxRate, totalDeductionRate,
  }
}

/**
 * Izračun letne dohodnine po progresivni lestvici
 */
export function calculateIncomeTax(annualTaxableIncome: number): number {
  if (annualTaxableIncome <= 0) return 0

  let tax = 0
  let previousLimit = 0

  for (const bracket of INCOME_TAX_BRACKETS) {
    if (annualTaxableIncome <= previousLimit) break
    const taxableInBracket = Math.min(annualTaxableIncome, bracket.upTo) - previousLimit
    tax += taxableInBracket * bracket.rate
    previousLimit = bracket.upTo
    if (bracket.upTo === Infinity) break
  }

  return round(tax)
}

/**
 * Izračun dohodnine za s.p. lastnika (letna napoved)
 */
export interface SPIncomeTaxInput {
  annualRevenue: number        // Skupni prihodki
  annualExpenses: number       // Skupni odhodki
  annualContributions: number  // Letni prispevki s.p.
  dependents?: number
}

export interface SPIncomeTaxResult {
  taxableBase: number          // Davčna osnova
  generalRelief: number        // Splošna olajšava
  dependentRelief: number      // Olajšava za vzdrževane
  incomeTax: number            // Dohodnina
  effectiveRate: number        // Efektivna stopnja (%)
  netMonthly: number           // Ocenjeni mesečni prihodek po vseh dajatvah
  bracket: string              // Trenutni davčni razred
  nextBracketAt: number | null // Osnova do naslednjega razreda
}

export function calculateSPIncomeTax(input: SPIncomeTaxInput): SPIncomeTaxResult {
  const { annualRevenue, annualExpenses, annualContributions, dependents = 0 } = input

  const taxableBase = Math.max(0, annualRevenue - annualExpenses - annualContributions)

  const generalRelief   = GENERAL_RELIEF_ANNUAL
  const annualDepRelief = dependents > 0
    ? (DEPENDENT_RELIEF[Math.min(dependents, 3) as keyof typeof DEPENDENT_RELIEF] ?? 0)
    : 0

  const adjustedBase = Math.max(0, taxableBase - generalRelief - annualDepRelief)
  const incomeTax = calculateIncomeTax(adjustedBase)
  const effectiveRate = adjustedBase > 0 ? round((incomeTax / adjustedBase) * 100) : 0

  const netAnnual = annualRevenue - annualExpenses - annualContributions - incomeTax
  const netMonthly = round(netAnnual / 12)

  // Ugotovi trenutni razred
  let bracket = '16%'
  let nextBracketAt: number | null = null
  for (const b of INCOME_TAX_BRACKETS) {
    if (adjustedBase > (b.upTo === Infinity ? adjustedBase : b.upTo)) {
      bracket = `${Math.round(b.rate * 100)}%`
    } else {
      bracket = `${Math.round(b.rate * 100)}%`
      nextBracketAt = b.upTo === Infinity ? null : round(b.upTo - adjustedBase)
      break
    }
  }

  return {
    taxableBase: round(taxableBase),
    generalRelief,
    dependentRelief: annualDepRelief,
    incomeTax,
    effectiveRate,
    netMonthly,
    bracket,
    nextBracketAt,
  }
}

// Pomožna funkcija za zaokroževanje
function round(value: number): number {
  return Math.round(value * 100) / 100
}
