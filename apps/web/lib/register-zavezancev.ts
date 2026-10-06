/**
 * REGISTER DAVČNIH ZAVEZANCEV (FURS odprti podatki) – oktober 2026
 * ═══════════════════════════════════════════════════════════════
 *
 * Vir: http://datoteke.durs.gov.si/DURS_zavezanci_PO.zip (pravne osebe) in
 * DURS_zavezanci_DEJ.zip (fizicne osebe z dejavnostjo, s.p.). FURS ju osvezi
 * vsako noc okoli 23:00. UTF-8, CRLF, stalna sirina stolpcev, imena z
 * VELIKIMI crkami, brez TRR.
 *
 * SIRINE STOLPCEV so dolocene iz datotek 6.10.2026 (GitHub Action, analiza
 * vseh vrstic: polozaji, kjer je v VSAKI vrstici presledek):
 *
 *   PO  (145.360 vrstic, 259 znakov; 19 vrstic 268 znakov)
 *     [0]       oznaka: presledek | S = skupina za DDV | Č = clan skupine za DDV |
 *               O = tuja oseba (brez maticne) | P (5.655 O, 2.326 P, 19 Č, 7 S)
 *     [2]       '*' = identificiran za DDV (ima ga vsaka vrstica z oznako; 66.730 + oznacene)
 *     [4:12]    davcna   [13:23] maticna (lahko prazna)   [24:34] datum registracije
 *     [35:41]   SKD      [42:142] ime                     [143:257] naslov ("ULICA 9, 1000 KRAJ")
 *     [257:259] financni urad
 *     [260:268] samo pri 268-znakovnih vrsticah: dodatna davcna stevilka (npr. skupina)
 *
 *   DEJ (139.150 vrstic, 424 znakov)
 *     [0:8]     davcna   [9:19] maticna   [20:26] SKD
 *     [27:264]  ime (v 139.149 vrsticah se konca pred 259; ena sega do 263 –
 *               "[260:264]" ni samostojno polje, ampak nadaljevanje imena)
 *     [308:422] naslov ("ULICA 5 , 6230 KRAJ")   [422:424] financni urad
 *     DDV oznake datoteka DEJ NIMA -> ddv = null (ni podatka).
 *     637 davcnih stevilk se ponovi (glej razcleniDatoteko).
 */

import { berljivoIme, berljivNaslov } from './berljivo-ime'
export { berljivoIme, berljivNaslov }

export type VrstaZavezanca = 'PO' | 'DEJ'

export interface Zavezanec {
  davcna: string
  maticna: string | null
  ime: string
  naslov: string | null
  posta: string | null
  kraj: string | null
  skd: string | null
  vrsta: VrstaZavezanca
  /** true/false iz datoteke PO; null = ni podatka (datoteka DEJ) */
  ddv: boolean | null
  fu: string | null
}

const prazno = (s: string) => {
  const t = s.trim()
  return t ? t : null
}

/** "KRAIGHERJEVA ULICA 5 , 6230 POSTOJNA" -> ulica, posta, kraj. Tuji naslovi ostanejo celi. */
export function razcleniNaslov(surovo: string): { naslov: string | null; posta: string | null; kraj: string | null } {
  const s = surovo.replace(/\s+/g, ' ').trim()
  if (!s) return { naslov: null, posta: null, kraj: null }
  const m = s.match(/^(.*?)\s*,\s*(\d{4})\s+(.+)$/)
  if (!m) return { naslov: s, posta: null, kraj: null }
  return { naslov: m[1].trim() || null, posta: m[2], kraj: m[3].trim() }
}

export function razcleniVrsticoPO(v: string): Zavezanec | null {
  const davcna = v.slice(4, 12)
  if (!/^\d{8}$/.test(davcna)) return null
  const ime = v.slice(42, 142).trim()
  if (!ime) return null
  return {
    davcna,
    maticna: prazno(v.slice(13, 23)),
    ime,
    ...razcleniNaslov(v.slice(143, 257)),
    skd: prazno(v.slice(35, 41)),
    vrsta: 'PO',
    ddv: v[2] === '*',
    fu: prazno(v.slice(257, 259)),
  }
}

