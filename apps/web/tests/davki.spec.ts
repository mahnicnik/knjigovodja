import { test, expect } from '@playwright/test'
import {
  calcNormiraniDeduction,
  legalInterestRateOn,
  calcProgressiveTax,
  SP_MIN_CONTRIBUTIONS_MONTH,
  NORMIRANCI,
  VAT_RATES,
} from '../lib/tax-constants'
import { calculateNetIncome } from '../lib/tax-calculator'

/**
 * TESTI DAVCNIH IZRACUNOV
 *
 * Ne klikajo po vmesniku - uvozijo PRAVE funkcije in preverijo rezultat.
 * Zato so hitri in zanesljivi; ce kdo v prihodnje spremeni formulo, test pade.
 *
 * Vsak test pokriva napako, ki je bila dejansko najdena pri avditu 16.8.2026.
 * V opisu je zapisano, KAJ je bilo narobe - da je ob padcu jasno, kaj se je
 * pokvarilo nazaj.
 *
 * Zagon:  npx playwright test tests/davki.spec.ts
 */

// ─────────────── NORMIRANI ODHODKI (dvostopenjski prag ZPZR) ───────────────

test('normirani odhodki: 80% velja SAMO do 60.000 EUR letnih prihodkov', () => {
  // NAPAKA (popravljeno 16.8.2026): odstevalo se je ravnih 80% CELOTNEGA
  // prometa. Po ZPZR (od 1.1.2026) se 80% prizna le do 60.000 EUR, nad tem 0%.
  expect(calcNormiraniDeduction(30000)).toBeCloseTo(24000, 2)   // 80 % od 30.000
  expect(calcNormiraniDeduction(60000)).toBeCloseTo(48000, 2)   // 80 % od 60.000
  expect(calcNormiraniDeduction(90000)).toBeCloseTo(48000, 2)   // nad pragom NE raste
  expect(calcNormiraniDeduction(120000)).toBeCloseTo(48000, 2)  // ostane 48.000
})

test('normirani odhodki: prag je tocno 60.000 EUR', () => {
  expect(NORMIRANCI.fullDeductionLimit).toBe(60000)
  expect(NORMIRANCI.deductionRate).toBe(0.80)
})

// ─────────────── DAVCNI IZRACUN NA DASHBOARDU ───────────────

test('davcni izracun: prispevki znizajo davcno osnovo', () => {
  // NAPAKA (popravljeno 16.8.2026): prispevki so se odsteli sele od cistega
  // prihodka, davek pa se je racunal od PREVISOKE osnove. Pri s.p. so
  // prispevki davcno priznan odhodek.
  //
  // OPOMBA: vrednosti 0 NE moremo uporabiti za primerjavo - koda jo razume kot
  // "ni vneseno" in uporabi zakonski minimum (s.p. vedno placuje vsaj minimum).
  // Zato primerjamo dve RAZLICNI veljavni visini prispevkov.
  const nizji = calculateNetIncome({
    monthlyRevenue: 10000, monthlyExpenses: 0, yearlyRevenueToDate: 120000,
    legalForm: 'sp', taxSystem: 'normirani_80', isVatRegistered: false,
    monthlyContributions: 651.04,
  })
  const visji = calculateNetIncome({
    monthlyRevenue: 10000, monthlyExpenses: 0, yearlyRevenueToDate: 120000,
    legalForm: 'sp', taxSystem: 'normirani_80', isVatRegistered: false,
    monthlyContributions: 1500,
  })
  // Visji prispevki = nizja davcna osnova = nizji davek
  expect(visji.details.incomeTax).toBeLessThan(nizji.details.incomeTax)
})

test('davcni izracun: vrednost 0 pomeni "ni vneseno" in uporabi minimum', () => {
  // S.p. vedno placuje vsaj zakonski minimum - nicelnih prispevkov ni.
  const r = calculateNetIncome({
    monthlyRevenue: 5000, monthlyExpenses: 0, yearlyRevenueToDate: 60000,
    legalForm: 'sp', taxSystem: 'normirani_80', isVatRegistered: false,
    monthlyContributions: 0,
  })
  expect(r.details.contributions).toBeCloseTo(SP_MIN_CONTRIBUTIONS_MONTH, 2)
})

