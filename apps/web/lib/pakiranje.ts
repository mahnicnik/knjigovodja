/**
 * PAKIRANJE NA DOBAVNICI -> ENOTA ZALOGE (7.10.2026)
 *
 * TEZAVA: dobavnica pove, koliko PAKIRANJ je prislo ("1 sod", "1 paket"),
 * zaloga pa se vodi v ENOTAH, ki se porabljajo (L piva, vrecke caja).
 * Uvoz je kolicino in ceno prenesel 1 : 1 - sod 20 L za 40 EUR je v zalogo
 * prinesel "+1" in nabavno ceno 40 EUR, namesto +20 L po 2,00 EUR/L.
 *
 * RESITEV: vsaka vrstica dobi VSEBINO PAKIRANJA, izrazeno v enoti zaloge
 * ciljne surovine/artikla:
 *   zaloga    += kolicina x vsebina
 *   nabavna    = neto cena pakiranja / vsebina
 * Predlog vsebine (po prednosti): shranjena pretvorba za ta artikel
 * dobavitelja > podatek, ki ga je prebral AI > razbrano iz naziva > 1.
 * Uporabnik ga ob potrditvi lahko popravi.
 */

export type Pretvorba = { vsebina: number; vir: 'shranjeno' | 'ai' | 'naziv' | 'privzeto' }

type Vrsta = 'volumen' | 'masa' | 'kos'

/** Enote volumna in mase v osnovni enoti (L, kg). Vse drugo so kosi. */
const VOLUMEN: Record<string, number> = { ml: 0.001, cl: 0.01, dl: 0.1, l: 1 }
const MASA: Record<string, number> = { g: 0.001, dag: 0.01, kg: 1 }

function normEnota(e: string | null | undefined): string {
  return String(e ?? '').trim().toLowerCase().replace(/\.$/, '')
}

/** Vrsta enote; '0.5L' ipd. (artikel = ena steklenica) je KOS. */
export function vrstaEnote(e: string | null | undefined): Vrsta {
  const n = normEnota(e)
  if (n in VOLUMEN || n === 'lit' || n === 'liter') return 'volumen'
  if (n in MASA) return 'masa'
  return 'kos'
}

function faktor(e: string): number {
  const n = normEnota(e)
  if (n === 'lit' || n === 'liter') return 1
  return VOLUMEN[n] ?? MASA[n] ?? 1
}

/** Pretvori vrednost med enotama iste vrste; null, ce vrsti nista enaki. */
export function pretvoriEnoto(vrednost: number, iz: string | null | undefined, v: string | null | undefined): number | null {
  const a = vrstaEnote(iz), b = vrstaEnote(v)
  if (a !== b) return null
  if (a === 'kos') return vrednost
  return (vrednost * faktor(String(iz))) / faktor(String(v))
}

const st = (s: string) => Number(String(s).replace(',', '.'))

/**
 * Iz naziva razbere vsebino pakiranja v ciljni enoti, npr.
 *   "SOD LASKO 20L"           -> L: 20         kos: 1
 *   "VINO 6x0,75L"            -> L: 4.5        kos: 6
 *   "CAJ META 20/1", "x20"    -> kos: 20
 *   "KAVA 1 KG"               -> kg: 1, g: 1000
 * Vrne null, ce iz naziva ni mogoce razbrati nic smiselnega.
 */
