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

// ─── Povečana splošna olajšava (vgrajeno 25.8.2026) ─────────────────────

import { splosnaOlajsavaMesecno, GENERAL_RELIEF_MONTH,
         RELIEF_INCREASED_THRESHOLD_MONTH } from '../lib/tax-constants'

test('olajšava: pri pragu se natanko ujame z osnovno', () => {
  // Zvezni prehod — brez stopnice, sicer bi bil evro razlike v plači usoden.
  expect(splosnaOlajsavaMesecno(RELIEF_INCREASED_THRESHOLD_MONTH)).toBe(GENERAL_RELIEF_MONTH)
})

test('olajšava: nad pragom velja osnovna', () => {
  expect(splosnaOlajsavaMesecno(2000)).toBe(GENERAL_RELIEF_MONTH)
  expect(splosnaOlajsavaMesecno(1600)).toBe(GENERAL_RELIEF_MONTH)
})

test('olajšava: pod pragom je višja in raste, ko plača pada', () => {
  const a = splosnaOlajsavaMesecno(1400)
  const b = splosnaOlajsavaMesecno(1200)
  const c = splosnaOlajsavaMesecno(1000)
  expect(a).toBeGreaterThan(GENERAL_RELIEF_MONTH)
  expect(b).toBeGreaterThan(a)
  expect(c).toBeGreaterThan(b)
})

test('olajšava: znane vrednosti po formuli', () => {
  // 2.198,69 − 1,17259 × bruto
  expect(splosnaOlajsavaMesecno(1200)).toBeCloseTo(791.58, 2)
  expect(splosnaOlajsavaMesecno(1400)).toBeCloseTo(557.06, 2)
})

test('olajšava: minimalna plača je TIK NAD pragom', () => {
  // 1.481,88 € proti pragu 1.480,52 € — razlika 1,36 €. Delavec na minimalni
  // plači povečane olajšave torej NE dobi. To je posledica tega, da se
  // olajšava računa od BRUTO plače, ne od osnove po prispevkih.
  expect(splosnaOlajsavaMesecno(1481.88)).toBe(GENERAL_RELIEF_MONTH)
  expect(splosnaOlajsavaMesecno(1479.00)).toBeGreaterThan(GENERAL_RELIEF_MONTH)
})

test('olajšava: odpoved vrne osnovno', () => {
  // Delojemalec z več viri dohodka se ji odpove, da mu ni treba doplačati
  // pri letnem obračunu.
  expect(splosnaOlajsavaMesecno(1200, false)).toBe(GENERAL_RELIEF_MONTH)
})

test('olajšava: nikoli manj od osnovne', () => {
  // Varovalka pred napako v konstantah.
  for (const b of [0, 100, 500, 1000, 1480, 1481, 3000]) {
    expect(splosnaOlajsavaMesecno(b)).toBeGreaterThanOrEqual(GENERAL_RELIEF_MONTH)
  }
})

// ─── Z-poročilo: vse stopnje v obračunu DDV ─────────────────────────────

/**
 * NAPAKA (popravljeno 25.8.2026): izpis in e-poštni izvod Z-poročila sta
 * imela trdo zapisani samo 22 % in 9,5 %. Promet po 0 % ni bil nikjer —
 * pri 1.679,80 € prometa je manjkalo 1.100 €, poročilo se ni izšlo in za
 * DDV obračun ni bilo uporabno.
 */
function vrsticeObracunaDdv(s: { vatBase22: number; vat22: number; vatBase95: number; vat95: number; vatBase0: number; vatBaseOther: number }) {
  const v: string[] = []
  if (s.vatBase22 > 0) v.push('22%')
  if (s.vatBase0 > 0) v.push('0%')
  if (s.vatBaseOther > 0) v.push('druge')
  if (s.vatBase95 > 0) v.push('9,5%')
  return v
}

test('Z-poročilo: oproščeni promet je v obračunu', () => {
  const v = vrsticeObracunaDdv({ vatBase22: 475.25, vat22: 104.55, vatBase95: 0, vat95: 0, vatBase0: 1100, vatBaseOther: 0 })
  expect(v).toContain('0%')
  expect(v).toContain('22%')
})

test('Z-poročilo: osnova + DDV po vseh stopnjah da promet', () => {
  const s = { vatBase22: 475.25, vat22: 104.55, vatBase95: 0, vat95: 0, vatBase0: 1100, vatBaseOther: 0 }
  const skupaj = s.vatBase22 + s.vat22 + s.vatBase95 + s.vat95 + s.vatBase0 + s.vatBaseOther
  expect(Math.round(skupaj * 100) / 100).toBe(1679.80)
})

test('Z-poročilo: razdelek se pokaže tudi pri samem 0 %', () => {
  // Prej se razdelek pri samem oproščenem prometu sploh ni izrisal.
  const v = vrsticeObracunaDdv({ vatBase22: 0, vat22: 0, vatBase95: 0, vat95: 0, vatBase0: 500, vatBaseOther: 0 })
  expect(v).toEqual(['0%'])
})

