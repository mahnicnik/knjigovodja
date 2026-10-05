/**
 * IZRAČUN DDV OBVEZNOSTI — EN SAM VIR RESNICE
 * ═══════════════════════════════════════════
 *
 * ZAKAJ: do revizije (oktober 2026, najdba K1) je DDV računala vsaka stran po
 * svoje. Za isto obdobje (ŠIRM, Q3 2026) so strani kazale 1.778,22 (nadzorna
 * plošča, /ddv), 1.789,22 (/ddv/evidenca), −474,69 (/porocila, /letni-pregled)
 * in −463,69 (izvoz, /api/v1/stats). Razlika je bil POS promet in DDV iz KPO,
 * ki ga je ena stran upoštevala, druga ne.
 *
 * Zdaj DDV računa SAMO ta modul. Strani le prikazujejo rezultat.
 *
 * VIRI (za obdobje [od, do], vkljucno):
 *
 *   IZSTOPNI DDV
 *   · izdani racuni (issued_invoices, po issue_date) — razclenitev po stopnjah
 *     iz postavk (line_items[].vat_rate); glava racuna stolpca vat_rate NIMA.
 *     Zneski glave (amount_net, vat_amount) ostanejo merodajni — postavke dolocijo
 *     le razdelitev po stopnjah. Osnutki in predstavitveni (DEMO) racuni ne stejejo.
 *   · POS blagajna (orders, po LOKALNEM datumu) — DDV po stopnji iz vrstic
 *     narocila, zaokrozen PO RACUNU in stopnji (tako, kot je bil prijavljen
 *     FURS-u). Popust na racunu se uposteva sorazmerno, napitnina ni obdavcena,
 *     unovcenje karte obiskov (placilo 'pkg') ni nov promet. Racun steje na dan
 *     izdaje, storno (−) na dan storna, vracilo (−) na dan vracila (V4). Izracun
 *     je ISTI kot za dnevne KPO vnose (lib/pos-kpo.ts).
 *     KPO povzetki blagajne (pos_prodaja, pos_storitve, POS promet) se zato NE
 *     stejejo — sicer bi bil promet stet dvakrat, njihov datum pa je datum
 *     zakljucka izmene in ne datum prodaje (najdba K5).
 *   · KPO prihodki brez povezanega racuna (banka, kartice, stara /blagajna,
 *     spletne trgovine) — po vat_rate; ce ga ni, se stopnja izpelje iz zneskov.
 *
 *   VSTOPNI DDV
 *   · prejeti racuni (receipts, po receipt_date)
 *   · KPO vnosi brez povezanega prejetega racuna, ki NOSIJO vstopni DDV.
 *     Vnosi brez DDV (place, amortizacija, bancni odlivi brez razclenitve) niso
 *     nabave z DDV in ne gredo v osnovo nabav.
 *
 *   OBVEZNOST = izstopni − vstopni. Negativna vrednost pomeni VRAČILO DDV in se
 *   NE skrije (nobenega Math.max(0, …)).
 */

import { lokalniDatum } from '@/lib/tax-constants'
import { razcleniPrejetRacun } from '@/lib/prejeti-ddv'
import { izracunajPosKnjizbe, razcleniRacun, lokalniDan, niPromet, IZBOR_NAROCILA, type PosNarocilo, type PosVracilo } from '@/lib/pos-kpo'

// ───────────────────────────── tipi ─────────────────────────────

export type Stopnja = '22' | '9.5' | '5' | '0' | 'drugo'
export const STOPNJE: readonly Stopnja[] = ['22', '9.5', '5', '0', 'drugo'] as const
/** Stopnje DDV, ki jih pozna slovenski ZDDV-1 (splosna, dve znizani, oprosceno). */
export const ZNANE_STOPNJE = [22, 9.5, 5, 0] as const

export type Postavka = { osnova: number; ddv: number }
export type PoStopnjah = Record<Stopnja, Postavka>

