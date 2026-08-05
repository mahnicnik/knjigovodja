/**
 * ═══════════════════════════════════════════════════════════════════════
 *  DAVČNE KONSTANTE — SLOVENIJA
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  ⚠️  TO DATOTEKO JE TREBA POSODOBITI VSAK JANUAR  ⚠️
 *
 *  Zakaj obstaja: pred 30.7.2026 so bile te vrednosti trdo zapisane na
 *  ~10 različnih mestih v kodi. Ob auditu se je izkazalo, da so bile
 *  skoraj vse zastarele — dohodninska lestvica na petih mestih (v treh
 *  različicah!), minimalna plača dve leti stara, regres z napačno
 *  metodologijo, kilometrina prepolovljena.
 *
 *  Odslej se spreminja SAMO ta datoteka.
 *
 * ───────────────────────────────────────────────────────────────────────
 *  KONTROLNI SEZNAM ZA JANUAR (kaj preveriti in kje):
 * ───────────────────────────────────────────────────────────────────────
 *   1. Dohodninska lestvica + splošna olajšava → FURS, Dohodnina
 *   2. Minimalna plača → Uradni list (objava decembra/januarja)
 *   3. Minimalni prispevki s.p. → FURS (uskladitev marca!)
 *   4. Povprečna bruto plača → SURS (vpliva na regres in prispevke)
 *   5. Kilometrina, dnevnice, malica → Uredba o povračilih stroškov
 *   6. Pragovi (DDV, normiranci) → ob spremembah zakonodaje
 *
 *  Zadnja posodobitev: 30.7.2026
 * ═══════════════════════════════════════════════════════════════════════
 */

/** Leto, za katero veljajo spodnje vrednosti. */
export const TAX_YEAR = 2026

// ───────────────────────── DOHODNINA ─────────────────────────

/**
 * Dohodninska lestvica — LETNE meje.
 * Vir: FURS, preverjeno 26.7.2026.
 * Za mesečni izračun deli meje z 12.
 */
export const INCOME_TAX_BRACKETS = [
  { upTo: 9721.43, rate: 0.16 },
  { upTo: 28592.44, rate: 0.26 },
  { upTo: 57184.88, rate: 0.33 },
  { upTo: 82346.23, rate: 0.39 },
  { upTo: Infinity, rate: 0.50 },
] as const

/** Splošna olajšava — LETNA (mesečno = /12 = 462,66 €). */
export const GENERAL_RELIEF_YEAR = 5551.93
export const GENERAL_RELIEF_MONTH = 462.66

/**
 * ⚠️ NEPREVERJENO: povečana (dodatna) splošna olajšava za nizke dohodke.
 * Velja pri letnem dohodku pod ~17.766 €, po formuli iz ZDoh-2.
 * NI avtomatizirana, ker je odvisna od REALIZIRANEGA letnega dohodka,
 * ki ga mesečni izračun ne pozna. Računovodja to pravilno upošteva.
 */

// ───────────────────────── PLAČE ─────────────────────────

/** Minimalna plača (bruto). Vir: Uradni list RS 6/2026, velja od 1.1.2026. */
export const MIN_WAGE = 1481.88

/** Prispevki zaposlenca (delež bruto plače). */
export const EMPLOYEE_CONTRIBUTIONS = {
  piz: 0.1550,
  zzzs: 0.0636,
  unemployment: 0.0014,
  parental: 0.0010,
  longTermCare: 0.0100,  // uveden 1.7.2025
} as const

/** Prispevki delodajalca (delež bruto plače). */
export const EMPLOYER_CONTRIBUTIONS = {
  piz: 0.0885,
  zzzs: 0.0656,
  injury: 0.0053,        // poškodbe pri delu — plača SAMO delodajalec
  unemployment: 0.0014,
  parental: 0.0010,
  longTermCare: 0.0100,
} as const

/** Obvezni zdravstveni prispevek — FIKSEN mesečni znesek (ne odstotek). */
export const MANDATORY_HEALTH_CONTRIBUTION = 39.36

// ───────────────────────── REGRES ─────────────────────────

/** Minimalni regres = minimalna plača (ZDR-1). */
export const MIN_REGRES = MIN_WAGE

/**
 * ⚠️ GIBLJIVA VREDNOST — preveri pred VSAKIM izplačilom!
 *
 * Neobdavčena meja regresa = 100% POVPREČNE mesečne bruto plače RS
 * (NE minimalne — ta metodologija je bila v kodi napačna do 30.7.2026).
 * Uporabi se zadnji znani podatek SURS na dan izplačila, zato se med
 * letom spreminja.
 *
 * Zadnji znani ob zapisu: april 2026 = 2.606,09 €, maj 2026 = 2.678,28 €
 */
export const REGRES_TAX_FREE_LIMIT = 2606.09

// ───────────────────────── PRISPEVKI S.P. ─────────────────────────

/**
 * Minimalni mesečni prispevki s.p. (polni).
 * Osnova: 60% povprečne bruto plače 2025 (2.536,03 €) = 1.521,62 €.
 * ⚠️ Uskladi se MARCA — preveri takrat, ne samo januarja.
 */
