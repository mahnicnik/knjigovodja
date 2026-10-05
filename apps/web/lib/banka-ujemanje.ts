/**
 * BANČNI UVOZ: ALI JE TRANSAKCIJA ŽE V KNJIGI? (revizija V1/V2, oktober 2026)
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Bancni uvoz je vsak priliv brez odprtega racuna knjizil kot NOV prihodek in
 * vsak odliv (razen plac) kot NOV strosek. Pri SIRM (Q2 2026) je tako nastalo:
 *   · tedenska izplacila kartičnega prometa (Worldline/Payten, sklic RE…) so
 *     bila prihodek "Drugo" - isti promet je ze bil knjizen iz kartičnega
 *     obracuna (bruto) - prihodek dvakrat
 *   · 3 × 479,98 EUR placil racunov 2026-007/010/011 kot "Drugo" - racuni so bili
 *     ze oznaceni kot placani in steti kot prihodek - prihodek dvakrat
 *   · odlivi za ze vnesene prejete racune (Petrol, racunovodja, Anthropic …)
 *     kot "Drugo" - strosek dvakrat
 *
 * Ta modul za vsako transakcijo poisce, ali jo knjiga ze vsebuje. Cista
 * logika, brez baze - stran /banka jo uporabi pred knjizenjem.
 */

import { podobnoIme, normalizirajIme } from '@/lib/strosek-ujemanje'

export type Zanesljivost = 'gotovo' | 'verjetno'

export interface BancnaTransakcija {
  date: string            // YYYY-MM-DD
  amount: number          // vedno pozitivno
  type: 'credit' | 'debit'
  description: string
  reference: string
}