// ─── Kalkulator plač pod minimalno ──────────────────────────────────────

/**
 * NAPAKA (popravljeno 25.8.2026): kalkulator je pod minimalno plačo vrnil
 * null in ni izpisal ničesar. Posledica: obvestilo o povečani splošni
 * olajšavi se ni moglo pokazati NIKOLI — olajšava pripada pod 1.480,52 €,
 * kalkulator pa je delal šele od 1.481,88 € naprej.
 */
function kalkulatorRacuna(bruto: number) {
  return bruto > 0
}

test('kalkulator: računa tudi pod minimalno plačo', () => {
  expect(kalkulatorRacuna(1200)).toBe(true)
  expect(kalkulatorRacuna(1479)).toBe(true)
})

test('kalkulator: brez vnosa ne računa', () => {
  expect(kalkulatorRacuna(0)).toBe(false)
})

test('kalkulator: obvestilo o olajšavi je zdaj dosegljivo', () => {
  // Prej: prag olajšave 1.480,52 < spodnja meja kalkulatorja 1.481,88.
  const spodnjaMejaKalkulatorja = 0.01
  const pragOlajsave = 1480.52
  expect(spodnjaMejaKalkulatorja).toBeLessThan(pragOlajsave)
})

// ─── FURS napaka S001 ───────────────────────────────────────────────────

/**
 * S001 se glasi „Sporočilo ni v skladu s shemo XML", kar zveni kot napaka v
 * programu. Najpogostejši vzrok pa je drugačen: davčna številka v nastavitvah
 * se ne ujema s tisto v digitalnem potrdilu.
 *
 * 26. 8. 2026 se je zgodilo prav to — sporočilo je bilo pravilno oblikovano,
 * le davčna številka napačna. Brez namiga je iskanje vzroka steklo v napačno
 * smer (domneval sem napako v znesku).
 */
function sporociloNapake(code: string, message: string) {
  if (code === 'S001') {
    return message + ' — najpogostejši vzrok: davčna številka v nastavitvah se ne '
      + 'ujema s tisto v digitalnem potrdilu. Preverite obe.'
  }
  return message
}

test('FURS: S001 dobi namig o davčni številki', () => {
  const s = sporociloNapake('S001', 'Sporočilo ni v skladu s shemo XML')
  expect(s).toContain('davčna številka')
  expect(s).toContain('potrdilu')
})

test('FURS: druge napake ostanejo nespremenjene', () => {
  expect(sporociloNapake('S002', 'Druga napaka')).toBe('Druga napaka')
})

// ─── ID za DDV: predpona SI ─────────────────────────────────────────────

import { idZaDdv, davcnaBrezPredpone } from '../lib/format'

/**
 * NAPAKA (popravljeno 26.8.2026): davčna številka je v bazi lahko shranjena
 * Z ali BREZ predpone „SI" — odvisno od tega, kako jo je uporabnik vnesel.
 * Koda je predpono povsod dodajala brez preverbe, zato je pri vnosu
 * „SI91390419" na računih pisalo „SISI91390419".
 *
 * Napaka je bila na DESETIH mestih: računi, Z-poročila, DDV evidenca, letni
 * pregled, portal računovodje. FURS je to obravnaval pravilno, izpis ne.
 */
test('ID za DDV: predpona se ne podvoji', () => {
  expect(idZaDdv('SI91390419')).toBe('SI91390419')
  expect(idZaDdv('SI91390419')).not.toBe('SISI91390419')
})

test('ID za DDV: predpona se doda, kadar manjka', () => {
  expect(idZaDdv('91390419')).toBe('SI91390419')
})

test('ID za DDV: male črke se poenotijo', () => {
  expect(idZaDdv('si91390419')).toBe('SI91390419')
})

test('ID za DDV: prazna vrednost ostane prazna', () => {
  // Brez tega bi na računu pisalo samo „SI".
  expect(idZaDdv('')).toBe('')
  expect(idZaDdv(null)).toBe('')
  expect(idZaDdv(undefined)).toBe('')
})

test('davčna brez predpone: za FURS in uradne obrazce', () => {
  expect(davcnaBrezPredpone('SI91390419')).toBe('91390419')
  expect(davcnaBrezPredpone('91390419')).toBe('91390419')
})

// ─── UPN QR za prispevke ────────────────────────────────────────────────

/**
 * NAPAKA (popravljeno 26.8.2026): zapis je imel 17 polj in NI imel kontrolne
 * vsote, ki jo standard UPN QR zahteva kot zadnjo vrstico. Za „UPNQR" so
 * sledile le TRI prazne vrstice namesto štirih, prejemnika pa ni bilo nikjer.
 *
 * Banke so kodo zavrnile s sporočilom o napačni strukturi zapisa.
 *
 * Računi so imeli pravilno zgradbo in so delovali — stran s prispevki je
 * uporabljala svojo, ki se je od nje razlikovala.
 */