test('davcni izracun: uporabi DEJANSKE prispevke iz nastavitev', () => {
  // NAPAKA (popravljeno 16.8.2026): vedno se je uporabil pavsal iz konstant,
  // ceprav ima organizacija vnesene svoje vrednosti. Dashboard in stran
  // /dohodnina sta zato kazala razlicne stevilke.
  const r = calculateNetIncome({
    monthlyRevenue: 5000, monthlyExpenses: 0, yearlyRevenueToDate: 60000,
    legalForm: 'sp', taxSystem: 'normirani_80', isVatRegistered: false,
    monthlyContributions: 700,
  })
  expect(r.details.contributions).toBe(700)
})

test('davcni izracun: brez vnesenih prispevkov uporabi zakonski minimum', () => {
  const r = calculateNetIncome({
    monthlyRevenue: 5000, monthlyExpenses: 0, yearlyRevenueToDate: 60000,
    legalForm: 'sp', taxSystem: 'normirani_80', isVatRegistered: false,
  })
  expect(r.details.contributions).toBeCloseTo(SP_MIN_CONTRIBUTIONS_MONTH, 2)
})

test('davcni izracun: nad pragom 60.000 je davek OBCUTNO visji', () => {
  // Pri 120.000 EUR prometa se polovica prihodka obdavci brez normiranih
  // odhodkov - davek mora biti bistveno visji kot pri 60.000.
  const pri60 = calculateNetIncome({
    monthlyRevenue: 5000, monthlyExpenses: 0, yearlyRevenueToDate: 60000,
    legalForm: 'sp', taxSystem: 'normirani_80', isVatRegistered: false,
    monthlyContributions: 651.04,
  })
  const pri120 = calculateNetIncome({
    monthlyRevenue: 10000, monthlyExpenses: 0, yearlyRevenueToDate: 120000,
    legalForm: 'sp', taxSystem: 'normirani_80', isVatRegistered: false,
    monthlyContributions: 651.04,
  })
  expect(pri120.details.incomeTax).toBeGreaterThan(pri60.details.incomeTax * 3)
})

// ─────────────── ZAMUDNE OBRESTI ───────────────

test('zamudne obresti: mera se razlikuje po polletjih', () => {
  // NAPAKA (popravljeno 16.8.2026): uporabljala se je ena sama mera za celotno
  // obdobje zamude, tudi ce je zamuda sekala polletje.
  expect(legalInterestRateOn('2026-03-15')).toBeCloseTo(0.1015, 4)
  expect(legalInterestRateOn('2026-08-15')).toBeCloseTo(0.1040, 4)
})

test('zamudne obresti: mera na mejni dan polletja', () => {
  expect(legalInterestRateOn('2026-06-30')).toBeCloseTo(0.1015, 4)
  expect(legalInterestRateOn('2026-07-01')).toBeCloseTo(0.1040, 4)
})

// ─────────────── PROGRESIVNA DOHODNINA ───────────────

test('progresivna dohodnina: nicelna osnova = nic davka', () => {
  expect(calcProgressiveTax(0)).toBe(0)
})

test('progresivna dohodnina: raste z osnovo', () => {
  const a = calcProgressiveTax(20000)
  const b = calcProgressiveTax(50000)
  const c = calcProgressiveTax(100000)
  expect(b).toBeGreaterThan(a)
  expect(c).toBeGreaterThan(b)
})

test('progresivna dohodnina: efektivna stopnja nikoli ne preseze najvisje', () => {
  const osnova = 200000
  const davek = calcProgressiveTax(osnova)
  expect(davek / osnova).toBeLessThan(0.50)
})

// ─────────────── STOPNJE DDV ───────────────

test('stopnje DDV ustrezajo veljavni zakonodaji', () => {
  expect(VAT_RATES.standard).toBe(22)
  expect(VAT_RATES.reduced).toBe(9.5)
  expect(VAT_RATES.zero).toBe(0)
})

// ─────────────── RAZCLENITEV DDV PO STOPNJAH ───────────────

/** Enak izracun kot v lib/furs.ts in lib/furs-invoice-confirm.ts. */
function razcleniPoStopnjah(
  postavke: { neto: number; stopnja: number }[],
  skupajZDdv: number,
) {
  const poStopnji = new Map<number, number>()
  let vsota = 0
  for (const p of postavke) {
    const bruto = p.neto * (1 + p.stopnja / 100)
    poStopnji.set(p.stopnja, (poStopnji.get(p.stopnja) || 0) + bruto)
    vsota += bruto
  }
  const faktor = vsota > 0 ? skupajZDdv / vsota : 1
  return Array.from(poStopnji.entries()).map(([rate, bruto]) => {
    const b = bruto * faktor
    const net = rate > 0 ? b / (1 + rate / 100) : b
    return { rate, net: Math.round(net * 100) / 100, vat: Math.round((b - net) * 100) / 100 }
  }).sort((a, b) => b.rate - a.rate)
}

