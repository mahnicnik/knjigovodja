/**
 * VELJAVNOST KARTIC STRANKE - EN SAM VIR RESNICE (7.10.2026)
 *
 * NAPAKA: potekla kartica ostane `active = true` (nic je ne deaktivira), ko
 * stranka dobi novo - kupljeno ali dodano rocno. Vec mest je vzelo PRVO
 * aktivno kartico ali NAJZGODNJI datum poteka:
 *   - profil stranke "AKTIVNA KARTICA" je kazal staro z "Poteklo"
 *   - pika v seznamu strank je bila oranzna, "N aktivnih kart" je stelo potekle
 *   - member_status_view (baza) je vzel min(expires) -> stranka "expired"
 *   - blagajna in termin sta za unovcenje ponujala tudi potekle kartice
 * Pri 30 strankah ŠIRM je bilo stanje "potekla", ceprav so imele veljavno karto.
 *
 * Zdaj vsa mesta sprasujejo TU: kartica velja, ce je aktivna, se je zacela,
 * ni potekla in ima obiske (ali jih ne steje).
 */

export type Kartica = {
  id?: string
  active?: boolean | null
  expires?: string | null
  remaining?: number | null
  frozen_at?: string | null
  activated_at?: string | null
  valid_from?: string | null
  [k: string]: any
}

export type StanjeKartice = 'veljavna' | 'zamrznjena' | 'se_ni_zacela' | 'potekla' | 'porabljena' | 'neaktivna'

/** Danasnji datum YYYY-MM-DD v LOKALNEM casu (ne UTC - po polnoci bi bil vceraj). */
export function danesLokalno(zdaj: Date = new Date()): string {
  const m = String(zdaj.getMonth() + 1).padStart(2, '0')
  const d = String(zdaj.getDate()).padStart(2, '0')
  return `${zdaj.getFullYear()}-${m}-${d}`
}

const dan = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null)

export function stanjeKartice(k: Kartica, danes: string = danesLokalno()): StanjeKartice {
  if (!k?.active) return 'neaktivna'
  const potece = dan(k.expires)
  if (potece && potece < danes) return 'potekla'
  if (k.remaining != null && Number(k.remaining) <= 0) return 'porabljena'
  if (k.frozen_at) return 'zamrznjena'
  const zacetek = dan(k.valid_from) || dan(k.activated_at)
  if (zacetek && zacetek > danes) return 'se_ni_zacela'
  return 'veljavna'
}

/** Kartica je stranki "na voljo": velja zdaj, zamrznjena ali se bo zacela. */
export function jeNaVoljo(k: Kartica, danes: string = danesLokalno()): boolean {
  const s = stanjeKartice(k, danes)
  return s === 'veljavna' || s === 'zamrznjena' || s === 'se_ni_zacela'
}

/** Kartica, s katere se ta trenutek lahko unovci obisk. */
export function jeUporabnaZaObisk(k: Kartica, danes: string = danesLokalno()): boolean {
  return stanjeKartice(k, danes) === 'veljavna' && k.remaining != null && Number(k.remaining) > 0
}

const RED: Record<StanjeKartice, number> = { veljavna: 0, se_ni_zacela: 1, zamrznjena: 2, potekla: 3, porabljena: 4, neaktivna: 5 }

/**
 * Razvrsti: najprej veljavne (prej potece = prej se porablja), nato
 * prihodnje in zamrznjene, na koncu potekle (najnovejsa najprej).
 */
export function razvrstiKartice<T extends Kartica>(kartice: T[] | null | undefined, danes: string = danesLokalno()): T[] {
  return [...(kartice || [])].sort((a, b) => {
    const ra = RED[stanjeKartice(a, danes)], rb = RED[stanjeKartice(b, danes)]
    if (ra !== rb) return ra - rb
    const ea = dan(a.expires) || '9999-12-31', eb = dan(b.expires) || '9999-12-31'
    return ra >= 3 ? (ea < eb ? 1 : ea > eb ? -1 : 0) : (ea < eb ? -1 : ea > eb ? 1 : 0)
  })
}

/** Potekla aktivna kartica, ki jo POKRIVA druga, na voljo kartica (stranka je ze podaljsala). */
export function jePokrita(k: Kartica, vse: Kartica[], danes: string = danesLokalno()): boolean {
  const s = stanjeKartice(k, danes)
  if (s !== 'potekla' && s !== 'porabljena') return false
  return vse.some(d => d !== k && d.id !== k.id && jeNaVoljo(d, danes))
}

export type StanjeStranke = {
  status: 'none' | 'active' | 'expiring' | 'critical' | 'expired'
  remainingVisits: number | null
  daysToExpiry: number | null
}

function dniMed(od: string, do_: string): number {
  return Math.round((Date.parse(do_ + 'T00:00:00Z') - Date.parse(od + 'T00:00:00Z')) / 86400000)
}

/**
 * Stanje stranke po VELJAVNIH karticah. Datum, do katerega je pokrita, je
 * NAJKASNEJSI potek med njimi (brez datuma = neomejeno) - nova kartica,
 * kupljena pred iztekom stare, stranko pokriva naprej.
 */
export function stanjeStranke(kartice: Kartica[] | null | undefined, danes: string = danesLokalno()): StanjeStranke {
  const vse = (kartice || []).filter(k => k?.active)
  const veljavne = vse.filter(k => jeNaVoljo(k, danes))
  if (veljavne.length === 0) {
    const imaPotekle = vse.some(k => ['potekla', 'porabljena'].includes(stanjeKartice(k, danes)))
    return { status: imaPotekle ? 'expired' : 'none', remainingVisits: imaPotekle ? 0 : null, daysToExpiry: null }
  }
  const brezRoka = veljavne.some(k => !dan(k.expires))
  const zadnji = brezRoka ? null : veljavne.map(k => dan(k.expires)!).sort().pop()!
  const daysToExpiry = zadnji ? dniMed(danes, zadnji) : null
  const steteObiske = veljavne.filter(k => k.remaining != null)
  const brezStetja = veljavne.some(k => k.remaining == null)
  const remainingVisits = steteObiske.length ? steteObiske.reduce((s, k) => s + Number(k.remaining || 0), 0) : null
  const obiski = brezStetja ? null : remainingVisits

  let status: StanjeStranke['status'] = 'active'
  if ((daysToExpiry != null && daysToExpiry <= 3) || (obiski != null && obiski <= 1)) status = 'critical'
  else if ((daysToExpiry != null && daysToExpiry <= 7) || (obiski != null && obiski <= 2)) status = 'expiring'
  return { status, remainingVisits, daysToExpiry }
}
