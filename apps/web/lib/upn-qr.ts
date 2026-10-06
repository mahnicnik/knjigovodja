/**
 * UPN QR – vsebina plačilne QR kode na računih (hotfix 5.10.2026)
 * ════════════════════════════════════════════════════════════════
 *
 * Po tehničnem standardu ZBS »UPN QR«
 * (https://www.zbs-giz.si/wp-content/uploads/2021/10/EN_Tehnicni_standard_UPN_QR.pdf):
 *  - 20 polj; za VSAKIM poljem, tudi za 20. (kontrolno vsoto), je LF (0x0A),
 *  - kontrolna vsota = vsota dolžin polj 1–19 skupaj z njihovimi LF,
 *  - besedila v ISO 8859-2, brez vodilnih in končnih presledkov,
 *  - IBAN in sklic (model + sklic) brez presledkov,
 *  - največ 411 znakov.
 * Sliko (verzija 15, ECC M, ECI 000004) izriše bwip-js z upnBwipOpcije:
 * na strežniku lib/upn-qr-slika.ts, v brskalniku app/prispevki.
 *
 * ZAKAJ (5.10.2026): plačnik pri Intesa Sanpaolo je ob skeniranju računa
 * dobil »NI UJEMANJA«. To je preverjanje prejemnika plačila (Verification of
 * Payee), ki ga banke v EU izvajajo od 9. 10. 2025: ime prejemnika iz QR kode
 * primerjajo z uradnim imenom imetnika računa (register AJPES). Računko je:
 *  1. ime prejemnika REZAL na 33 znakov – »Zdravstvene in druge storitve,
 *     Domen Eržen s.p.« je v kodi postal »Zdravstvene in druge storitve, Do«.
 *     Standard v QR kodi dovoli celo ime (njegov lastni primer ima 34 znakov);
 *     33 je omejitev natisnjenega obrazca, ne kode.
 *  2. vpisal ime iz Nastavitev, tudi ko se razlikuje od uradnega (»Domen
 *     Kocjan s.p.« namesto »HFP, Domen Kocjan s.p.«) – na to zdaj opozori
 *     Nastavitve → Profil podjetja (glej soUradnoIme spodaj).
 *  3. izpustil oznako ECI – aplikacije, ki se je držijo, so č/š/ž prebrale
 *     kot è/¹/¾ in imena spet niso ujemala,
 *  4. izpustil LF za kontrolno vsoto in izrisal kodo poljubne verzije.
 * Prej je bila koda sestavljena v lib/invoice-pdf.tsx (generateUpnQr).
 */

/** Bajti 0xA0–0xFF kodne tabele ISO 8859-2 (izpisano iz Pythonovega kodeka). */
const LATIN2_ZGORNJA =
  '\u00A0\u0104\u02D8\u0141\u00A4\u013D\u015A\u00A7\u00A8\u0160\u015E\u0164\u0179\u00AD\u017D\u017B' +
  '\u00B0\u0105\u02DB\u0142\u00B4\u013E\u015B\u02C7\u00B8\u0161\u015F\u0165\u017A\u02DD\u017E\u017C' +
  '\u0154\u00C1\u00C2\u0102\u00C4\u0139\u0106\u00C7\u010C\u00C9\u0118\u00CB\u011A\u00CD\u00CE\u010E' +
  '\u0110\u0143\u0147\u00D3\u00D4\u0150\u00D6\u00D7\u0158\u016E\u00DA\u0170\u00DC\u00DD\u0162\u00DF' +
  '\u0155\u00E1\u00E2\u0103\u00E4\u013A\u0107\u00E7\u010D\u00E9\u0119\u00EB\u011B\u00ED\u00EE\u010F' +
  '\u0111\u0144\u0148\u00F3\u00F4\u0151\u00F6\u00F7\u0159\u016F\u00FA\u0171\u00FC\u00FD\u0163\u02D9'

const V_LATIN2 = new Map<string, number>()
for (let i = 0; i < LATIN2_ZGORNJA.length; i++) V_LATIN2.set(LATIN2_ZGORNJA[i], 0xA0 + i)

/** Pogosti znaki, ki jih ISO 8859-2 nima (Word, kopiranje s spleta). */
const NADOMESTKI: Record<string, string> = {
  '\u00A0': ' ', '\u00AD': '',
  '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2013': '-', '\u2014': '-', '\u2212': '-',
  '\u2018': "'", '\u2019': "'", '\u201A': "'", '\u2032': "'",
  '\u201C': '"', '\u201D': '"', '\u201E': '"', '\u00AB': '"', '\u00BB': '"',
  '\u2026': '...', '\u20AC': 'EUR', '\u2022': '-',
}

const jeAscii = (z: string) => { const k = z.codePointAt(0)!; return k >= 0x20 && k <= 0x7E }

