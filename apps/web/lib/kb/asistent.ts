/**
 * RAČUNKO ASISTENT – sestava poziva (oktober 2026)
 * ════════════════════════════════════════════════
 *
 * Asistent odgovarja na vprasanja o UPORABI aplikacije. Znanje je baza
 * docs/knowledge-base (zapakirana v baza.generated.ts ob vsakem buildu).
 *
 * Sistemski poziv ima dva dela:
 *   1. STALNI del – navodila + cela baza znanja. Enak za vse uporabnike in vse
 *      zahteve, zato je predpomnjen (prompt caching, 1 h). V tem delu ne sme
 *      biti nicesar spremenljivega (datum, ime podjetja ...) – vsak drugacen
 *      bajt bi izpraznil predpomnilnik.
 *   2. KONTEKST uporabnika – podjetje, paket, vloga, stran. Kratek, za
 *      predpomnjenim delom.
 */
import type Anthropic from '@anthropic-ai/sdk'
import { BAZA_ZNANJA, type KbDokument } from './baza.generated'

export const MODEL_ASISTENTA = 'claude-sonnet-5-5'

const NAVODILA = `Si Računko asistent – pomočnik za UPORABO aplikacije Računko (računko.si). Odgovarjaš na vprašanja, kje in kako se v aplikaciji kaj naredi, nastavi, doda ali popravi.

PRAVILA
- Odgovarjaj v slovenščini, natančno in kratko. Za postopke uporabi oštevilčene korake.
- Sklicuj se na konkretne menije, zaslone, zavihke in gumbe z ISTIMI imeni, kot so v bazi znanja (npr. "POS → Nastavitve → Kategorije & Artikli → zavihek Surovine").
- Uporabljaj SAMO bazo znanja spodaj. Česar v njej ni, ne izmišljuj. Če odgovora ne poznaš ali nisi prepričan, to odkrito povej in predlagaj gumb "Pošlji podpori" pod klepetom – napačno samozavestno navodilo je slabše od priznanja.
- Bodi pozoren na "Omejitve in opozorila" v dokumentih in jih omeni, kadar so pomembne za vprašanje (npr. da gre za drugo mesto z istim imenom, da je funkcija samo za Pro, da je storno mogoč samo isti dan).
- Če uporabnikova vloga do opisane funkcije nima dostopa (npr. blagajnik in nastavitve portala), to povej in svetuj, naj se obrne na lastnika.
- Če funkcija zahteva paket Pro ali Pro + POS, uporabnik pa ga nima, to povej.
- Davčna in računovodska vprašanja (koliko davka, kaj je ugodneje, kako knjižiti) niso tvoja naloga: na kratko usmeri na "AI računovodja" (meni Pregled → AI računovodja, paket Pro) ali na računovodjo.
- FURS davčno potrjevanje samo OPISUJEŠ – ničesar ne izvajaš in ne spreminjaš.
- Če uporabnik opisuje napako (nekaj ne deluje, kot bi moralo), predlagaj "Pošlji podpori".
- Oblika: navaden tekst. Brez markdown zvezdic in naslovov; oštevilčeni ali alinejni seznami so v redu.`

function dokumentVPoziv(d: KbDokument) {
  return `<dokument modul="${d.modul}">\n${d.vsebina}\n</dokument>`
}

let stalniDel: string | null = null
/** Navodila + cela baza znanja. Deterministicno (enak niz za vsako zahtevo). */
export function stalniPoziv(): string {
  if (stalniDel) return stalniDel
  stalniDel = [
    NAVODILA,
    `BAZA ZNANJA (verzija ${BAZA_ZNANJA.verzija})`,
    `<kazalo>\n${BAZA_ZNANJA.kazalo}\n</kazalo>`,
    ...BAZA_ZNANJA.dokumenti.map(dokumentVPoziv),
  ].join('\n\n')
  return stalniDel
}

export type VlogaUporabnika = 'owner' | 'admin' | 'cashier' | 'viewer' | 'accountant' | string | null

const IME_VLOGE: Record<string, string> = {
  owner: 'lastnik', admin: 'admin', cashier: 'blagajnik (v portalu vidi samo POS blagajno)',
  viewer: 'gledalec (samo ogled)', accountant: 'računovodja (samo ogled in izvoz)',
}

/** Dokumenti, katerih poti se ujemajo s trenutno stranjo – za usmeritev odgovora. */
export function moduliZaPot(pot: string | null | undefined): string[] {
  if (!pot) return []
  const cista = pot.split('?')[0]
  return BAZA_ZNANJA.dokumenti
    .filter(d => d.poti.some(p => {
      const osnova = p.split('?')[0].replace(/\[[^\]]+\]/g, '')
      return osnova.length > 1 && (cista === osnova || cista.startsWith(osnova.endsWith('/') ? osnova : osnova + '/'))
    }))
    .map(d => d.modul)
}

export function kontekstUporabnika(k: {
  podjetje?: string | null
  paket?: string | null
  vloga?: VlogaUporabnika
  pot?: string | null
}): string {
  const naPos = !!k.pot?.startsWith('/pos')
  const moduli = moduliZaPot(k.pot)
  return [
    'KONTEKST UPORABNIKA',
    `- Podjetje: ${k.podjetje || 'ni znano'}`,
    `- Naročniški paket: ${k.paket || 'ni znan'}`,
    `- Vloga v portalu: ${(k.vloga && IME_VLOGE[k.vloga]) || k.vloga || 'ni znana'}`,
    k.pot ? `- Trenutna stran: ${k.pot}${naPos ? ' (POS blagajna – odgovori s potmi znotraj blagajne)' : ''}` : '',
    moduli.length ? `- Najbolj relevantni dokumenti za to stran: ${moduli.join(', ')}` : '',
  ].filter(Boolean).join('\n')
}

/** Sistemski bloki: predpomnjen stalni del + kratek kontekst. */
export function sistemskiBloki(k: Parameters<typeof kontekstUporabnika>[0]): Anthropic.TextBlockParam[] {
  return [
    { type: 'text', text: stalniPoziv(), cache_control: { type: 'ephemeral', ttl: '1h' } },
    { type: 'text', text: kontekstUporabnika(k) },
  ]
}

/** Zgodovina iz brskalnika -> veljavna sporocila (zacne z uporabnikom, omejena dolzina). */
export function ociscenaZgodovina(sporocila: unknown, najvec = 20): Anthropic.MessageParam[] {
  if (!Array.isArray(sporocila)) return []
  const ok = sporocila
    .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string' && m.content.trim())
    .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, 4000) }))
    .slice(-najvec)
  while (ok.length && ok[0].role !== 'user') ok.shift()
  return ok
}
