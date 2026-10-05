/**
 * RAZČLENITEV DDV ZA PRIKAZ (ploščica "DDV dolg" na /kpo in /letni-pregled)
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Ta modul NE računa DDV. Le preoblikuje rezultat `izracunajDdv` /
 * `izracunajDdvIzPodatkov` (lib/ddv.ts) v vrstice za prikaz: izstopni DDV po
 * virih (izdani računi, POS blagajna, ostali KPO prihodki) in vstopni DDV po
 * virih (prejeti računi, KPO), vsak vir po stopnjah.
 *
 * `ujemanje` je kontrola: vsota prikazanih virov mora dati TOČNO
 * `izstopniDdv.skupaj`, `vstopniDdv.skupaj` in njuna razlika `obveznost` —
 * številko, ki je velika na ploščici. Če se ne ujema, je napaka v lib/ddv.ts
 * ali v tem prikazu, in komponenta to pokaže namesto da bi tiho prikazala
 * razčlenitev, ki se ne sešteje.
 */

import { STOPNJE, type DdvRezultat, type PoStopnjah, type Stopnja } from '@/lib/ddv'

export interface VrsticaStopnje { stopnja: Stopnja; oznaka: string; osnova: number; ddv: number }
export interface VirDdv { kljuc: string; oznaka: string; opis: string; ddv: number; osnova: number; poStopnjah: VrsticaStopnje[] }
export interface StranDdv { skupaj: number; osnovaSkupaj: number; viri: VirDdv[] }

export interface RazclenitevDdv {
  izstopni: StranDdv
  vstopni: StranDdv
  obveznost: number
  /** Vsota virov = skupaj na obeh straneh IN izstopni − vstopni = obveznost (na cent). */
  ujemanje: boolean
}

export const OZNAKA_STOPNJE: Record<Stopnja, string> = {
  '22': '22 %', '9.5': '9,5 %', '5': '5 %', '0': '0 % (oproščeno)', drugo: 'druga stopnja',
}

const c = (n: number) => Math.round(n * 100)

function vir(kljuc: string, oznaka: string, opis: string, p: PoStopnjah): VirDdv {
  const poStopnjah = STOPNJE
    .filter(s => p[s].ddv !== 0 || p[s].osnova !== 0)
    .map(s => ({ stopnja: s, oznaka: OZNAKA_STOPNJE[s], osnova: p[s].osnova, ddv: p[s].ddv }))
  return {
    kljuc, oznaka, opis, poStopnjah,
    ddv: STOPNJE.reduce((s, x) => s + c(p[x].ddv), 0) / 100,
    osnova: STOPNJE.reduce((s, x) => s + c(p[x].osnova), 0) / 100,
  }
}

export function razclenitevDdv(r: DdvRezultat): RazclenitevDdv {
  const izstopni: StranDdv = {
    skupaj: r.izstopniDdv.skupaj,
    osnovaSkupaj: r.izstopniDdv.osnovaSkupaj,
    viri: [
      vir('izdaniRacuni', 'Izdani računi', 'računi, izdani v obdobju (po datumu izdaje)', r.izstopniDdv.izdaniRacuni),
      vir('blagajna', 'POS promet', 'blagajna — po datumu prodaje', r.izstopniDdv.blagajna),
      vir('kpo', 'Ostali prihodki (KPO)', 'banka, kartice, spletna prodaja — brez izdanega računa', r.izstopniDdv.kpo),
    ],
  }
  const vstopni: StranDdv = {
    skupaj: r.vstopniDdv.skupaj,
    osnovaSkupaj: r.vstopniDdv.osnovaSkupaj,
    viri: [
      vir('prejetiRacuni', 'Prejeti računi', 'stroški z DDV (po datumu računa)', r.vstopniDdv.prejetiRacuni),
      vir('kpo', 'KPO vnosi', 'vstopni DDV brez povezanega prejetega računa', r.vstopniDdv.kpo),
    ],
  }
  const vsota = (s: StranDdv) => s.viri.reduce((a, v) => a + c(v.ddv), 0)
  const ujemanje =
    vsota(izstopni) === c(izstopni.skupaj) &&
    vsota(vstopni) === c(vstopni.skupaj) &&
    c(izstopni.skupaj) - c(vstopni.skupaj) === c(r.obveznost)
  return { izstopni, vstopni, obveznost: r.obveznost, ujemanje }
}