export type DdvObdobje =
  | { leto: number; cetrtletje: 1 | 2 | 3 | 4 }
  | { leto: number; mesec: number }
  | { leto: number }
  | { od: string; do: string }

export type VatPeriod = 'monthly' | 'quarterly'

export interface DdvRezultat {
  od: string
  do: string
  oznaka: string
  izstopniDdv: {
    izdaniRacuni: PoStopnjah
    kpo: PoStopnjah
    blagajna: PoStopnjah
    poStopnjah: PoStopnjah
    osnovaSkupaj: number
    skupaj: number
  }
  vstopniDdv: {
    prejetiRacuni: PoStopnjah
    kpo: PoStopnjah
    poStopnjah: PoStopnjah
    /** Pavsalno nadomestilo 8 % kmetom pavsalistom (revizija V6) - del stopnje 'drugo' in skupaj. */
    pavsalnoNadomestilo: Postavka
    osnovaSkupaj: number
    skupaj: number
  }
  /** izstopniDdv.skupaj − vstopniDdv.skupaj; negativno = vracilo DDV. */
  obveznost: number
  stevilo: { izdaniRacuni: number; prejetiRacuni: number; kpo: number; narocila: number }
}

/** Surovi podatki, iz katerih se racuna. Nalozi jih `naloziDdvPodatke`. */
export interface DdvPodatki {
  racuni: Array<{ issue_date: string; amount_net: any; vat_amount: any; line_items: any }>
  prejeti: Array<{ receipt_date: string; amount_net: any; vat_amount: any; vat_rate: any; vat_breakdown?: any }>
  kpo: Array<{
    entry_date: string; entry_type?: string | null; category?: string | null
    income: any; expense: any; vat_out: any; vat_in: any; vat_rate: any
    invoice_id: string | null; receipt_id: string | null
  }>
  /** POS racuni (placani in stornirani), lib/pos-kpo PosNarocilo. */
  narocila: PosNarocilo[]
  /** POS vracila z izvirnim racunom (refunds + orders). */
  vracila?: PosVracilo[]
  /** Ali ima organizacija POS blagajno (pos_business_id). */
  imaBlagajno: boolean
}

/** KPO kategorije, ki so le POVZETEK narocil iz blagajne — DDV se bere iz narocil. */
export const KPO_KATEGORIJE_BLAGAJNE = ['pos_prodaja', 'pos_storitve', 'POS promet'] as const

// ───────────────────────────── obdobja ─────────────────────────────

const zadnjiDan = (leto: number, mesec1: number) => new Date(leto, mesec1, 0).getDate()
const dvoMestno = (n: number) => String(n).padStart(2, '0')

/** Razpon datumov (YYYY-MM-DD, vkljucno) in oznaka obdobja. */
export function razponObdobja(o: DdvObdobje): { od: string; do: string; oznaka: string } {
  if ('od' in o) return { od: o.od, do: o.do, oznaka: `${o.od} – ${o.do}` }
  if ('cetrtletje' in o) {
    const m1 = (o.cetrtletje - 1) * 3 + 1
    const m3 = m1 + 2
    return {
      od: `${o.leto}-${dvoMestno(m1)}-01`,
      do: `${o.leto}-${dvoMestno(m3)}-${dvoMestno(zadnjiDan(o.leto, m3))}`,
      oznaka: `Q${o.cetrtletje} ${o.leto}`,
    }
  }
  if ('mesec' in o) {
    return {
      od: `${o.leto}-${dvoMestno(o.mesec)}-01`,
      do: `${o.leto}-${dvoMestno(o.mesec)}-${dvoMestno(zadnjiDan(o.leto, o.mesec))}`,
      oznaka: `${dvoMestno(o.mesec)}/${o.leto}`,
    }
  }
  return { od: `${o.leto}-01-01`, do: `${o.leto}-12-31`, oznaka: `Leto ${o.leto}` }
}

/** Shema obracuna organizacije (organizations.vat_period). Privzeto cetrtletno. */
export function shemaObracuna(vatPeriod: string | null | undefined): VatPeriod {
  return vatPeriod === 'monthly' ? 'monthly' : 'quarterly'
}

