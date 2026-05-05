// ============================================================
// DAVČNE KONSTANTE SLOVENIJA 2026
// Ko FURS objavi nove stopnje (vsako leto januar),
// posodobite SAMO to datoteko — vse ostalo se posodobi samo.
// ============================================================

export const TAX_YEAR = 2026

// DOHODNINSKA LESTVICA 2026
export const INCOME_TAX_BRACKETS = [
  { upTo: 8755.00,   rate: 0.16 },
  { upTo: 18488.00,  rate: 0.26 },
  { upTo: 70907.00,  rate: 0.33 },
  { upTo: 250000.00, rate: 0.39 },
  { upTo: Infinity,  rate: 0.50 },
]

// SPLOŠNA DOHODNINSKA OLAJŠAVA 2026
export const GENERAL_RELIEF_ANNUAL = 5000.00  // letna splošna olajšava

// OLAJŠAVE ZA VZDRŽEVANE OTROKE (letno)
export const DEPENDENT_RELIEF = {
  1: 2697.00,   // 1. otrok
  2: 4120.00,   // 2. otrok (kumulativno za 2)
  3: 7780.00,   // 3. otrok (kumulativno za 3)
}

// PRISPEVKI DELOJEMALCA (odbitki od bruto)
export const EE_CONTRIBUTIONS = {
  piz:          0.1550,  // Pokojninsko zavarovanje
  zzzs:         0.0636,  // Zdravstveno zavarovanje
  injury:       0.0014,  // Zavarovanje za poškodbe pri delu
  unemployment: 0.0014,  // Zavarovanje za brezposelnost
}

// PRISPEVKI DELODAJALCA (strošek poleg bruto)
export const ER_CONTRIBUTIONS = {
  piz:          0.0885,  // Pokojninsko zavarovanje
  zzzs:         0.0656,  // Zdravstveno zavarovanje
  injury:       0.0053,  // Zavarovanje za poškodbe
  unemployment: 0.0014,  // Zavarovanje za brezposelnost
  parental:     0.0010,  // Starševsko varstvo
}

// MINIMALNA PLAČA 2026
export const MIN_WAGE = 1253.90

// DDV STOPNJE
export const VAT_RATES = {
  STANDARD: 22,    // Splošna stopnja
  REDUCED: 9.5,    // Znižana stopnja (hrana, knjige, zdravila...)
  ZERO: 0,         // Oproščene dobave
}

// PRISPEVKI S.P. LASTNIKA (razredi) — mesečni zneski 2026
// Razred se določi glede na prispevno osnovo preteklega leta
export const SP_CONTRIBUTION_CLASSES: Record<number, { piz: number; zzzs: number }> = {
  1:  { piz: 167.61, zzzs: 47.60 },
  2:  { piz: 195.55, zzzs: 55.54 },
  3:  { piz: 223.48, zzzs: 63.48 },
  4:  { piz: 251.41, zzzs: 71.41 },
  5:  { piz: 279.35, zzzs: 79.35 },
  6:  { piz: 307.28, zzzs: 87.29 },
  7:  { piz: 335.21, zzzs: 95.22 },
  8:  { piz: 350.28, zzzs: 99.71 },   // Najpogostejši razred
  9:  { piz: 391.08, zzzs: 111.09 },
  10: { piz: 419.01, zzzs: 119.02 },
  11: { piz: 446.95, zzzs: 126.96 },
  12: { piz: 474.88, zzzs: 134.89 },
  13: { piz: 502.81, zzzs: 142.83 },
  14: { piz: 558.68, zzzs: 158.70 },
  15: { piz: 614.55, zzzs: 174.57 },
}

// POTNI STROŠKI 2026
export const TRAVEL = {
  per_km:          0.21,   // €/km (neobdavčeno)
  meal_allowance:  8.15,   // €/dan dnevnica
  overnight:       21.39,  // €/noč nočnina
}

// REGRES 2026
export const REGRES_MIN = 1253.90  // Minimalni regres (= minimalna plača)
export const REGRES_DEADLINE = '2026-07-01'

// FURS IBAN in naslovi
export const FURS = {
  iban:     'SI56011008881000030',
  bic:      'BSLJSI2X',
  name:     'Ministrstvo za finance',
  address:  'Župančičeva 3, 1000 Ljubljana',
  api_prod: 'https://blagajne.fu.gov.si/v1/cash_registers/invoices',
  api_test: 'https://blagajne-test.fu.gov.si/v1/cash_registers/invoices',
}

// DDV ROKI (zadnji dan meseca po koncu kvartala)
export const VAT_DUE_DATES: Record<number, string> = {
  1: '2026-04-30',  // Q1
  2: '2026-07-31',  // Q2
  3: '2026-10-31',  // Q3
  4: '2027-01-31',  // Q4
}
