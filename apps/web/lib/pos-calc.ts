/**
 * IZRAČUNI BLAGAJNE — čiste funkcije (19.8.2026)
 *
 * Zakaj obstaja: te funkcije so bile prej znotraj `app/pos/page.tsx`, ki je
 * odjemalska komponenta z 11.000 vrsticami — testi jih niso mogli uvoziti,
 * zato niso bile nikoli preverjene. Prav v njih pa se odloča, koliko DDV
 * gre na račun in na FURS.
 *
 * Tu so SAMO izračuni, brez dostopa do baze in brez vmesnika, da so
 * preverljivi s testi (`tests/blagajna.spec.ts`).
 */

export interface VrsticaKosarice {
  price: number | string
  qty: number | string
  vat_rate?: number | string | null
  mods?: Array<{ delta?: number | string }>
  happyHourApplied?: boolean
  happyHourPct?: number | string | null
  vat_exemption_code?: string | null
  vat_exemption_custom_text?: string | null
}

export interface RazclenitevPoStopnji {
  rate: number
  net: number
  vat: number
}

/**
 * Znesek ene vrstice, z doplačili modifikatorjev in happy hour popustom.
 *
 * Varovalke (17.8.2026): manjkajoča cena je prej dala "ni število",
 * negativno doplačilo ali popust nad 100 % pa NEGATIVEN znesek — kar pri
 * davčnem dokumentu ne sme biti mogoče.
 */
export function zesekVrstice(l: VrsticaKosarice): number {
  const cena = Number(l.price) || 0
  const kolicina = Math.max(0, Number(l.qty) || 0)
  const doplacila = (l.mods || []).reduce((s, m) => s + (Number(m.delta) || 0), 0)
  const osnova = Math.max(0, (cena + doplacila) * kolicina)

  /**
   * POPUST NA POSAMEZNO VRSTICO (prelet 201)
   *
   * Popust je bil doslej mogoc samo za celoten nakup. V gostinstvu pa je
   * pogost popust na ENO postavko: napaka v narocilu, pijaca za hisni racun,
   * clanska cena za en artikel.
   *
   * Vrstni red: najprej Happy hour, nato popust blagajnika. Popusta se
   * MNOZITA, ne sestevata - pri 20 % in 10 % je konec 28 %, ne 30 %. Tako
   * skupni popust nikoli ne more preseci 100 % in znesek ne more pasti pod nic.
   */
  let znesek = osnova
  if (l.happyHourApplied) {
    const pct = Math.min(100, Math.max(0, Number(l.happyHourPct ?? 20) || 0))
    znesek = znesek * (1 - pct / 100)
  }
  const popust = Math.min(100, Math.max(0, Number((l as any).discountPct ?? 0) || 0))
  if (popust > 0) znesek = znesek * (1 - popust / 100)
  return znesek
}

/**
 * Razčlenitev DDV po dejanski stopnji VSAKE vrstice.
 *
 * ⚠️ Stopnja se bere z `??`, NE z `||`. V JavaScriptu je 0 neresnična
 * vrednost, zato je `vat_rate || 22` pri oproščeni postavki (0 %) vrnil 22 %
 * — napaka, ki je bila 19.8.2026 najdena na 27 mestih in je pomenila napačen
 * DDV na računu IN na podatkih, poslanih FURS.
 *
 * `scale` (0–1) sorazmerno prilagodi znesek za popust na celoten račun.
 */
export function razclenitevDdv(
  kosarica: VrsticaKosarice[] | null | undefined,
  scale = 1,
): { net: number; vat: number; byRate: RazclenitevPoStopnji[] } {
  let net = 0
  let vat = 0
  const poStopnji: Record<number, RazclenitevPoStopnji> = {}

  for (const l of (kosarica || [])) {
    const bruto = zesekVrstice(l) * scale
    const stopnja = Number(l.vat_rate ?? 22)
    const vrsticaNet = bruto / (1 + stopnja / 100)
    const vrsticaVat = bruto - vrsticaNet
    net += vrsticaNet
    vat += vrsticaVat
    if (!poStopnji[stopnja]) poStopnji[stopnja] = { rate: stopnja, net: 0, vat: 0 }
    poStopnji[stopnja].net += vrsticaNet
    poStopnji[stopnja].vat += vrsticaVat
  }

  const byRate = Object.values(poStopnji).sort((a, b) => b.rate - a.rate)
  return { net, vat, byRate }
}

