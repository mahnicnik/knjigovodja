/**
 * MNENJA UPORABNIKOV ZA ZACETNO STRAN (prelet 342)
 *
 * Samo PREVERLJIVA mnenja resnicnih uporabnikov, s privolitvijo za objavo.
 * Dokler je seznam prazen, se razdelek na strani ne prikaze.
 *
 * Prej sta tu stala "Ana K." in "Sara P." z zneski prihranka, ki jih ni bilo
 * mogoce preveriti - zato sta odstranjena.
 */

export type Mnenje = {
  ime: string
  /** Dejavnost in kraj, npr. "Fizioterapija · Kranj". */
  vloga: string
  citat: string
}

export const MNENJA: Mnenje[] = []