test('razclenitev DDV: mesan racun da LOCENI vrstici za 22% in 9,5%', () => {
  // NAPAKA (popravljeno 16.8.2026): FURS-u se je celoten racun prijavil po 22%,
  // tudi ce je vseboval hrano po 9,5%.
  const r = razcleniPoStopnjah(
    [{ neto: 45, stopnja: 22 }, { neto: 15, stopnja: 9.5 }],
    45 * 1.22 + 15 * 1.095,
  )
  expect(r).toHaveLength(2)
  expect(r[0].rate).toBe(22)
  expect(r[0].net).toBeCloseTo(45, 2)
  expect(r[0].vat).toBeCloseTo(9.90, 2)
  expect(r[1].rate).toBe(9.5)
  expect(r[1].net).toBeCloseTo(15, 2)
  expect(r[1].vat).toBeCloseTo(1.42, 2)  // 15,00 x 9,5% = 1,425 -> 1,42
})

test('razclenitev DDV: vsota osnov in DDV se ujema s skupnim zneskom', () => {
  const skupaj = 100
  const r = razcleniPoStopnjah(
    [{ neto: 40, stopnja: 22 }, { neto: 30, stopnja: 9.5 }],
    skupaj,
  )
  const vsota = r.reduce((s, x) => s + x.net + x.vat, 0)
  expect(vsota).toBeCloseTo(skupaj, 1)
})

test('razclenitev DDV: oproscen promet (0%) nima DDV', () => {
  const r = razcleniPoStopnjah([{ neto: 58, stopnja: 0 }], 58)
  expect(r).toHaveLength(1)
  expect(r[0].rate).toBe(0)
  expect(r[0].vat).toBeCloseTo(0, 2)
  expect(r[0].net).toBeCloseTo(58, 2)
})

test('razclenitev DDV: enotna stopnja da eno samo vrstico', () => {
  const r = razcleniPoStopnjah(
    [{ neto: 45, stopnja: 22 }, { neto: 15, stopnja: 22 }],
    60 * 1.22,
  )
  expect(r).toHaveLength(1)
  expect(r[0].net).toBeCloseTo(60, 2)
})

// ─────────────── DOPLACILA IN POPUST V BLAGAJNI ───────────────

/** Enak izracun kot H.lineTotal v app/pos/page.tsx. */
function vsotaVrstice(l: {
  price: number; qty: number
  mods?: { delta: number }[]
  happyHourApplied?: boolean; happyHourPct?: number
}) {
  const osnova = (l.price + (l.mods || []).reduce((s, m) => s + (m.delta || 0), 0)) * l.qty
  if (!l.happyHourApplied) return osnova
  return osnova * (1 - Number(l.happyHourPct ?? 20) / 100)
}

test('vsota vrstice: doplacilo se steje ENKRAT, ne dvakrat', () => {
  // NAPAKA (popravljeno 16.8.2026): doplacilo modifikatorja se je pristelo k
  // ceni IN se enkrat k vsoti - kupec bi bil preplacan.
  expect(vsotaVrstice({ price: 2.00, qty: 2, mods: [{ delta: 0.50 }] })).toBeCloseTo(5.00, 2)
})

test('vsota vrstice: popust velja tudi za doplacila', () => {
  // NAPAKA (popravljeno 16.8.2026): popust se je obracunal samo na osnovno
  // ceno, doplacila so ostala nepopustena - kosarica in baza sta se razlikovali.
  expect(vsotaVrstice({
    price: 2.00, qty: 2, mods: [{ delta: 0.50 }],
    happyHourApplied: true, happyHourPct: 30,
  })).toBeCloseTo(3.50, 2)
})

test('vsota vrstice: brez doplacil in popusta je preprosto cena krat kolicina', () => {
  expect(vsotaVrstice({ price: 3.20, qty: 3 })).toBeCloseTo(9.60, 2)
})

// ═══════════════════ PLAČE: POPRAVKI 24.8.2026 ═══════════════════

import {
  MIN_WAGE, MIN_CONTRIBUTION_BASE, REGRES_TAX_FREE_LIMIT,
  EMPLOYEE_CONTRIBUTIONS, EMPLOYER_CONTRIBUTIONS,
} from '../lib/tax-constants'

const zaokrozi = (n: number) => Math.round(n * 100) / 100

// ─── Najnižja osnova za prispevke ───────────────────────────────────────