export const SP_MIN_CONTRIBUTIONS_MONTH = 651.04
export const SP_MIN_CONTRIBUTIONS_YEAR = 7812.48

/** Maksimalna zavarovalna osnova = 3,5× povprečna plača. */
export const SP_MAX_BASE = 8876.11
export const SP_MAX_CONTRIBUTIONS_MONTH = 3607.57

// ───────────────────────── POVRAČILA STROŠKOV ─────────────────────────

/**
 * Kilometrina — DVE LOČENI stopnji, ki ju zakon strogo razlikuje.
 * Mešanje je ob inšpekciji sankcionirano.
 */
export const KM_RATE_BUSINESS = 0.43   // službena pot (obisk stranke, teren)
export const KM_RATE_COMMUTE = 0.21    // prevoz na delo in z dela

/** Dnevnice Slovenija — po TRAJANJU odsotnosti (pod 6 ur ne pripada). */
export const DAILY_ALLOWANCE_SI = {
  hours6to8: 9.69,
  hours8to12: 13.88,
  over12: 27.81,
} as const

/** Malica — neobdavčena meja. */
export const MEAL_ALLOWANCE = 7.96

/**
 * ⚠️ NEPREVERJENO/POENOSTAVLJENO:
 * - Dnevnica za tujino je ODVISNA OD DRŽAVE (Uredba ima tabelo).
 * - Nočnina se navadno povrne po DEJANSKEM računu, ne pavšalu.
 */
export const DAILY_ALLOWANCE_FOREIGN_AVG = 50.00
export const ACCOMMODATION_MAX = 70.00

// ───────────────────────── ZAMUDNE OBRESTI ─────────────────────────

/**
 * Zakonska zamudna obrestna mera (ZPOMZO-1).
 * ⚠️ SPREMINJA SE DVAKRAT LETNO (1.1. in 1.7.) - drugače kot ostale
 * konstante v tej datoteki, ki se uskladijo enkrat januarja!
 * Objavi minister za finance v Uradnem listu, vsako polletje posebej.
 *
 * Zgodovina 2026:
 *   1.1.–30.6.2026: 10,15 %
 *   1.7.–31.12.2026: 10,40 %  ← trenutno velja
 *
 * Pred uporabo PREVERI aktualno vrednost na Uradnem listu RS.
 */
export const LEGAL_DEFAULT_INTEREST_RATE = 0.1040 // velja od 1.7.2026

// ───────────────────────── DDV ─────────────────────────

export const VAT_RATES = { standard: 22, reduced: 9.5, zero: 0 } as const

/** Prag za obvezno registracijo (obdavčljiv promet v zadnjih 12 mesecih). */
export const VAT_REGISTRATION_THRESHOLD = 60000

// ───────────────────────── NORMIRANCI (ZPZR, od 1.1.2026) ─────────────────────────

/**
 * ⚠️ SISTEM SE JE 1.1.2026 BISTVENO SPREMENIL (zakon ZPZR).
 *
 * Normirani odhodki se priznajo DVOSTOPENJSKO:
 *   - do 60.000 € prihodkov: 80% normiranih odhodkov → efektivno ~4% davka
 *   - nad 60.000 €: normirani odhodki se NE priznajo (0%), ta del gre
 *     CELOTEN v davčno osnovo in se obdavči PROGRESIVNO
 *
 * Zato NI več enotne 4% stopnje.
 */
export const NORMIRANCI = {
  /** Prag za vstop/ostanek — polni s.p. */
  thresholdFull: 120000,
  /** Prag — popoldanski s.p. */
  thresholdSideJob: 50000,
  /** Meja, do katere se prizna 80% normiranih odhodkov. */
  fullDeductionLimit: 60000,
  /** Delež normiranih odhodkov pod mejo. */
  deductionRate: 0.80,
  /** Vsota dveh let, ki povzroči izstop (polni s.p.). */
  twoYearSumLimit: 240000,
} as const

// ───────────────────────── POMOŽNE FUNKCIJE ─────────────────────────

/** Progresivna dohodnina od LETNE davčne osnove. */
export function calcProgressiveTax(annualBase: number): number {
  let tax = 0
  let prev = 0
  for (const b of INCOME_TAX_BRACKETS) {
    if (annualBase <= prev) break
    const upper = b.upTo === Infinity ? annualBase : b.upTo
    const taxableInBracket = Math.min(annualBase, upper) - prev
    tax += taxableInBracket * b.rate
    prev = b.upTo === Infinity ? annualBase : b.upTo
  }
  return Math.round(tax * 100) / 100
}

/**
 * Normirani odhodki po ZPZR (dvostopenjsko).
 * Vrne priznane normirane odhodke za dani letni prihodek.
 */
export function calcNormiraniDeduction(revenue: number): number {
  const underLimit = Math.min(revenue, NORMIRANCI.fullDeductionLimit)
  return Math.round(underLimit * NORMIRANCI.deductionRate * 100) / 100
}