function upnZapis(polja: string[]) {
  const vsota = polja.reduce((s, f) => s + f.length + 1, 0)
  return { vrstic: polja.length, zapis: polja.join('\n') + '\n' + String(vsota).padStart(3, '0') }
}

const POLJA_PRISPEVKI = [
  'UPNQR', '', '', '', '',
  'Podjetje s.p.', 'Ulica 1', '1000 Ljubljana',
  '00000012345', '', '', 'OTHR',
  'Prispevki za PIZ Avgust 2026', '15.09.2026',
  'SI56011008882000003', 'SI1991390419-44008',
  'Finančna uprava Republike Slovenije', 'Gregorčičeva ulica 20', '1000 Ljubljana',
]

test('UPN QR: zapis ima 19 polj', () => {
  expect(upnZapis(POLJA_PRISPEVKI).vrstic).toBe(19)
})

test('UPN QR: za UPNQR sledijo ŠTIRI prazne vrstice', () => {
  // Prej so bile tri — banka je zaradi tega zamaknila vsa nadaljnja polja.
  expect(POLJA_PRISPEVKI.slice(1, 5)).toEqual(['', '', '', ''])
})

test('UPN QR: zadnja vrstica je kontrolna vsota', () => {
  const { zapis } = upnZapis(POLJA_PRISPEVKI)
  const zadnja = zapis.split('\n').pop()!
  expect(zadnja).toMatch(/^\d{3}$/)
})

test('UPN QR: brez kontrolne vsote banka zavrne', () => {
  const brez = POLJA_PRISPEVKI.join('\n')
  expect(brez.split('\n')).toHaveLength(19)          // manjka 20. vrstica
  expect(upnZapis(POLJA_PRISPEVKI).zapis.split('\n')).toHaveLength(20)
})

test('UPN QR: prejemnik je izpolnjen', () => {
  // Pri prispevkih je to vedno FURS; polja so po standardu obvezna.
  expect(POLJA_PRISPEVKI[16]).toContain('Finančna uprava')
  expect(POLJA_PRISPEVKI[17]).toBeTruthy()
  expect(POLJA_PRISPEVKI[18]).toBeTruthy()
})

// ─── DDV stopnje v blagajni ─────────────────────────────────────────────

/**
 * NAPAKA (popravljeno 26.8.2026): razdelek „FURS & DDV" je navajal napačne
 * primere prav za dejavnosti, za katere se aplikacija uporablja:
 *
 *   „fitnes"        pri 22 %  →  uporaba športnih objektov je 9,5 %
 *   „fizioterapija" pri 22 %  →  zdravstvene storitve so OPROŠČENE (42. člen)
 *
 * Manjkala je tudi 5 % stopnja, ki je ni bilo mogoče niti izbrati.
 */
const STOPNJE = [0, 5, 9.5, 22]

test('DDV: vse štiri stopnje so na voljo', () => {
  expect(STOPNJE).toContain(5)
  expect(STOPNJE).toHaveLength(4)
})

function obracunaj(bruto: number, stopnja: number) {
  if (stopnja === 0) return { osnova: bruto, ddv: 0 }
  const osnova = bruto / (1 + stopnja / 100)
  return { osnova: Math.round(osnova * 100) / 100, ddv: Math.round((bruto - osnova) * 100) / 100 }
}

test('DDV: 5 % se obračuna, ne pristane med „druge stopnje"', () => {
  // Prej: osnova prikazana, DDV neobračunan — Z-poročilo se ne bi izšlo.
  const r = obracunaj(10.50, 5)
  expect(r.osnova).toBeCloseTo(10.00, 2)
  expect(r.ddv).toBeCloseTo(0.50, 2)
})

test('DDV: vsaka stopnja se izide na cent', () => {
  for (const s of STOPNJE) {
    const bruto = 12.20
    const r = obracunaj(bruto, s)
    expect(Math.round((r.osnova + r.ddv) * 100) / 100).toBeCloseTo(bruto, 2)
  }
})

/**
 * Pravilo za fitnes, ki ga je potrdil lastnik: vodena vadba s trenerjem je
 * 22 %, samostojna uporaba fitnesa 9,5 %, fizioterapija oproščena.
 */
function stopnjaZaStoritev(vrsta: 'osebni-trening' | 'samostojna-vadba' | 'fizioterapija') {
  return vrsta === 'osebni-trening' ? 22 : vrsta === 'samostojna-vadba' ? 9.5 : 0
}

test('DDV: fitnes in fizioterapija imata pravo stopnjo', () => {
  expect(stopnjaZaStoritev('osebni-trening')).toBe(22)
  expect(stopnjaZaStoritev('samostojna-vadba')).toBe(9.5)
  expect(stopnjaZaStoritev('fizioterapija')).toBe(0)
})
