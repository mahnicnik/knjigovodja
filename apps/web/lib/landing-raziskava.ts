/**
 * PODATKI IZ RAZISKAVE ZA ZACETNO STRAN (prelet 342)
 * ══════════════════════════════════════════════════
 *
 * EDINI vir stevilk o prihranku casa na zacetni strani. Nobena komponenta v
 * components/landing/ si stevilke ne izmisli - ce je polje `null`, stran
 * napise besedilo BREZ stevilke in na tistem mestu v kodi pusti oznako
 * `TODO: podatek iz raziskave`.
 *
 * Stevilke vpisite dobesedno iz raziskave. Ko je polje izpolnjeno, se
 * prikaze povsod, kjer se uporablja (pas s stevilko, tabela prej/zdaj,
 * kalkulator, cenik, zakljucni poziv).
 */

export type Opravilo = {
  id: 'racun' | 'strosek' | 'zakljucek' | 'blagajna' | 'banka'
  naziv: string
  /** Kaj uporabnik dela rocno - opis brez stevilke. */
  rocno: string
  /** Kaj naredi Racunko - opis brez stevilke. */
  zRacunkom: string
  /** Cas rocno, v minutah. */
  prejMin: number | null
  /** Cas z Racunkom, v minutah (0.5 = 30 sekund). */
  zdajMin: number | null
}

export const RAZISKAVA = {
  /** Prihranek casa na mesec (povprecen s.p.), v urah. */
  urNaMesec: null as number | null,
  /** Prihranek casa na leto, v urah. */
  urNaLeto: null as number | null,
  /** Vzorec / metodologija - en stavek za opombo pod prvo stevilko. */
  metodologija: null as string | null,
  /** Priblizen prihranek po paketih, v urah na mesec. */
  urNaMesecPoPaketu: {
    brezplacno: null as number | null,
    pro: null as number | null,
    pos: null as number | null,
  },
  opravila: [
    {
      id: 'racun',
      naziv: 'Izdaja računa',
      rocno: 'Predloga v Wordu, ročno številčenje, izvoz v PDF, e-pošta.',
      zRacunkom: 'Izberete stranko in postavke. Račun je potrjen pri FURS in poslan.',
      // TODO: podatek iz raziskave (izdaja racuna: __ min -> __ min)
      prejMin: null,
      zdajMin: null,
    },
    {
      id: 'strosek',
      naziv: 'Vnos prejetega računa',
      rocno: 'Prepisovanje dobavitelja, zneska in DDV v tabelo.',
      zRacunkom: 'Fotografirate račun, Računko ga prebere. Vi potrdite.',
      // TODO: podatek iz raziskave (vnos prejetega racuna: __ min -> __ min)
      prejMin: null,
      zdajMin: null,
    },
    {
      id: 'zakljucek',
      naziv: 'Mesečni zaključek (KPO, DDV, prispevki)',
      rocno: 'Seštevanje po mapah, izračun prispevkov, izpolnjevanje obrazcev.',
      zRacunkom: 'KPO in evidenca DDV se polnita sproti. Prispevki so izračunani.',
      // TODO: podatek iz raziskave (mesecni zakljucek: __ ur -> __ min)
      prejMin: null,
      zdajMin: null,
    },
    {
      id: 'blagajna',
      naziv: 'Dnevni zaključek blagajne',
      rocno: 'Štetje, prepisovanje prometa, ločen zapis za knjigo.',
      zRacunkom: 'En klik. Zaključek gre v PDF in v knjigo prihodkov.',
      // TODO: podatek iz raziskave (dnevni zakljucek blagajne: __ min -> __ min)
      prejMin: null,
      zdajMin: null,
    },
    {
      id: 'banka',
      naziv: 'Usklajevanje plačil z banko',
      rocno: 'Primerjanje izpiska z računi, vrstico za vrstico.',
      zRacunkom: 'Uvozite izpisek. Plačila se povežejo z računi sama.',
      // TODO: podatek iz raziskave (usklajevanje placil: __ min -> __ min)
      prejMin: null,
      zdajMin: null,
    },
  ] as Opravilo[],
}

export function opravilo(id: Opravilo['id']): Opravilo {
  return RAZISKAVA.opravila.find(o => o.id === id)!
}

/** 0.5 -> "30 s", 15 -> "15 min", 180 -> "3 ure". */
export function formatCas(min: number): string {
  if (min < 1) return `${Math.round(min * 60)} s`
  if (min < 60) return `${fmtStevilo(min)} min`
  const ure = min / 60
  return `${fmtStevilo(ure)} ${ureBeseda(ure)}`
}

export function fmtStevilo(n: number, dec = 1): string {
  return n.toLocaleString('sl-SI', { maximumFractionDigits: dec })
}

/** Slovenska dvojina in mnozina: 1 ura, 2 uri, 3 ure, 5 ur. */
export function ureBeseda(n: number): string {
  if (!Number.isInteger(n)) return 'ure'
  const m = Math.abs(n) % 100
  if (m === 1) return 'ura'
  if (m === 2) return 'uri'
  if (m === 3 || m === 4) return 'ure'
  return 'ur'
}
