// ============================================================
// DDV ENGINE — Izračun DDV obračuna
// ============================================================

import { VAT_RATES, VAT_DUE_DATES } from './constants'

export interface VATEntry {
  amount_net: number
  vat_rate: number   // 22, 9.5, ali 0
  type: 'income' | 'expense'
}

export interface VATCalculationResult {
  // Prodaje (izhodni DDV)
  sales_22: number
  sales_95: number
  sales_0: number
  vat_out_22: number
  vat_out_95: number
  vat_out: number       // Skupaj izhodni DDV
  // Nabave (vhodni DDV)
  purchases_22: number
  purchases_95: number
  vat_in_22: number
  vat_in_95: number
  vat_in: number        // Skupaj vhodni DDV
  // Razlika
  vat_due: number       // Pozitivno = dolgujete FURS, negativno = FURS vam vrne
  refund: boolean       // Ali imate pravico do vračila
}

/**
 * Izračun DDV obračuna za period (mesec ali kvartal)
 */
export function calculateVAT(entries: VATEntry[]): VATCalculationResult {
  let sales_22 = 0, sales_95 = 0, sales_0 = 0
  let purchases_22 = 0, purchases_95 = 0

  for (const entry of entries) {
    if (entry.type === 'income') {
      if (entry.vat_rate === 22) sales_22 += entry.amount_net
      else if (entry.vat_rate === 9.5) sales_95 += entry.amount_net
      else if (entry.vat_rate === 0) sales_0 += entry.amount_net
    } else {
      if (entry.vat_rate === 22) purchases_22 += entry.amount_net
      else if (entry.vat_rate === 9.5) purchases_95 += entry.amount_net
    }
  }

  const vat_out_22 = round(sales_22 * 0.22)
  const vat_out_95 = round(sales_95 * 0.095)
  const vat_out = round(vat_out_22 + vat_out_95)

  const vat_in_22 = round(purchases_22 * 0.22)
  const vat_in_95 = round(purchases_95 * 0.095)
  const vat_in = round(vat_in_22 + vat_in_95)

  const vat_due = round(vat_out - vat_in)

  return {
    sales_22: round(sales_22),
    sales_95: round(sales_95),
    sales_0: round(sales_0),
    vat_out_22,
    vat_out_95,
    vat_out,
    purchases_22: round(purchases_22),
    purchases_95: round(purchases_95),
    vat_in_22,
    vat_in_95,
    vat_in,
    vat_due,
    refund: vat_due < 0,
  }
}

/**
 * Vrne rok za DDV obračun glede na kvartal
 */
export function getVATDueDate(quarter: 1 | 2 | 3 | 4): string {
  return VAT_DUE_DATES[quarter]
}

/**
 * Izračun DDV na znesek (dodaj DDV k neto znesku)
 */
export function addVAT(netAmount: number, rate: number): { net: number; vat: number; total: number } {
  const vat = round(netAmount * (rate / 100))
  return { net: round(netAmount), vat, total: round(netAmount + vat) }
}

/**
 * Izračun neto iz bruto zneska (odštej DDV)
 */
export function removeVAT(totalAmount: number, rate: number): { net: number; vat: number; total: number } {
  const net = round(totalAmount / (1 + rate / 100))
  const vat = round(totalAmount - net)
  return { net, vat, total: round(totalAmount) }
}

function round(v: number) { return Math.round(v * 100) / 100 }
