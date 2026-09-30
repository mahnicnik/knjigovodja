/**
 * KALKULATOR PRIHRANKA NA ZACETNI STRANI (prelet 342, predelano v 354)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Cista funkcija - brez Reacta, brez globalnih podatkov - da jo lahko
 * testiramo neposredno (tests/landing-kalkulator.spec.ts).
 *
 * FORMULA
 *   minute na mesec = racuni  * (racun rocno   - racun z Racunkom)
 *                   + stroski * (strosek rocno - strosek z Racunkom)
 *                   + (mesecni zakljucek rocno - z Racunkom)
 *   ure na mesec    = minute / 60
 *   evri na mesec   = ure * urna postavka - cena paketa
 *   leto            = mesec * 12
 *
 * PRELET 354: dokler raziskava (lib/landing-raziskava.ts) ni vpisana, so
 * privzeti casi PREDPOSTAVKE, ki jih obiskovalec vidi in lahko spremeni.
 * Stran jih ne predstavlja kot rezultat raziskave.
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
  /** Prejeti racuni (stroski) na mesec. */
  stroskovNaMesec?: number
  /** Prihranjene minute na en vnesen strosek. */
  minutNaStrosek?: number
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
const poz = (n: number | undefined) => Math.max(0, Number(n) || 0)

export function izracunajPrihranek(v: VhodKalkulatorja): RezultatKalkulatorja {
  const minute = poz(v.racunovNaMesec) * poz(v.minutNaRacun)
    + poz(v.stroskovNaMesec) * poz(v.minutNaStrosek)
    + poz(v.stalnihMinutNaMesec)
  const urNaMesec = minute / 60
  const evrovNaMesec = urNaMesec * poz(v.urnaPostavka) - v.cenaPaketaNaMesec
  return {
    urNaMesec: zaokrozi(urNaMesec, 1),
    urNaLeto: zaokrozi(urNaMesec * 12, 0),
    evrovNaMesec: zaokrozi(evrovNaMesec, 0),
    evrovNaLeto: zaokrozi(evrovNaMesec * 12, 0),
  }
}

/** Casi opravil v minutah: rocno (prej) in z Racunkom (zdaj). */
export type Casi = {
  racunPrej: number
  racunZdaj: number
  strosekPrej: number
  strosekZdaj: number
  zakljucekPrej: number
  zakljucekZdaj: number
}

/**
 * PREDPOSTAVKE (niso izmerjene). Obiskovalec jih vidi pod kalkulatorjem in
 * jih lahko spremeni. Ko je raziskava vpisana, jih izpodrine.
 */
export const PREDPOSTAVKE: Casi = {
  racunPrej: 8,       // predloga v Wordu, stevilcenje, PDF, e-posta
  racunZdaj: 1,
  strosekPrej: 4,     // prepis dobavitelja, zneska in DDV v tabelo
  strosekZdaj: 0.5,   // fotografija in potrditev
  zakljucekPrej: 180, // sestevanje KPO, DDV, prispevki
  zakljucekZdaj: 15,
}

/** Casi iz raziskave, kjer so vpisani, sicer predpostavke. */
export function privzetiCasi(): { casi: Casi; izRaziskave: boolean } {
  const r = opravilo('racun'), s = opravilo('strosek'), z = opravilo('zakljucek')
  const vsi = [r.prejMin, r.zdajMin, s.prejMin, s.zdajMin, z.prejMin, z.zdajMin]
  if (vsi.every(x => x != null)) {
    return {
      casi: { racunPrej: r.prejMin!, racunZdaj: r.zdajMin!, strosekPrej: s.prejMin!, strosekZdaj: s.zdajMin!, zakljucekPrej: z.prejMin!, zakljucekZdaj: z.zdajMin! },
      izRaziskave: true,
    }
  }
  return { casi: PREDPOSTAVKE, izRaziskave: false }
}

/** Pretvori case opravil v prihranjene minute za izracunajPrihranek. */
export function prihranjeneMinute(c: Casi): Pick<VhodKalkulatorja, 'minutNaRacun' | 'minutNaStrosek' | 'stalnihMinutNaMesec'> {
  return {
    minutNaRacun: Math.max(0, c.racunPrej - c.racunZdaj),
    minutNaStrosek: Math.max(0, c.strosekPrej - c.strosekZdaj),
    stalnihMinutNaMesec: Math.max(0, c.zakljucekPrej - c.zakljucekZdaj),
  }
}

/** Minute iz raziskave ali null, ce katero od polj se manjka. */
export function izRaziskave(): Pick<VhodKalkulatorja, 'minutNaRacun' | 'stalnihMinutNaMesec'> | null {
  const p = privzetiCasi()
  return p.izRaziskave ? prihranjeneMinute(p.casi) : null
}