/** Obdobje, ki VSEBUJE dani datum (tekoce, se ne zakljuceno obdobje). */
export function tekoceObdobje(datum: Date, vatPeriod: VatPeriod): DdvObdobje {
  const leto = datum.getFullYear()
  const mesec = datum.getMonth() + 1
  return vatPeriod === 'monthly'
    ? { leto, mesec }
    : { leto, cetrtletje: (Math.floor((mesec - 1) / 3) + 1) as 1 | 2 | 3 | 4 }
}

/**
 * Zadnje ZAKLJUCENO obdobje — tisto, ki ga je treba prijaviti zdaj (najdba K3).
 * Rok za DDV-O je zadnji dan meseca, ki sledi koncu obdobja: oktober → Q3,
 * januar → Q4 preteklega leta; pri mesecni shemi oktober → september.
 */
export function obdobjeZaPrijavo(datum: Date, vatPeriod: VatPeriod): DdvObdobje {
  const leto = datum.getFullYear()
  const mesec = datum.getMonth() + 1
  if (vatPeriod === 'monthly') {
    return mesec === 1 ? { leto: leto - 1, mesec: 12 } : { leto, mesec: mesec - 1 }
  }
  const q = Math.floor((mesec - 1) / 3) + 1
  return q === 1 ? { leto: leto - 1, cetrtletje: 4 } : { leto, cetrtletje: (q - 1) as 1 | 2 | 3 }
}

/** Rok za oddajo DDV-O za obdobje: zadnji dan naslednjega meseca. */
export function rokOddaje(o: DdvObdobje): string {
  const { do: konec } = razponObdobja(o)
  const [l, m] = konec.split('-').map(Number)
  const leto = m === 12 ? l + 1 : l
  const mesec = m === 12 ? 1 : m + 1
  return `${leto}-${dvoMestno(mesec)}-${dvoMestno(zadnjiDan(leto, mesec))}`
}

/** Ali je rok za `obdobjeZaPrijavo` v TEKOCEM mesecu (takrat pokazemo opomnik). */
export function jeMesecOddaje(datum: Date, vatPeriod: VatPeriod): boolean {
  return rokOddaje(obdobjeZaPrijavo(datum, vatPeriod)).slice(0, 7) === lokalniDatum(datum).slice(0, 7)
}

/** Clovesko berljiva oznaka obdobja: "Q3 2026" ali "september 2026". */
export function oznakaObdobja(o: DdvObdobje): string {
  if ('mesec' in o) {
    return new Date(o.leto, o.mesec - 1, 1).toLocaleDateString('sl-SI', { month: 'long', year: 'numeric' })
  }
  return razponObdobja(o).oznaka
}

// ───────────────────────────── pomožne ─────────────────────────────

const centi = (v: any): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}
const evri = (c: number) => Math.round(c) / 100

/** Stopnja → kljuc skupine. Neznane stopnje (npr. 8 % pavsalno nadomestilo) gredo v 'drugo'. */
export function kljucStopnje(stopnja: number): Stopnja {
  if (Math.abs(stopnja - 22) < 0.001) return '22'
  if (Math.abs(stopnja - 9.5) < 0.001) return '9.5'
  if (Math.abs(stopnja - 5) < 0.001) return '5'
  if (Math.abs(stopnja) < 0.001) return '0'
  return 'drugo'
}

/**
 * Stopnja iz zneskov, ko ni zapisana. DDV 0 → 0 %. Sicer najblizja znana
 * stopnja, ce se ujema na ±0,6 odstotne tocke (zaokrozevanje centov), drugace
 * 'drugo' — raje prikazemo, da je stopnja nenavadna, kot da jo ugibamo.
 */
export function izpeljiStopnjo(osnova: number, ddv: number): Stopnja {
  if (Math.abs(ddv) < 0.005) return '0'
  if (Math.abs(osnova) < 0.005) return 'drugo'
  const r = (ddv / osnova) * 100
  for (const s of [22, 9.5, 5]) if (Math.abs(r - s) <= 0.6) return kljucStopnje(s)
  return 'drugo'
}