/** Besedilo v znakih, ki jih pozna ISO 8859-2; drugo nadomesti ali odstrani strešice. */
function vZnakeLatin2(s: string): string {
  let out = ''
  for (const z of s) {
    if (NADOMESTKI[z] !== undefined) { out += NADOMESTKI[z]; continue }
    if (jeAscii(z) || V_LATIN2.has(z)) { out += z; continue }
    // npr. "à", "ñ" -> "a", "n" (osnovna črka obstaja, strešice ni v tabeli)
    const brez = z.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    out += brez && [...brez].every(c => jeAscii(c) || V_LATIN2.has(c)) ? brez : '?'
  }
  return out
}

/**
 * Besedilno polje UPN QR: brez prelomov vrstic (LF bi zamaknil vsa naslednja
 * polja – banka javi napačno strukturo), brez dvojnih, vodilnih in končnih
 * presledkov, v znakih ISO 8859-2, največ `max` znakov, rezano pri presledku.
 */
export function upnBesedilo(v: unknown, max: number): string {
  const s = vZnakeLatin2(String(v ?? '').replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
  if (s.length <= max) return s
  const pri = s.slice(0, max + 1).lastIndexOf(' ')
  return (pri >= Math.floor(max / 2) ? s.slice(0, pri) : s.slice(0, max)).trim()
}

/** Ostanek po modulu 97 za niz števk in črk (črka = 10..35), kot pri IBAN/RF. */
function mod97(s: string): number {
  let ost = 0
  for (const c of s) {
    const n = /\d/.test(c) ? c : String(c.charCodeAt(0) - 55)
    for (const d of n) ost = (ost * 10 + Number(d)) % 97
  }
  return ost
}

export function ocistiIban(iban: unknown): string {
  return String(iban ?? '').replace(/\s/g, '').toUpperCase()
}

/** IBAN s pravilno kontrolno vsoto (slovenski ima natanko 19 znakov). */
export function veljavenIban(iban: unknown): boolean {
  const s = ocistiIban(iban)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false
  if (s.startsWith('SI') && s.length !== 19) return false
  return mod97(s.slice(4) + s.slice(0, 4)) === 1
}

/**
 * Sklic (model + sklic, brez presledkov) po pravilih SI in RF.
 * SI: do 3 deli iz števk, ločeni z vezajem, skupaj do 20 števk (22 znakov).
 * RF: kontrolni števki po modulu 97. »SI99« pomeni plačilo brez sklica.
 */
export function veljavenSklic(sklic: string): boolean {
  if (sklic === 'SI99') return true
  const si = /^SI\d{2}([0-9-]{1,22})$/.exec(sklic)
  if (si) {
    const deli = si[1].split('-')
    return deli.length <= 3 && deli.every(d => /^\d+$/.test(d)) && deli.join('').length <= 20
  }
  const rf = /^RF(\d{2})([0-9A-Z]{1,21})$/.exec(sklic)
  return !!rf && mod97(rf[2] + 'RF' + rf[1]) === 1
}

/**
 * Sklic za QR: shranjen sklic, če je veljaven; sicer SI00 + številka računa
 * (»SI00 2026-137«); če niti to ni veljavno (številka s črkami, npr.
 * »HFP1-RACUNKO01-3«), SI99 – banka bi sklic s črkami zavrnila. Številka
 * računa je v tem primeru še vedno v namenu plačila.
 */
export function upnSklic(sklic: unknown, stevilkaRacuna?: unknown): string {
  const kandidati = [sklic, stevilkaRacuna ? `SI00${stevilkaRacuna}` : null]
  for (const k of kandidati) {
    const s = String(k ?? '').replace(/\s/g, '').toUpperCase()
    if (s && veljavenSklic(s)) return s
  }
  return 'SI99'
}

/** »2026-10-16« (ali ISO čas) -> »16.10.2026«; brez pretvorbe časovnih pasov. */
export function upnDatum(datum: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(datum ?? ''))
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ''
}

/** Ime prejemnika: celo uradno ime, kot ga preverja banka (VoP); 70 = največ v SEPA nalogu. */
export const UPN_MAKS_IME_PREJEMNIKA = 70
/** Polja natisnjenega obrazca UPN. */
export const UPN_MAKS_NASLOV = 33
export const UPN_MAKS_NAMEN = 42
export const UPN_MAKS_ZNAKOV = 411

export type UpnQrVhod = {
  placnikIme?: unknown
  placnikUlica?: unknown
  placnikKraj?: unknown
  /** v evrih */
  znesek: number
  /** 4 velike črke; privzeto OTHR */
  kodaNamena?: string
  namen: string
  /** YYYY-MM-DD */
  rokPlacila?: unknown
  ibanPrejemnika: unknown
  sklic?: unknown
  /** za sklic SI00 + številka, če sklica ni */
  stevilkaRacuna?: unknown
  prejemnikIme: unknown
  prejemnikUlica?: unknown
  prejemnikKraj?: unknown
}

export type UpnQrRezultat = { ok: true; vsebina: string } | { ok: false; razlog: string }