export function vsebinaIzNaziva(naziv: string | null | undefined, ciljnaEnota: string | null | undefined): number | null {
  const t = String(naziv ?? '').toLowerCase().replace(/×/g, 'x')
  const cilj = vrstaEnote(ciljnaEnota)

  // stevilo kosov v pakiranju
  let kosov: number | null = null
  const nx = /(\d+)\s*x\s*\d/.exec(t)                          // 6x0,75l
  const xn = /(?:^|\s)x\s*(\d+)(?!\s*[.,]?\d*\s*(?:ml|cl|dl|l|g|kg)\b)/.exec(t) // x20
  const na1 = /(\d+)\s*\/\s*1\b/.exec(t)                        // 20/1
  const nkos = /(\d+)\s*(?:kos|kom|vrec\w*|vreč\w*|kapsul\w*|kos\.)\b/.exec(t)
  for (const m of [nx, na1, xn, nkos]) { if (m) { kosov = Number(m[1]); break } }

  // kolicina ene enote (zadnja mera v nazivu: "6x0,75L" -> 0,75 L)
  let mera: { vrednost: number; enota: string } | null = null
  const re = /(\d+(?:[.,]\d+)?)\s*(ml|cl|dl|l|kg|dag|g)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) mera = { vrednost: st(m[1]), enota: m[2] }

  if (cilj === 'kos') return kosov && kosov > 1 ? kosov : null
  if (!mera || vrstaEnote(mera.enota) !== cilj) return null
  const naKos = pretvoriEnoto(mera.vrednost, mera.enota, ciljnaEnota)
  if (naKos == null || !(naKos > 0)) return null
  return zaokrozi((kosov || 1) * naKos, 4)
}

function zaokrozi(n: number, dec: number): number {
  const f = 10 ** dec
  return Math.round((n + Number.EPSILON) * f) / f
}

/**
 * Predlog vsebine za vrstico dobavnice v enoti zaloge `ciljnaEnota`.
 * `ai` je par, ki ga je prebral AI (vsebina_pakiranja + enota_vsebine).
 */
export function predlagajVsebino(opts: {
  naziv?: string | null
  ai?: { vsebina?: number | null; enota?: string | null }
  shranjeno?: number | null
  ciljnaEnota?: string | null
}): Pretvorba {
  if (opts.shranjeno && opts.shranjeno > 0) return { vsebina: opts.shranjeno, vir: 'shranjeno' }
  const aiV = Number(opts.ai?.vsebina)
  if (aiV > 0) {
    const v = pretvoriEnoto(aiV, opts.ai?.enota || 'kos', opts.ciljnaEnota || 'kos')
    if (v != null && v > 0 && !(v === 1 && vrstaEnote(opts.ciljnaEnota) === 'kos' && aiV === 1)) {
      return { vsebina: zaokrozi(v, 4), vir: 'ai' }
    }
  }
  const izNaziva = vsebinaIzNaziva(opts.naziv, opts.ciljnaEnota)
  if (izNaziva && izNaziva > 0) return { vsebina: izNaziva, vir: 'naziv' }
  return { vsebina: 1, vir: 'privzeto' }
}

/** Kolicina za zalogo in nabavna cena na enoto zaloge. */
export function preracunaj(kolicina: number, netoCenaPakiranja: number | null | undefined, vsebina: number) {
  const v = Number(vsebina) > 0 ? Number(vsebina) : 1
  const zaloga = zaokrozi((Number(kolicina) || 0) * v, 3)
  const cena = netoCenaPakiranja != null && Number(netoCenaPakiranja) > 0
    ? zaokrozi(Number(netoCenaPakiranja) / v, 4)
    : null
  return { zaloga, cenaNaEnoto: cena }
}

/**
 * Kljuc za pomnjenje pretvorbe: po EAN/sifri, sicer po nazivu in dobavitelju.
 * Pomni se po ARTIKLU DOBAVITELJA, ne po surovini - ista surovina lahko pride
 * v sodu po 20 L ali po 30 L.
 */
export function kljucPretvorbe(a: { ean?: string | null; sku?: string | null; naziv?: string | null }, dobavitelj?: string | null): string | null {
  const koda = String(a.ean || a.sku || '').trim()
  if (koda) return 'koda:' + koda
  const ime = String(a.naziv || '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!ime) return null
  const dob = String(dobavitelj || '').trim().toLowerCase().replace(/\s+/g, ' ')
  return 'naziv:' + dob + '|' + ime
}

/** Prikaz stevila brez odvecnih nicel: 20 -> "20", 2.5 -> "2,5". */
export function stevilo(n: number): string {
  return String(zaokrozi(n, 3)).replace('.', ',')
}