type Kopica = Record<Stopnja, { osnova: number; ddv: number }> // v centih

const prazna = (): Kopica => ({
  '22': { osnova: 0, ddv: 0 }, '9.5': { osnova: 0, ddv: 0 }, '5': { osnova: 0, ddv: 0 },
  '0': { osnova: 0, ddv: 0 }, drugo: { osnova: 0, ddv: 0 },
})
const dodaj = (k: Kopica, s: Stopnja, osnovaC: number, ddvC: number) => {
  k[s].osnova += osnovaC
  k[s].ddv += ddvC
}
const vEvre = (k: Kopica): PoStopnjah => {
  const out = {} as PoStopnjah
  for (const s of STOPNJE) out[s] = { osnova: evri(k[s].osnova), ddv: evri(k[s].ddv) }
  return out
}
const sestej = (...kopice: Kopica[]): Kopica => {
  const out = prazna()
  for (const k of kopice) for (const s of STOPNJE) dodaj(out, s, k[s].osnova, k[s].ddv)
  return out
}
const vsotaDdv = (k: Kopica) => STOPNJE.reduce((s, x) => s + k[x].ddv, 0)
const vsotaOsnov = (k: Kopica) => STOPNJE.reduce((s, x) => s + k[x].osnova, 0)

/**
 * Razdeli `skupajC` (centi) po utezeh tako, da se vsota TOCNO ujema —
 * ostanek zaokrozevanja dobi skupina z najvecjo utezjo.
 */
function razdeli(skupajC: number, utezi: Array<[Stopnja, number]>): Array<[Stopnja, number]> {
  const vsota = utezi.reduce((s, [, u]) => s + Math.abs(u), 0)
  if (vsota === 0) return [[utezi[0][0], skupajC]]
  const deli = utezi.map(([s, u]) => [s, Math.round((skupajC * Math.abs(u)) / vsota)] as [Stopnja, number])
  const ostanek = skupajC - deli.reduce((s, [, c]) => s + c, 0)
  if (ostanek !== 0) {
    let max = 0
    utezi.forEach(([, u], i) => { if (Math.abs(u) > Math.abs(utezi[max][1])) max = i })
    deli[max][1] += ostanek
  }
  return deli
}

/**
 * Izdan racun → osnova in DDV po stopnjah. Zneski GLAVE so merodajni (to je
 * bilo izdano in prijavljeno); postavke povedo le, kako se delijo po stopnjah.
 */
export function razcleniIzdanRacun(r: DdvPodatki['racuni'][number]): Array<{ stopnja: Stopnja; osnova: number; ddv: number }> {
  const osnovaC = centi(r.amount_net)
  const ddvC = centi(r.vat_amount)
  const postavke: any[] = Array.isArray(r.line_items) ? r.line_items : []
  const poStopnji = new Map<Stopnja, number>() // neto postavk po stopnji
  for (const p of postavke) {
    const kolicina = Number(p?.quantity ?? 1)
    const cena = Number(p?.unit_price ?? p?.amount_net ?? 0)
    const popust = Number(p?.discount_pct ?? 0)
    const neto = (Number.isFinite(kolicina) ? kolicina : 1) * (Number.isFinite(cena) ? cena : 0) * (1 - (Number.isFinite(popust) ? popust : 0) / 100)
    const st = kljucStopnje(Number(p?.vat_rate ?? 22))
    poStopnji.set(st, (poStopnji.get(st) || 0) + neto)
  }
  // Racun z eno stopnjo (ali brez postavk): vse gre v to stopnjo. Ce postavke
  // pravijo npr. 22 %, glava pa nima DDV, je racun oproscen — 0 %.
  if (poStopnji.size <= 1) {
    let st: Stopnja = poStopnji.size === 1 ? [...poStopnji.keys()][0] : izpeljiStopnjo(osnovaC, ddvC)
    if (ddvC === 0 && osnovaC !== 0) st = '0'
    return [{ stopnja: st, osnova: osnovaC, ddv: ddvC }]
  }
  const utezOsnove = [...poStopnji.entries()] as Array<[Stopnja, number]>
  const utezDdv = utezOsnove.map(([s, n]) => [s, s === 'drugo' ? 0 : n * Number(s)] as [Stopnja, number])
  const osnove = new Map(razdeli(osnovaC, utezOsnove))
  const ddvji = new Map(utezDdv.some(([, u]) => u !== 0) ? razdeli(ddvC, utezDdv) : [[utezOsnove[0][0], ddvC]] as Array<[Stopnja, number]>)
  return utezOsnove.map(([s]) => ({ stopnja: s, osnova: osnove.get(s) || 0, ddv: ddvji.get(s) || 0 }))
}

