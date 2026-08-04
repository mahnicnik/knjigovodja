/**
 * ═══════════════════════════════════════════════════════════════════════
 *  SLOVENSKI DELA PROSTI DNEVI IN DELOVNI DNEVI
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Zakaj obstaja (audit 30.7.2026):
 *  Dva dela portala sta to potrebovala neodvisno:
 *    - /dopust: praznik med dopustom se NE šteje kot izrabljen dan (ZDR-1)
 *    - /rokovnik: rok za DDV-O je ZADNJI DELOVNI DAN, ne zadnji koledarski
 *
 *  Druga napaka je bila resna: za maj 2026 bi koda pokazala 31. maj
 *  (nedelja), dejanski rok pa je 29. maj (petek) — uporabnik, ki bi se
 *  zanesel na rokovnik, bi ZAMUDIL zakonski rok.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** Velikonočna nedelja (Meeus/Jones/Butcher) — preverjeno za 2024–2027. */
export function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

/** Fiksni dela prosti dnevi [mesec 1–12, dan]. */
export const FIXED_HOLIDAYS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],   // novo leto
  [1, 2],   // novo leto (2. dan)
  [2, 8],   // Prešernov dan
  [4, 27],  // dan upora proti okupatorju
  [5, 1],   // praznik dela
  [5, 2],   // praznik dela (2. dan)
  [6, 25],  // dan državnosti
  [8, 15],  // Marijino vnebovzetje
  [10, 31], // dan reformacije
  [11, 1],  // dan spomina na mrtve
  [12, 25], // božič
  [12, 26], // dan samostojnosti in enotnosti
]

/**
 * Ali je dani datum slovenski dela prost dan?
 * Velikonočna in binkoštna NEDELJA sta že zajeti z vikend preverbo,
 * zato je od premakljivih potreben samo velikonočni ponedeljek.
 */
export function isSlovenianHoliday(d: Date): boolean {
  const month = d.getMonth() + 1
  const day = d.getDate()
  if (FIXED_HOLIDAYS.some(([m, dd]) => m === month && dd === day)) return true

  const easter = easterSunday(d.getFullYear())
  const easterMonday = new Date(easter)
  easterMonday.setDate(easterMonday.getDate() + 1)
  return d.getMonth() === easterMonday.getMonth() && d.getDate() === easterMonday.getDate()
}

/** Ali je delovni dan (ne vikend, ne praznik)? */
export function isWorkingDay(d: Date): boolean {
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return false
  return !isSlovenianHoliday(d)
}

/**
 * ZADNJI DELOVNI DAN v mesecu — potreben za davčne roke.
 *
 * @param year polno leto (npr. 2026)
 * @param month mesec 1–12
 * @returns dan v mesecu (npr. 29)
 */
export function lastWorkingDayOfMonth(year: number, month: number): number {
  const d = new Date(year, month, 0) // zadnji koledarski dan meseca
  while (!isWorkingDay(d)) {
    d.setDate(d.getDate() - 1)
  }
  return d.getDate()
}

/**
 * Število delovnih dni med dvema datumoma (vključno z obema).
 * Uporablja /dopust za izračun izrabljenih dni.
 */
export function countWorkingDays(from: string | Date, to: string | Date): number {
  const start = typeof from === 'string' ? new Date(from) : new Date(from)
  const end = typeof to === 'string' ? new Date(to) : new Date(to)
  let days = 0
  const cur = new Date(start)
  while (cur <= end) {
    if (isWorkingDay(cur)) days++
    cur.setDate(cur.getDate() + 1)
  }
  return days
}