export function razcleniVrsticoDEJ(v: string): Zavezanec | null {
  const davcna = v.slice(0, 8)
  if (!/^\d{8}$/.test(davcna)) return null
  const ime = v.slice(27, 264).trim()
  if (!ime) return null
  return {
    davcna,
    maticna: prazno(v.slice(9, 19)),
    ime,
    ...razcleniNaslov(v.slice(308, 422)),
    skd: prazno(v.slice(20, 26)),
    vrsta: 'DEJ',
    ddv: null,
    fu: prazno(v.slice(422, 424)),
  }
}

/**
 * Dvojniki v DEJ (637 davcnih stevilk, 6.10.2026): ista oseba z dvema
 * registracijama in razlicnima maticnima, npr. "ANDREJ VERNIK - SAMOZAPOSLENI
 * V KULTURI" in "ARHITEKTURA ..., ANDREJ VERNIK S.P.". Obdrzimo registracijo
 * s "S.P." (to ime podjetnik uporablja na racunih), sicer prvo.
 */
export function izberiMedDvojniki(a: Zavezanec, b: Zavezanec): Zavezanec {
  const sp = (z: Zavezanec) => /\bS\.P\.(?:\s|,|$)/.test(z.ime)
  if (sp(b) && !sp(a)) return b
  return a
}

/** Celotna datoteka -> zavezanci (vrstice, ki se ne razclenijo, so preskocene in presteti). */
export function razcleniDatoteko(besedilo: string, vrsta: VrstaZavezanca): { zavezanci: Zavezanec[]; preskoceno: number } {
  const fn = vrsta === 'PO' ? razcleniVrsticoPO : razcleniVrsticoDEJ
  const zavezanci: Zavezanec[] = []
  let preskoceno = 0
  for (const vrstica of besedilo.split(/\r?\n/)) {
    if (!vrstica.trim()) continue
    const z = fn(vrstica)
    if (z) zavezanci.push(z)
    else preskoceno++
  }
  return { zavezanci, preskoceno }
}

// Berljiv zapis imen in naslovov je v lib/berljivo-ime.ts (uporablja ga tudi
// odjemalec – Nastavitve, brez node:zlib).

// ───────────────────────── zip ─────────────────────────

/**
 * Razpakira PRVO datoteko iz zipa (FURS zip vsebuje eno .txt datoteko).
 * Brez knjiznice: osrednji imenik -> lokalna glava -> inflateRaw (metoda 8)
 * ali shranjeno (metoda 0). Velikosti bere iz osrednjega imenika, ker jih
 * lokalna glava pri pretakanju lahko nima.
 */
export async function razpakirajPrvo(zip: Uint8Array): Promise<{ ime: string; vsebina: Uint8Array }> {
  const { inflateRawSync } = await import('node:zlib')
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  let eocd = -1
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Datoteka ni veljaven zip (ni konca imenika).')
  const cd = dv.getUint32(eocd + 16, true)
  if (dv.getUint32(cd, true) !== 0x02014b50) throw new Error('Zip: neveljaven osrednji imenik.')
  const metoda = dv.getUint16(cd + 10, true)
  const stisnjeno = dv.getUint32(cd + 20, true)
  const dolzinaImena = dv.getUint16(cd + 28, true)
  const lokalna = dv.getUint32(cd + 42, true)
  const ime = new TextDecoder().decode(zip.subarray(cd + 46, cd + 46 + dolzinaImena))
  if (dv.getUint32(lokalna, true) !== 0x04034b50) throw new Error('Zip: neveljavna lokalna glava.')
  const zacetek = lokalna + 30 + dv.getUint16(lokalna + 26, true) + dv.getUint16(lokalna + 28, true)
  const podatki = zip.subarray(zacetek, zacetek + stisnjeno)
  if (metoda === 0) return { ime, vsebina: podatki }
  if (metoda !== 8) throw new Error(`Zip: nepodprta metoda stiskanja ${metoda}.`)
  return { ime, vsebina: new Uint8Array(inflateRawSync(podatki)) }
}

// ───────────────────────── uvoz ─────────────────────────

export const VIRI_FURS: Record<VrstaZavezanca, string> = {
  PO: 'http://datoteke.durs.gov.si/DURS_zavezanci_PO.zip',
  DEJ: 'http://datoteke.durs.gov.si/DURS_zavezanci_DEJ.zip',
}