/**
 * Prejeti racun → osnova in DDV po stopnjah (centi). Razclenitev
 * (receipts.vat_breakdown, revizija V6) ali ena stopnja; brez stopnje se
 * izpelje iz razmerja. Pavsalno nadomestilo 8 % sodi v 'drugo' (oznaceno).
 * Isto razclenitev uporablja KPR izvoz (lib/accounting-export).
 */
export function razcleniPrejetZaDdv(r: DdvPodatki['prejeti'][number]): Array<{ stopnja: Stopnja; osnova: number; ddv: number; pavsalno: boolean }> {
  return razcleniPrejetRacun(r).map(d => {
    const osnova = centi(d.osnova), ddv = centi(d.ddv)
    if (d.vrsta === 'pavsalno_nadomestilo') return { stopnja: 'drugo' as Stopnja, osnova, ddv, pavsalno: true }
    return { stopnja: Number.isFinite(d.stopnja) ? kljucStopnje(d.stopnja) : izpeljiStopnjo(osnova, ddv), osnova, ddv, pavsalno: false }
  })
}

/**
 * POS racun → osnova in DDV po stopnjah (centi). Ista razclenitev kot v KPO
 * (lib/pos-kpo razcleniRacun: po racunu, vrsti in stopnji, popust sorazmerno,
 * brez napitnine), zato se DDV in knjiga ujemata do centa.
 */
export function razcleniNarocilo(n: PosNarocilo): Array<{ stopnja: Stopnja; osnova: number; ddv: number }> {
  const poStopnji = new Map<Stopnja, { osnova: number; ddv: number }>()
  for (const d of razcleniRacun(n)) {
    const s = kljucStopnje(d.stopnja)
    const x = poStopnji.get(s) || { osnova: 0, ddv: 0 }
    x.osnova += d.neto
    x.ddv += d.ddv
    poStopnji.set(s, x)
  }
  return [...poStopnji.entries()].map(([stopnja, x]) => ({ stopnja, ...x }))
}

/** Datum (YYYY-MM-DD) casovnega ziga v slovenskem casu — prodaja ob 0:30 sodi v ta dan. */
export const lokalniDanIzCasa = lokalniDan

// ───────────────────────────── izračun ─────────────────────────────