/** Vsebina UPN QR kode po standardu (20 polj, vsako z LF) ali razlog, zakaj je ni. */
export function sestaviUpnQr(v: UpnQrVhod): UpnQrRezultat {
  const iban = ocistiIban(v.ibanPrejemnika)
  if (!iban) return { ok: false, razlog: 'manjka IBAN prejemnika' }
  if (!veljavenIban(iban)) return { ok: false, razlog: `neveljaven IBAN prejemnika (${iban})` }

  const centi = Math.round(Number(v.znesek) * 100)
  if (!Number.isFinite(centi) || centi <= 0) return { ok: false, razlog: 'znesek ni pozitiven' }
  if (centi > 99_999_999_999) return { ok: false, razlog: 'znesek je prevelik za UPN' }

  const prejemnik = upnBesedilo(v.prejemnikIme, UPN_MAKS_IME_PREJEMNIKA)
  if (!prejemnik) return { ok: false, razlog: 'manjka ime prejemnika' }

  const koda = /^[A-Z]{4}$/.test(String(v.kodaNamena ?? '')) ? String(v.kodaNamena) : 'OTHR'

  const polja = [
    'UPNQR',                                     //  1 vodilni slog
    '',                                          //  2 IBAN plačnika
    '',                                          //  3 polog
    '',                                          //  4 dvig
    '',                                          //  5 referenca plačnika
    upnBesedilo(v.placnikIme, UPN_MAKS_NASLOV),  //  6 ime plačnika
    upnBesedilo(v.placnikUlica, UPN_MAKS_NASLOV),//  7 ulica plačnika
    upnBesedilo(v.placnikKraj, UPN_MAKS_NASLOV), //  8 kraj plačnika
    String(centi).padStart(11, '0'),             //  9 znesek
    '',                                          // 10 datum plačila
    '',                                          // 11 nujno
    koda,                                        // 12 koda namena
    upnBesedilo(v.namen, UPN_MAKS_NAMEN),        // 13 namen plačila
    upnDatum(v.rokPlacila),                      // 14 rok plačila
    iban,                                        // 15 IBAN prejemnika
    upnSklic(v.sklic, v.stevilkaRacuna),         // 16 referenca prejemnika
    prejemnik,                                   // 17 ime prejemnika
    upnBesedilo(v.prejemnikUlica, UPN_MAKS_NASLOV), // 18 ulica prejemnika
    upnBesedilo(v.prejemnikKraj, UPN_MAKS_NASLOV),  // 19 kraj prejemnika
  ]
  const vsota = polja.reduce((s, p) => s + p.length + 1, 0)
  const vsebina = polja.map(p => p + '\n').join('') + String(vsota).padStart(3, '0') + '\n'
  if (vsebina.length > UPN_MAKS_ZNAKOV) return { ok: false, razlog: 'vsebina je daljša od 411 znakov' }
  return { ok: true, vsebina }
}

/** Vsebina (že v znakih ISO 8859-2, glej upnBesedilo) kot bajti ISO 8859-2. */
export function vBajteLatin2(s: string): Uint8Array {
  const out: number[] = []
  for (const z of s) {
    const k = z.codePointAt(0)!
    out.push(k < 0xA0 ? k : (V_LATIN2.get(z) ?? 0x3F))
  }
  return Uint8Array.from(out)
}

/**
 * Možnosti za bwip-js (isti na strežniku – toBuffer – in v brskalniku – toSVG).
 *
 * Standard UPN QR predpisuje: QR verzija 15 (77 × 77) NE GLEDE na količino
 * podatkov, ECC M, bajtni način, ISO 8859-2 z oznako ECI 000004. Knjižnica
 * `qrcode` oznake ECI ne zna zapisati, zato bwip-js:
 *  - binarytext: vsak znak niza je en bajt (sicer bi ga pretvoril v UTF-8),
 *  - parsefnc: »^ECI000004« je oznaka ECI, ne besedilo; znak ^ v podatkih
 *    je zato zapisan kot »^^«,
 *  - fixedeclevel: brez tega bwip-js pri verziji 15 sam dvigne ECC na H.
 * Preverjeno z dekodiranjem (zxing): verzija 15, ECC M, »č« se prebere kot
 * »č« (brez ECI ga aplikacija prebere kot »è«).
 */
export function upnBwipOpcije(vsebina: string, merilo = 3) {
  let bajti = ''
  for (const b of vBajteLatin2(vsebina)) bajti += b === 0x5E ? '^^' : String.fromCharCode(b)
  return {
    bcid: 'qrcode',
    text: '^ECI000004' + bajti,
    binarytext: true,
    parsefnc: true,
    version: '15',
    eclevel: 'M',
    fixedeclevel: true,
    scale: merilo,
    paddingwidth: 4,
    paddingheight: 4,
    backgroundcolor: 'FFFFFF',
  }
}

/**
 * Ali se ime v Računku ujema z uradnim imenom iz registra (ne glede na
 * velikost črk, presledke in ločila). Banke ime prejemnika preverjajo
 * proti uradnemu imenu – neujemanje plačnik vidi kot »Ni ujemanja«.
 */
export function soUradnoIme(ime: unknown, uradno: unknown): boolean {
  const n = (s: unknown) => String(s ?? '').toLocaleLowerCase('sl').replace(/[\s.,;:'"„“”-]+/g, '')
  return n(ime) === n(uradno)
}