/** Najmanj vrstic, da datoteko stejemo za celo (6.10.2026: PO 145.360, DEJ 139.150). */
export const NAJMANJ_VRSTIC = 100_000
const PAKET = 2000
const VZPOREDNO = 4

export interface IzidUvoza {
  osvezeno: string
  po: { vrstic: number; preskoceno: number }
  dej: { vrstic: number; preskoceno: number; dvojnikov: number }
  zapisano: number
  izbrisano: number
  trajanje_ms: Record<string, number>
  pomnilnik_mb: number
}

type Prenesi = (url: string) => Promise<Uint8Array>

async function preberiVir(vrsta: VrstaZavezanca, prenesi: Prenesi) {
  const zip = await prenesi(VIRI_FURS[vrsta])
  const { vsebina } = await razpakirajPrvo(zip)
  const r = razcleniDatoteko(new TextDecoder('utf-8').decode(vsebina), vrsta)
  const skupaj = r.zavezanci.length + r.preskoceno
  if (r.zavezanci.length < NAJMANJ_VRSTIC) throw new Error(`${vrsta}: samo ${r.zavezanci.length} zavezancev – datoteka ni cela, uvoz prekinjen.`)
  if (r.preskoceno > skupaj * 0.01) throw new Error(`${vrsta}: ${r.preskoceno} od ${skupaj} vrstic se ne razcleni – oblika datoteke se je morda spremenila, uvoz prekinjen.`)
  return r
}

/**
 * Uvoz obeh datotek v register_zavezancev.
 *
 * VARNOST PODATKOV: vse vrstice dobijo isti `osvezeno`. Stare vrstice
 * (osvezeno < zacetek) se izbrisejo SELE, ko sta oba uvoza uspela in je v
 * tabeli toliko svezih vrstic, kot jih je bilo poslanih. Ob kakrsni koli
 * napaki (prenos, oblika, zapis) funkcija vrze napako in ne izbrise nicesar.
 */
export async function uvoziRegister(db: any, prenesi: Prenesi, zdaj = new Date()): Promise<IzidUvoza> {
  const t: Record<string, number> = {}
  let mera = Date.now()
  const korak = (ime: string) => { const n = Date.now(); t[ime] = n - mera; mera = n }
  const osvezeno = zdaj.toISOString()

  const po = await preberiVir('PO', prenesi); korak('po_prenos_razclenitev')
  const dej = await preberiVir('DEJ', prenesi); korak('dej_prenos_razclenitev')

  const vsi = new Map<string, Zavezanec>()
  for (const z of po.zavezanci) vsi.set(z.davcna, z)
  let dvojnikov = 0
  for (const z of dej.zavezanci) {
    const obstojec = vsi.get(z.davcna)
    if (!obstojec) { vsi.set(z.davcna, z); continue }
    dvojnikov++
    // PO ima prednost (v podatkih 6.10.2026 se PO in DEJ ne prekrivata).
    if (obstojec.vrsta === 'DEJ') vsi.set(z.davcna, izberiMedDvojniki(obstojec, z))
  }
  const vrstice = [...vsi.values()].map(z => ({ ...z, osvezeno }))
  korak('dvojniki')

  const paketi: (typeof vrstice)[] = []
  for (let i = 0; i < vrstice.length; i += PAKET) paketi.push(vrstice.slice(i, i + PAKET))
  let naslednji = 0
  const delavec = async () => {
    while (naslednji < paketi.length) {
      const paket = paketi[naslednji++]
      const { error } = await db.from('register_zavezancev').upsert(paket, { onConflict: 'davcna' })
      if (error) throw new Error('Zapis v register_zavezancev ni uspel: ' + error.message)
    }
  }
  await Promise.all(Array.from({ length: VZPOREDNO }, delavec))
  korak('zapis')

  // Preverba pred brisanjem: vse poslane vrstice morajo biti v tabeli s tem `osvezeno`.
  const { count, error: cErr } = await db.from('register_zavezancev')
    .select('davcna', { count: 'exact', head: true }).gte('osvezeno', osvezeno)
  if (cErr) throw new Error('Preverba po uvozu ni uspela: ' + cErr.message)
  if ((count ?? 0) < vrstice.length) throw new Error(`Po uvozu je svezih vrstic ${count}, poslanih ${vrstice.length} – starih ne brisem.`)

  const { count: izbrisano, error: dErr } = await db.from('register_zavezancev')
    .delete({ count: 'exact' }).lt('osvezeno', osvezeno)
  if (dErr) throw new Error('Brisanje zastarelih vrstic ni uspelo: ' + dErr.message)
  korak('brisanje')

  return {
    osvezeno,
    po: { vrstic: po.zavezanci.length, preskoceno: po.preskoceno },
    dej: { vrstic: dej.zavezanci.length, preskoceno: dej.preskoceno, dvojnikov },
    zapisano: vrstice.length,
    izbrisano: izbrisano ?? 0,
    trajanje_ms: t,
    pomnilnik_mb: Math.round(process.memoryUsage().rss / 1e6),
  }
}