const dni = (a: string, b: string) => (Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86_400_000
const enako = (a: number, b: number, tol = 0.011) => Math.abs(Number(a) - Number(b)) < tol
const besedilo = (t: BancnaTransakcija) => `${t.description || ''} ${t.reference || ''}`

// ───────────────────────────── prilivi ─────────────────────────────

export interface IzdanRacunZaUjemanje {
  id: string; invoice_number: string | null; amount_total: number | string
  issue_date: string | null; due_date: string | null; status: string; client_name?: string | null
}

/**
 * Priliv → izdan racun. Uposteva tudi ZE PLACANE racune: tak priliv je placilo
 * ze stetega prihodka in NI nov prihodek (prej: samo racuni s statusom 'sent').
 * Znesek se mora ujemati na cent; sklic s stevilko racuna = gotovo, sicer
 * casovno okno (od izdaje do 90 dni po zapadlosti).
 */
export function najdiIzdanRacun(
  t: BancnaTransakcija, racuni: IzdanRacunZaUjemanje[], porabljeni = new Set<string>(),
): { racun: IzdanRacunZaUjemanje; zanesljivost: Zanesljivost } | null {
  if (t.type !== 'credit') return null
  const kandidati = racuni.filter(r => !porabljeni.has(r.id) && r.status !== 'draft' && r.status !== 'cancelled'
    && enako(Number(r.amount_total), t.amount))
  if (kandidati.length === 0) return null
  const sSklicem = kandidati.find(r => r.invoice_number && besedilo(t).replace(/\s/g, '').includes(String(r.invoice_number).replace(/\s/g, '')))
  if (sSklicem) return { racun: sSklicem, zanesljivost: 'gotovo' }
  const vOknu = kandidati
    .filter(r => {
      const od = r.issue_date || r.due_date
      const doD = r.due_date || r.issue_date
      return od && doD && dni(t.date, od) >= -5 && dni(t.date, doD) <= 90
    })
    // najprej neplacani, nato najblizja zapadlost
    .sort((a, b) => Number(a.status === 'paid') - Number(b.status === 'paid')
      || Math.abs(dni(t.date, a.due_date || a.issue_date || t.date)) - Math.abs(dni(t.date, b.due_date || b.issue_date || t.date)))
  if (vOknu.length === 0) return null
  const ime = vOknu[0].client_name && podobnoIme(vOknu[0].client_name, t.description)
  return { racun: vOknu[0], zanesljivost: vOknu.length === 1 || ime ? 'gotovo' : 'verjetno' }
}

export interface KarticniObracun {
  id: string; entry_date: string; bruto: number; provizija: number; opis: string
}

/** KPO vnosi kartičnega obracuna (prihodek "Kartično poslovanje" + provizija istega dne). */
export function karticniObracuniIzKpo(kpo: Array<{ id: string; entry_date: string; category: string | null; income: any; expense: any; description?: string | null }>): KarticniObracun[] {
  const provizije = kpo.filter(e => e.category === 'Bančne provizije' && /^Provizija /.test(String(e.description || '')))
  return kpo.filter(e => e.category === 'Kartično poslovanje' && Number(e.income) > 0).map(e => {
    const p = provizije.find(x => x.entry_date === e.entry_date)
    return { id: e.id, entry_date: e.entry_date, bruto: Number(e.income), provizija: Number(p?.expense || 0), opis: String(e.description || '') }
  })
}

/**
 * Priliv → izplacilo ze knjizenega kartičnega obracuna. Ponudnik nakaze
 * bruto − provizija nekaj dni po koncu obdobja. Dovoljeno odstopanje 1 %
 * bruto (provizija, ki je na izpisu ni bilo, zaokrozevanje).
 */
export function najdiKarticniObracun(
  t: BancnaTransakcija, obracuni: KarticniObracun[], porabljeni = new Set<string>(),
): { obracun: KarticniObracun; zanesljivost: Zanesljivost } | null {
  if (t.type !== 'credit') return null
  const vOknu = obracuni
    .filter(o => !porabljeni.has(o.id))
    .filter(o => { const d = dni(t.date, o.entry_date); return d >= 0 && d <= 7 })
    .sort((a, b) => Math.abs(t.amount - (a.bruto - a.provizija)) - Math.abs(t.amount - (b.bruto - b.provizija)))
  const tocni = vOknu.filter(o => t.amount <= o.bruto + 0.01 && Math.abs(t.amount - (o.bruto - o.provizija)) <= Math.max(0.01 * o.bruto, 0.5))
  if (tocni.length > 0) return { obracun: tocni[0], zanesljivost: tocni.length === 1 ? 'gotovo' : 'verjetno' }
  // Vecje odstopanje (vracila kupcem, zadrzani zneski): 90-100 % bruto - le predlog.
  const priblizni = vOknu.filter(o => t.amount <= o.bruto + 0.01 && t.amount >= 0.9 * o.bruto)
  return priblizni.length > 0 ? { obracun: priblizni[0], zanesljivost: 'verjetno' } : null
}

/** Ime ponudnika kartičnih placil v opisu ali sklicu (izplacilo, ne prodaja). */
export function jeIzplaciloKarticnegaPrometa(t: BancnaTransakcija): boolean {
  return /worldline|payten|bankart|sumup|stripe|valu|nexi|six payment|global payments|ingenico|viva wallet|kartičn|karticn/i.test(besedilo(t))
}

// ───────────────────────────── odlivi ─────────────────────────────

export interface PrejetRacunZaUjemanje {
  id: string; vendor: string | null; amount_total: number | string | null; receipt_date: string | null; receipt_number?: string | null
}

/**
 * Odliv → ze vnesen prejeti racun (placilo stroska, ki je ze v knjigi).
 * Znesek na cent, datum placila od 5 dni pred do 45 dni po datumu racuna.
 * Gotovo: ime dobavitelja ali stevilka racuna v opisu ali edini kandidat v
 * 10 dneh. Sicer 'verjetno' - uporabnik potrdi.
 */
export function najdiPrejetiRacun(
  t: BancnaTransakcija, prejeti: PrejetRacunZaUjemanje[], porabljeni = new Set<string>(),
): { racun: PrejetRacunZaUjemanje; zanesljivost: Zanesljivost } | null {
  if (t.type !== 'debit') return null
  const kandidati = prejeti
    .filter(r => !porabljeni.has(r.id) && r.receipt_date && enako(Number(r.amount_total), t.amount))
    .filter(r => { const d = dni(t.date, r.receipt_date!); return d >= -5 && d <= 45 })
    .sort((a, b) => Math.abs(dni(t.date, a.receipt_date!)) - Math.abs(dni(t.date, b.receipt_date!)))
  if (kandidati.length === 0) return null
  const opis = normalizirajIme(besedilo(t))
  const poImenu = kandidati.find(r => (r.vendor && podobnoIme(r.vendor, t.description))
    || (r.receipt_number && opis.includes(normalizirajIme(r.receipt_number))))
  if (poImenu) return { racun: poImenu, zanesljivost: 'gotovo' }
  const blizu = kandidati.filter(r => Math.abs(dni(t.date, r.receipt_date!)) <= 10)
  return { racun: kandidati[0], zanesljivost: blizu.length === 1 && kandidati.length === 1 ? 'gotovo' : 'verjetno' }
}

// ───────────────────────────── DDV za prilive brez racuna ─────────────────────────────

/**
 * Priliv brez povezanega dokumenta pri DDV zavezancu: bruto → osnova + DDV po
 * izbrani stopnji (centi zaokrozeni). Stopnja 0 = brez DDV (posojilo, polog
 * lastnika, vracilo …). Za ODLIVE brez prejetega racuna se DDV NE odbija - brez
 * racuna ni pravice do odbitka (ZDDV-1), zato ostane bruto kot strosek.
 */
export function razcleniPriliv(bruto: number, stopnja: number): { neto: number; ddv: number } {
  if (!stopnja) return { neto: Math.round(bruto * 100) / 100, ddv: 0 }
  const neto = Math.round((bruto / (1 + stopnja / 100)) * 100) / 100
  return { neto, ddv: Math.round((bruto - neto) * 100) / 100 }
}
