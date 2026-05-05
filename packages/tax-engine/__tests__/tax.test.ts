// ============================================================
// TESTI — Davčni izračuni morajo biti 100% pravilni
// Zaženite: cd packages/tax-engine && npm test
// ============================================================

import { describe, it, expect } from 'vitest'
import { calculatePayroll, calculateIncomeTax, calculateSPIncomeTax } from '../src/payroll'
import { calculateVAT, addVAT, removeVAT } from '../src/ddv'
import { MIN_WAGE } from '../src/constants'

// ── PLAČA ────────────────────────────────────────────────────

describe('calculatePayroll', () => {
  it('izračuna pravilno za bruto €1,800, 0 otrok', () => {
    const result = calculatePayroll({ grossSalary: 1800 })

    // Prispevki delojemalca
    expect(result.ee_piz).toBe(279.00)          // 1800 × 15.50%
    expect(result.ee_zzzs).toBe(114.48)         // 1800 × 6.36%
    expect(result.ee_injury).toBe(2.52)         // 1800 × 0.14%
    expect(result.ee_unemployment).toBe(2.52)   // 1800 × 0.14%
    expect(result.ee_total).toBe(398.52)

    // Neto mora biti pozitiven
    expect(result.netSalary).toBeGreaterThan(0)
    expect(result.netSalary).toBeLessThan(1800)

    // Prispevki delodajalca
    expect(result.er_piz).toBe(159.30)          // 1800 × 8.85%
    expect(result.er_zzzs).toBe(118.08)         // 1800 × 6.56%
    expect(result.er_injury).toBe(9.54)         // 1800 × 0.53%
    expect(result.er_unemployment).toBe(2.52)   // 1800 × 0.14%
    expect(result.er_parental).toBe(1.80)       // 1800 × 0.10%

    // Skupni strošek = bruto + delodajalčevi prispevki
    expect(result.totalCost).toBe(result.grossSalary + result.er_total)
  })

  it('upošteva olajšavo za 2 otroka', () => {
    const brez = calculatePayroll({ grossSalary: 2000, dependents: 0 })
    const z2   = calculatePayroll({ grossSalary: 2000, dependents: 2 })
    // Z otroci = manjša dohodnina = večja neto plača
    expect(z2.netSalary).toBeGreaterThan(brez.netSalary)
    expect(z2.incomeTax).toBeLessThan(brez.incomeTax)
  })

  it('vrže napako za plačo pod minimumom', () => {
    expect(() => calculatePayroll({ grossSalary: 1000 })).toThrow()
  })

  it('skupaj FURS = prispevki ee + dohodnina + prispevki er', () => {
    const r = calculatePayroll({ grossSalary: 2500 })
    expect(r.totalFurs).toBe(r.ee_total + r.incomeTax + r.er_total)
  })

  it('neto + ee_total + dohodnina = bruto', () => {
    const r = calculatePayroll({ grossSalary: 3000 })
    const sum = r.netSalary + r.ee_total + r.incomeTax
    expect(Math.abs(sum - r.grossSalary)).toBeLessThan(0.02) // Toleranca zaokroževanja
  })
})

// ── DOHODNINA ────────────────────────────────────────────────

describe('calculateIncomeTax', () => {
  it('vrne 0 za osnovo 0', () => {
    expect(calculateIncomeTax(0)).toBe(0)
  })

  it('pravilno izračuna za osnovo v prvem razredu (16%)', () => {
    // €5,000 × 16% = €800
    expect(calculateIncomeTax(5000)).toBe(800)
  })

  it('pravilno izračuna za osnovo v drugem razredu (26%)', () => {
    // €8,755 × 16% + (€15,000 - €8,755) × 26%
    const firstBracket = 8755 * 0.16      // 1400.80
    const secondBracket = (15000 - 8755) * 0.26  // 1623.70
    expect(calculateIncomeTax(15000)).toBe(Math.round((firstBracket + secondBracket) * 100) / 100)
  })

  it('je progresivna — višja osnova = višji efektivni %', () => {
    const t1 = calculateIncomeTax(20000)
    const t2 = calculateIncomeTax(50000)
    const rate1 = t1 / 20000
    const rate2 = t2 / 50000
    expect(rate2).toBeGreaterThan(rate1)
  })
})

// ── S.P. DOHODNINA ───────────────────────────────────────────

describe('calculateSPIncomeTax', () => {
  it('izračuna pravilno za tipičnega s.p.', () => {
    const result = calculateSPIncomeTax({
      annualRevenue: 40000,
      annualExpenses: 5000,
      annualContributions: 5400,
    })
    expect(result.taxableBase).toBe(29600) // 40000 - 5000 - 5400
    expect(result.incomeTax).toBeGreaterThan(0)
    expect(result.netMonthly).toBeGreaterThan(0)
    expect(result.bracket).toBeTruthy()
  })

  it('vrne 0 dohodnine za osnovo pod olajšavo', () => {
    const result = calculateSPIncomeTax({
      annualRevenue: 10000,
      annualExpenses: 3000,
      annualContributions: 5400,
    })
    // Osnova: 10000 - 3000 - 5400 = 1600
    // Po splošni olajšavi 5000: negativno → 0 davka
    expect(result.incomeTax).toBe(0)
  })
})

// ── DDV ──────────────────────────────────────────────────────

describe('calculateVAT', () => {
  it('pravilno izračuna izhodni DDV 22%', () => {
    const result = calculateVAT([
      { amount_net: 10000, vat_rate: 22, type: 'income' },
    ])
    expect(result.vat_out).toBe(2200)   // 10000 × 22%
    expect(result.vat_in).toBe(0)
    expect(result.vat_due).toBe(2200)
    expect(result.refund).toBe(false)
  })

  it('pravilno izračuna vhodni DDV (vračilo)', () => {
    const result = calculateVAT([
      { amount_net: 1000, vat_rate: 22, type: 'income' },
      { amount_net: 5000, vat_rate: 22, type: 'expense' },
    ])
    expect(result.vat_out).toBe(220)    // 1000 × 22%
    expect(result.vat_in).toBe(1100)    // 5000 × 22%
    expect(result.vat_due).toBe(-880)   // FURS nam vrne
    expect(result.refund).toBe(true)
  })

  it('pravilno obravnava stopnji 22% in 9.5%', () => {
    const result = calculateVAT([
      { amount_net: 1000, vat_rate: 22,  type: 'income' },
      { amount_net: 1000, vat_rate: 9.5, type: 'income' },
    ])
    expect(result.vat_out_22).toBe(220)
    expect(result.vat_out_95).toBe(95)
    expect(result.vat_out).toBe(315)
  })
})

describe('addVAT / removeVAT', () => {
  it('pravilno doda DDV 22%', () => {
    const r = addVAT(100, 22)
    expect(r.net).toBe(100)
    expect(r.vat).toBe(22)
    expect(r.total).toBe(122)
  })

  it('pravilno odšteje DDV 22%', () => {
    const r = removeVAT(122, 22)
    expect(r.net).toBeCloseTo(100, 1)
    expect(r.vat).toBeCloseTo(22, 1)
    expect(r.total).toBe(122)
  })

  it('addVAT in removeVAT sta inverzni operaciji', () => {
    const net = 547.83
    const added = addVAT(net, 22)
    const removed = removeVAT(added.total, 22)
    expect(removed.net).toBeCloseTo(net, 1)
  })
})