/** Cista funkcija: izracun iz ze nalozenih podatkov za razpon [od, do]. */
export function izracunajDdvIzPodatkov(p: DdvPodatki, obdobje: DdvObdobje): DdvRezultat {
  const { od, do: doD, oznaka } = razponObdobja(obdobje)
  const v = (d: string | null | undefined) => !!d && d.slice(0, 10) >= od && d.slice(0, 10) <= doD

  const racuni = prazna(), blagajna = prazna(), kpoIzh = prazna()
  const prejeti = prazna(), kpoVst = prazna()
  let nRac = 0, nPrej = 0, nKpo = 0, nNar = 0

  for (const r of p.racuni) {
    if (!v(r.issue_date)) continue
    nRac++
    for (const d of razcleniIzdanRacun(r)) dodaj(racuni, d.stopnja, d.osnova, d.ddv)
  }

  // POS: racun na dan izdaje (+), storno na dan storna (−), vracilo na dan
  // vracila (−) - ISTI izracun kot dnevni KPO vnosi (lib/pos-kpo, revizija V4).
  // Unovcenje karte obiskov in DEMO racuni niso promet.
  for (const k of izracunajPosKnjizbe(p.narocila, p.vracila || [], dan => dan >= od && dan <= doD)) {
    dodaj(blagajna, kljucStopnje(k.stopnja), k.neto, k.ddv)
  }
  nNar = p.narocila.filter(n => n.closed_at && !niPromet(n) && v(lokalniDan(n.closed_at))).length

  const kpoBlagajne = new Set<string>(p.imaBlagajno ? KPO_KATEGORIJE_BLAGAJNE : [])
  for (const e of p.kpo) {
    if (!v(e.entry_date)) continue
    let stet = false
    if (!e.invoice_id && !kpoBlagajne.has(String(e.category || ''))) {
      const osnovaC = centi(e.income), ddvC = centi(e.vat_out)
      if (osnovaC !== 0 || ddvC !== 0) {
        const st = e.vat_rate != null ? kljucStopnje(Number(e.vat_rate)) : izpeljiStopnjo(osnovaC, ddvC)
        dodaj(kpoIzh, st, osnovaC, ddvC)
        stet = true
      }
    }
    if (!e.receipt_id) {
      const ddvC = centi(e.vat_in)
      if (ddvC !== 0) {
        const osnovaC = centi(e.expense)
        const st = e.vat_rate != null ? kljucStopnje(Number(e.vat_rate)) : izpeljiStopnjo(osnovaC, ddvC)
        dodaj(kpoVst, st, osnovaC, ddvC)
        stet = true
      }
    }
    if (stet) nKpo++
  }

  // REVIZIJA V6: prejeti racun z mesanimi stopnjami po razclenitvi
  // (receipts.vat_breakdown, lib/prejeti-ddv), sicer ena stopnja kot prej.
  let pnOsnovaC = 0, pnC = 0
  for (const r of p.prejeti) {
    if (!v(r.receipt_date)) continue
    nPrej++
    for (const d of razcleniPrejetZaDdv(r)) {
      if (d.pavsalno) { pnOsnovaC += d.osnova; pnC += d.ddv }
      dodaj(prejeti, d.stopnja, d.osnova, d.ddv)
    }
  }

  const izh = sestej(racuni, blagajna, kpoIzh)
  const vst = sestej(prejeti, kpoVst)
  const izhC = vsotaDdv(izh), vstC = vsotaDdv(vst)

  return {
    od, do: doD, oznaka,
    izstopniDdv: {
      izdaniRacuni: vEvre(racuni), kpo: vEvre(kpoIzh), blagajna: vEvre(blagajna),
      poStopnjah: vEvre(izh), osnovaSkupaj: evri(vsotaOsnov(izh)), skupaj: evri(izhC),
    },
    vstopniDdv: {
      prejetiRacuni: vEvre(prejeti), kpo: vEvre(kpoVst),
      poStopnjah: vEvre(vst), osnovaSkupaj: evri(vsotaOsnov(vst)), skupaj: evri(vstC),
      pavsalnoNadomestilo: { osnova: evri(pnOsnovaC), ddv: evri(pnC) },
    },
    obveznost: evri(izhC - vstC),
    stevilo: { izdaniRacuni: nRac, prejetiRacuni: nPrej, kpo: nKpo, narocila: nNar },
  }
}

// ───────────────────────────── nalaganje ─────────────────────────────

/** PostgREST vrne najvec 1000 vrstic — beremo po straneh, da ne izgubimo prometa. */
async function vseVrstice<T>(zgradi: () => any, velikost = 1000): Promise<T[]> {
  const out: T[] = []
  for (let zacetek = 0; ; zacetek += velikost) {
    const { data, error } = await zgradi().range(zacetek, zacetek + velikost - 1)
    if (error) throw new Error('DDV: branje podatkov ni uspelo: ' + error.message)
    out.push(...((data || []) as T[]))
    if (!data || data.length < velikost) break
  }
  return out
}