/**
 * Pretvorba popusta iz EVROV v odstotek.
 *
 * Popust je v celotni blagajni vezan na odstotek (listki, računi, FURS),
 * zato se vneseni znesek pretvori. Omejen je na vrednost računa, da popust
 * ne more preseči zneska in ustvariti negativnega računa.
 */
export function popustEurVOdstotek(znesekEur: number, skupajRacun: number): number {
  if (!(skupajRacun > 0)) return 0
  const omejen = Math.min(Math.max(0, Number(znesekEur) || 0), skupajRacun)
  return Number((omejen / skupajRacun * 100).toFixed(4))
}

/**
 * Znesek storna: enak izvirniku, a negativen.
 * ZDavPR: "račun se stornira tako, da se izda nov račun z negativnimi zneski".
 */
export function znesekStorna(izvirniZnesek: number): number {
  return -Math.abs(Number(izvirniZnesek) || 0)
}

/**
 * Pričakovana gotovina ob zaključku blagajne.
 *
 * ⚠️ Vračila se ODŠTEJEJO — a samo GOTOVINSKA. Kartično vračilo ne zmanjša
 * gotovine v predalu. (Vračila so 19.8.2026 zaradi napačnega imena stolpca
 * povsem izpadla iz izračuna, zato je blagajna javljala manjko, ki ga ni bilo.)
 */
export function pricakovanaGotovina(params: {
  zacetnoStanje: number
  gotovinskiPromet: number
  gotovinskaVracila: number
}): number {
  return Number(params.zacetnoStanje || 0)
    + Number(params.gotovinskiPromet || 0)
    - Number(params.gotovinskaVracila || 0)
}

/**
 * Ali je prodana vrstica STORITEV ali izdelek — za pravilno kategorijo v KPO
 * (`pos_storitve` proti `pos_prodaja`).
 *
 * ⚠️ Ne zadošča `service_id`: storitev se ob shranjevanju sinhronizira v
 * katalog artiklov in se v blagajni proda kot ARTIKEL, zato `service_id` na
 * vrstici ostane prazen. Fizioterapija je bila zato v KPO knjižena kot
 * "prodaja izdelkov" (popravljeno 19.8.2026). Artikel, ki je nastal iz
 * storitve, ima zastavico `bookable`.
 */
/**
 * PREVERBA SLOVENSKE DAVČNE ŠTEVILKE (prelet 175)
 * ═══════════════════════════════════════════════
 *
 * Davčna številka ima 8 števk; zadnja je kontrolna in se izračuna po
 * pravilu mod-11 z utežmi 8, 7, 6, 5, 4, 3, 2. Če ostanek da 10, je
 * kontrolna števka 0; ostanek 11 se ne pojavi pri veljavnih številkah.
 *
 * ZAKAJ TO PREVERJAMO: napačna davčna številka na računu pomeni, da se
 * natisnjeni dokument in prijava FURS razlikujeta od resničnega kupca.
 * Bolje je vnos zavrniti takoj kot izdati račun, ki ga bo treba stornirati.
 */
export function veljavnaDavcnaStevilka(vnos: string): boolean {
  const s = String(vnos || '').replace(/[^0-9]/g, '')
  if (s.length !== 8) return false
  const utezi = [8, 7, 6, 5, 4, 3, 2]
  let vsota = 0
  for (let i = 0; i < 7; i++) vsota += Number(s[i]) * utezi[i]
  let kontrolna = 11 - (vsota % 11)
  if (kontrolna === 10) kontrolna = 0
  if (kontrolna === 11) return false
  return kontrolna === Number(s[7])
}

export function jeStoritevVrstica(vrstica: {
  service_id?: string | null
  items?: { bookable?: boolean | null } | null
}): boolean {
  return !!vrstica.service_id || !!vrstica.items?.bookable
}