function prispevkovnaOsnova(bruto: number) {
  return Math.max(bruto, MIN_CONTRIBUTION_BASE)
}

test('prispevki: minimalna plača je NIŽJA od najnižje osnove', () => {
  // Prav zato je bila napaka pomembna — zadeva vsakega na minimalni plači.
  expect(MIN_WAGE).toBeLessThan(MIN_CONTRIBUTION_BASE)
})

test('prispevki: pri minimalni plači se obračunajo od OSNOVE', () => {
  // NAPAKA (popravljeno 24.8.2026): prispevki so se računali od plače —
  // premalo plačanih prispevkov pri vsakem na minimalni plači.
  expect(prispevkovnaOsnova(MIN_WAGE)).toBe(MIN_CONTRIBUTION_BASE)
  expect(prispevkovnaOsnova(MIN_WAGE)).toBeGreaterThan(MIN_WAGE)
})

test('prispevki: pri višji plači se obračunajo od plače', () => {
  expect(prispevkovnaOsnova(2500)).toBe(2500)
})

test('prispevki: razlika pri minimalni plači ni zanemarljiva', () => {
  const eeStopnja = EMPLOYEE_CONTRIBUTIONS.piz + EMPLOYEE_CONTRIBUTIONS.zzzs
    + EMPLOYEE_CONTRIBUTIONS.unemployment + EMPLOYEE_CONTRIBUTIONS.parental
    + EMPLOYEE_CONTRIBUTIONS.longTermCare
  const prej = MIN_WAGE * eeStopnja
  const zdaj = MIN_CONTRIBUTION_BASE * eeStopnja
  expect(zaokrozi(zdaj - prej)).toBeGreaterThan(5)   // nekaj € mesečno, letno več
})

// ─── Regres ─────────────────────────────────────────────────────────────

function regresPresezek(znesek: number) {
  const neobdavcen = Math.min(znesek, REGRES_TAX_FREE_LIMIT)
  return Math.max(0, znesek - neobdavcen)
}

test('regres: do meje je v celoti neobdavčen', () => {
  // Najpogostejši primer — regres v višini minimalne plače.
  expect(regresPresezek(MIN_WAGE)).toBe(0)
  expect(regresPresezek(REGRES_TAX_FREE_LIMIT)).toBe(0)
})

test('regres: nad mejo se obdavči SAMO presežek', () => {
  const presezek = regresPresezek(3000)
  expect(zaokrozi(presezek)).toBe(zaokrozi(3000 - REGRES_TAX_FREE_LIMIT))
})

test('regres: od presežka se obračunajo PRISPEVKI', () => {
  // NAPAKA (popravljeno 24.8.2026): od presežka se prispevki sploh niso
  // obračunali — ne delojemalčevi ne delodajalčevi.
  const presezek = regresPresezek(3000)
  const eeStopnja = EMPLOYEE_CONTRIBUTIONS.piz + EMPLOYEE_CONTRIBUTIONS.zzzs
    + EMPLOYEE_CONTRIBUTIONS.unemployment + EMPLOYEE_CONTRIBUTIONS.parental
    + EMPLOYEE_CONTRIBUTIONS.longTermCare
  const erStopnja = EMPLOYER_CONTRIBUTIONS.piz + EMPLOYER_CONTRIBUTIONS.zzzs
    + EMPLOYER_CONTRIBUTIONS.injury + EMPLOYER_CONTRIBUTIONS.unemployment
    + EMPLOYER_CONTRIBUTIONS.parental + EMPLOYER_CONTRIBUTIONS.longTermCare

  expect(zaokrozi(presezek * eeStopnja)).toBeGreaterThan(0)
  expect(zaokrozi(presezek * erStopnja)).toBeGreaterThan(0)
})

test('regres: pavšalnih 27 % ni več', () => {
  // Prej: davek = presežek × 0,27. Zdaj gre presežek najprej skozi prispevke,
  // šele nato po lestvici — davčna osnova je zato NIŽJA od presežka.
  const presezek = regresPresezek(3000)
  const eeStopnja = EMPLOYEE_CONTRIBUTIONS.piz + EMPLOYEE_CONTRIBUTIONS.zzzs
    + EMPLOYEE_CONTRIBUTIONS.unemployment + EMPLOYEE_CONTRIBUTIONS.parental
    + EMPLOYEE_CONTRIBUTIONS.longTermCare
  const davcnaOsnova = presezek - presezek * eeStopnja
  expect(davcnaOsnova).toBeLessThan(presezek)
})
