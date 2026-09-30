/**
 * KALKULATOR PRIHRANKA NA ZACETNI STRANI (prelet 342)
 * ═══════════════════════════════════════════════════
 *
 * Cista funkcija - brez Reacta, brez globalnih podatkov - da jo lahko
 * testiramo neposredno (tests/landing-kalkulator.spec.ts).
 *
 * FORMULA
 *   ure na mesec = (racuni * prihranek na racun + stalni prihranek) / 60
 *     prihranek na racun  = izdaja racuna rocno - z Racunkom        [min]
 *     stalni prihranek    = mesecni zakljucek rocno - z Racunkom    [min]
 *   evri na mesec = ure na mesec * urna postavka - cena paketa
 *   leto          = mesec * 12
 *
 * Minute pridejo iz lib/landing-raziskava.ts. Dokler raziskava ni vpisana,
 * `izRaziskave` vrne null in kalkulator rezultata ne prikaze.
 */

import { opravilo } from './landing-raziskava'

export type VhodKalkulatorja = {
  racunovNaMesec: number
  urnaPostavka: number
  cenaPaketaNaMesec: number
  /** Prihranjene minute na en izdani racun. */
  minutNaRacun: number
  /** Prihranjene minute na mesec, ne glede na stevilo racunov. */
  stalnihMinutNaMesec: number
}

export type RezultatKalkulatorja = {
  urNaMesec: number
  urNaLeto: number
  evrovNaMesec: number
  evrovNaLeto: number
}

const zaokrozi = (n: number, dec: number) => {
  const f = 10 ** dec
  return Math.round(n * f) / f
}

export function izracunajPrihranek(v: VhodKalkulatorja): RezultatKalkulatorja {
  const racuni = Math.max(0, v.racunovNaMesec)
  const minute = racuni * Math.max(0, v.minutNaRacun) + Math.max(0, v.stalnihMinutNaMesec)
  const urNaMesec = minute / 60
  const evrovNaMesec = urNaMesec * Math.max(0, v.urnaPostavka) - v.cenaPaketaNaMesec
  return {
    urNaMesec: zaokrozi(urNaMesec, 1),
    urNaLeto: zaokrozi(urNaMesec * 12, 0),
    evrovNaMesec: zaokrozi(evrovNaMesec, 0),
    evrovNaLeto: zaokrozi(evrovNaMesec * 12, 0),
  }
}

/** Minute iz raziskave ali null, ce katero od polj se manjka. */
export function izRaziskave(): Pick<VhodKalkulatorja, 'minutNaRacun' | 'stalnihMinutNaMesec'> | null {
  const r = opravilo('racun')
  const z = opravilo('zakljucek')
  if (r.prejMin == null || r.zdajMin == null || z.prejMin == null || z.zdajMin == null) return null
  return {
    minutNaRacun: r.prejMin - r.zdajMin,
    stalnihMinutNaMesec: z.prejMin - z.zdajMin,
  }
}