const premakniDan = (datum: string, dni: number) => {
  const d = new Date(`${datum}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dni)
  return d.toISOString().slice(0, 10)
}

/**
 * Nalozi vse, kar izracun potrebuje za razpon [od, do]. Strani, ki prikazujejo
 * vec obdobij (meseci v letu, tekoce + preteklo cetrtletje), nalozijo ENKRAT
 * in nato klicejo `izracunajDdvIzPodatkov` za vsako obdobje.
 */
export async function naloziDdvPodatke(db: any, orgId: string, od: string, doD: string): Promise<DdvPodatki> {
  const { data: org, error: orgErr } = await db.from('organizations').select('pos_business_id').eq('id', orgId).single()
  if (orgErr) throw new Error('DDV: organizacije ni mogoce prebrati: ' + orgErr.message)
  const biz: string | null = org?.pos_business_id ?? null

  const casOd = `${premakniDan(od, -1)}T00:00:00Z`
  const casDo = `${premakniDan(doD, 2)}T00:00:00Z`
  const [racuni, prejeti, kpo, narocila, vracila] = await Promise.all([
    vseVrstice<DdvPodatki['racuni'][number]>(() => db.from('issued_invoices')
      .select('id, issue_date, amount_net, vat_amount, line_items')
      .eq('org_id', orgId).neq('status', 'draft').or('zoi.is.null,zoi.not.like.DEMO-%')
      .gte('issue_date', od).lte('issue_date', doD).order('id')),
    vseVrstice<DdvPodatki['prejeti'][number]>(() => db.from('receipts')
      .select('id, receipt_date, amount_net, vat_amount, vat_rate, vat_breakdown')
      .eq('org_id', orgId).gte('receipt_date', od).lte('receipt_date', doD).order('id')),
    vseVrstice<DdvPodatki['kpo'][number]>(() => db.from('kpo_entries')
      .select('id, entry_date, entry_type, category, income, expense, vat_out, vat_in, vat_rate, invoice_id, receipt_id')
      .eq('org_id', orgId).gte('entry_date', od).lte('entry_date', doD).order('id')),
    biz
      // closed_at/voided_at sta UTC; dan prej/pozneje zajame prodajo okoli
      // polnoci, dokoncno se filtrira po lokalnem datumu v izracunu.
      ? vseVrstice<PosNarocilo>(() => db.from('orders')
          .select(IZBOR_NAROCILA)
          .eq('business_id', biz).in('status', ['paid', 'voided'])
          .or(`and(closed_at.gte.${casOd},closed_at.lt.${casDo}),and(voided_at.gte.${casOd},voided_at.lt.${casDo})`)
          .order('id'))
      : Promise.resolve([] as PosNarocilo[]),
    biz
      ? vseVrstice<PosVracilo>(() => db.from('refunds')
          .select(`id, refunded_at, amount, orders(${IZBOR_NAROCILA})`)
          .eq('business_id', biz).gte('refunded_at', casOd).lt('refunded_at', casDo)
          .order('id'))
      : Promise.resolve([] as PosVracilo[]),
  ])
  return { racuni, prejeti, kpo, narocila, vracila, imaBlagajno: !!biz }
}

/**
 * DDV obveznost organizacije za obdobje (cetrtletje, mesec, leto ali razpon).
 * `db` je Supabase odjemalec; v brskalniku ga ni treba podati.
 */
export async function izracunajDdv(orgId: string, obdobje: DdvObdobje, db?: any): Promise<DdvRezultat> {
  const odjemalec = db ?? (await import('@/lib/supabase')).createClient()
  const { od, do: doD } = razponObdobja(obdobje)
  const podatki = await naloziDdvPodatke(odjemalec, orgId, od, doD)
  return izracunajDdvIzPodatkov(podatki, obdobje)
}