// ───────────────────────── iskanje (/api/company-lookup) ─────────────────────────

/** Casovna omejitev vsakega zunanjega klica pri iskanju. */
export const OMEJITEV_KLICA_MS = 5000
export const VIES_URL = (davcna: string) => `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/SI/vat/${davcna}`

/**
 * Odgovor /api/company-lookup. Polja dolgo_ime, naslov, pošta in
 * transakcijski_računi ohranjajo obliko nekdanjega slo-podjetja-api (klicatelji
 * jih ze berejo). dolgo_ime je URADNO ime (velike crke, za primerjavo z
 * uradnim imenom), ime_berljivo je predlog za vnos na racun.
 */
export interface PodatkiPodjetja {
  davcna: string
  dolgo_ime: string
  ime_berljivo: string
  naslov: string | null
  'pošta': string | null
  transakcijski_računi: null
  maticna: string | null
  ddv: boolean | null
  vir: 'FURS' | 'VIES'
  osvezeno: string | null
}

function sestavi(z: { davcna: string; ime: string; naslov: string | null; posta: string | null; kraj: string | null; maticna: string | null; ddv: boolean | null }, vir: 'FURS' | 'VIES', osvezeno: string | null): PodatkiPodjetja {
  return {
    davcna: z.davcna,
    dolgo_ime: z.ime,
    ime_berljivo: berljivoIme(z.ime),
    naslov: berljivNaslov(z.naslov),
    'pošta': z.posta ? [z.posta, berljivNaslov(z.kraj, true)].filter(Boolean).join(' ') : null,
    transakcijski_računi: null,
    maticna: z.maticna,
    ddv: z.ddv,
    vir,
    osvezeno,
  }
}

/** VIES (samo zavezanci za DDV). null = ni najden, ni veljaven ali VIES ne odgovori v 5 s. */
export async function poisciVies(davcna: string, fetchFn: typeof fetch = fetch): Promise<PodatkiPodjetja | null> {
  try {
    const res = await fetchFn(VIES_URL(davcna), {
      headers: { Accept: 'application/json', 'User-Agent': 'Racunko/1.0' },
      signal: AbortSignal.timeout(OMEJITEV_KLICA_MS),
    })
    if (!res.ok) return null
    const d: any = await res.json()
    const ime = typeof d?.name === 'string' ? d.name.replace(/\s+/g, ' ').trim() : ''
    if (d?.isValid !== true || !ime || ime === '---') return null
    const naslov = typeof d.address === 'string' ? d.address.replace(/\s*\n\s*/g, ', ') : ''
    return sestavi({ davcna, ime, ...razcleniNaslov(naslov), maticna: null, ddv: true }, 'VIES', new Date().toISOString())
  } catch {
    return null
  }
}

/**
 * Najprej register FURS (tabela register_zavezancev, service role), sicer VIES.
 * Napaka baze se vrze (klicatelj vrne 500); "ni najdeno" je null.
 */
export async function poisciPodjetje(davcna: string, odv: { db: any; fetchFn?: typeof fetch }): Promise<PodatkiPodjetja | null> {
  const { data, error } = await odv.db.from('register_zavezancev')
    .select('davcna, maticna, ime, naslov, posta, kraj, ddv, osvezeno')
    .eq('davcna', davcna).maybeSingle()
  if (error) throw new Error('Branje registra zavezancev ni uspelo: ' + error.message)
  if (data) return sestavi(data, 'FURS', data.osvezeno)
  return poisciVies(davcna, odv.fetchFn ?? fetch)
}
