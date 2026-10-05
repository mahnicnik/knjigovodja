/**
 * DDV PREJETEGA RACUNA PO STOPNJAH (revizija V6, oktober 2026)
 * ═════════════════════════════════════════════════════════════
 *
 * PREJ: AI branje (api/scan-receipt, lib/email-scan) je vrnilo EN vat_rate za
 * cel dokument, vse poti shranjevanja (skeniranje, paketni uvoz, e-postni
 * predlogi, rocni vnos) pa so DDV PRERACUNALE kot osnova × ta stopnja. Pri
 * racunu z mesanimi stopnjami (pijaca 22 % + hrana 9,5 %) je bil ves DDV
 * obracunan po 22 %:
 *   · SIRM, Davidov Hram, september 2026: 5 dokumentov, vstopni DDV previsok
 *     za 20,84 EUR (AI je pri 3920-301-5649 prebral pravilnih 67,58 EUR,
 *     shranjeno je bilo 73,52 = 334,20 × 22 %)
 *   · email-scan ni poznal 5 % stopnje
 *   · pavsalno nadomestilo 8 % (racun kmeta pavsalista, Cernigoj) je bilo
 *     zajeto kot 0 % - 13,78 EUR odbitka manj
 *
 * ZDAJ: AI vrne razclenitev (vat_breakdown) in pavsalno nadomestilo loceno.
 * Razclenitev se shrani v receipts.vat_breakdown (migracija 180) in jo
 * uporabljata DDV obracun (lib/ddv) in KPR izvoz. Ce uporabnik osnovo ali
 * stopnjo v obrazcu spremeni, razclenitev ne velja vec in se zavrze.
 */

export const PAVSALNO_NADOMESTILO = 8

export interface DdvDel {
  stopnja: number
  osnova: number
  ddv: number
  /** Pavsalno nadomestilo kmetu pavsalistu (ZDDV-1, 8 %) - ni stopnja DDV. */
  vrsta?: 'pavsalno_nadomestilo'
}

const r2 = (n: number) => Math.round(n * 100) / 100
const st = (x: any) => { const n = Number(String(x ?? '').replace(',', '.')); return Number.isFinite(n) ? n : NaN }

/** Del navodila za AI (skupen obema potema branja). */
export const NAVODILO_DDV = `- amount_net: skupni znesek brez DDV (samo stevilo, brez €)
- vat_amount: skupni znesek DDV (samo stevilo) - SESTEVEK vseh stopenj, kot je izpisan na racunu
- amount_total: skupni znesek za placilo (samo stevilo)
- vat_breakdown: razclenitev DDV PO STOPNJAH, kot je izpisana v rekapitulaciji DDV na racunu: seznam [{"rate": 22, "net": osnova, "vat": DDV}, ...]. Stopnje: 22, 9.5, 5 ali 0 (0 = oprosceno, obrnjena davcna obveznost, brez DDV). Ce ima racun vec stopenj (npr. pijaca 22 % in hrana 9,5 %), MORA imeti vsaka svojo vrstico. Ne preracunavaj - prepisi zneske z racuna.
- vat_rate: stopnja DDV, ce je na racunu ena sama; ce jih je vec, stopnja z najvecjo osnovo
- flat_rate_compensation: ce je racun kmeta pavsalista s PAVSALNIM NADOMESTILOM 8 % (ni DDV), {"base": vrednost brez nadomestila, "amount": znesek nadomestila}; sicer null. Pavsalnega nadomestila NE vpisi v vat_breakdown.`

/** Razclenitev iz AI odgovora ali shranjenega zapisa → DdvDel[] (null, ce je ni). */
export function preberiRazclenitev(x: any): DdvDel[] | null {
  if (!Array.isArray(x) || x.length === 0) return null
  const deli: DdvDel[] = []
  for (const v of x) {
    const stopnja = st(v?.stopnja ?? v?.rate)
    const osnova = st(v?.osnova ?? v?.net)
    const ddv = st(v?.ddv ?? v?.vat)
    if (![stopnja, osnova, ddv].every(Number.isFinite)) return null
    deli.push({ stopnja, osnova: r2(osnova), ddv: r2(ddv), ...(v?.vrsta === 'pavsalno_nadomestilo' ? { vrsta: 'pavsalno_nadomestilo' as const } : {}) })
  }
  return deli
}

const vsota = (d: DdvDel[], k: 'osnova' | 'ddv') => r2(d.reduce((s, x) => s + x[k], 0))

/**
 * AI odgovor → enotna oblika: vat_breakdown (DdvDel[] z morebitnim pavsalnim
 * nadomestilom), usklajeni skupni zneski. Ce se razclenitev ne sesteje v
 * zneske na racunu, ostane le opozorilo (_ddv_opozorilo) - uporabnik preveri.
 */
export function normalizirajAiDdv<T extends Record<string, any>>(d: T): T & { vat_breakdown: DdvDel[] | null; _ddv_opozorilo?: string } {
  let deli = preberiRazclenitev(d.vat_breakdown)?.filter(x => x.vrsta !== 'pavsalno_nadomestilo') ?? null
  const pn = d.flat_rate_compensation
  const pnZnesek = st(pn?.amount)
  if (Number.isFinite(pnZnesek) && pnZnesek > 0) {
    const pnOsnova = Number.isFinite(st(pn?.base)) ? r2(st(pn.base)) : r2(pnZnesek / (PAVSALNO_NADOMESTILO / 100))
    deli = [...(deli || []), { stopnja: PAVSALNO_NADOMESTILO, osnova: pnOsnova, ddv: r2(pnZnesek), vrsta: 'pavsalno_nadomestilo' }]
  }
  if (!deli || deli.length === 0) return { ...d, vat_breakdown: null }

  const osnova = vsota(deli, 'osnova'), ddv = vsota(deli, 'ddv')
  const izven: Record<string, any> = { vat_breakdown: deli, amount_net: osnova, vat_amount: ddv }
  const bruto = st(d.amount_total)
  if (Number.isFinite(bruto) && Math.abs(bruto - (osnova + ddv)) > 0.02) {
    izven._ddv_opozorilo = `Razčlenitev DDV (${osnova.toFixed(2)} + ${ddv.toFixed(2)}) se ne ujema s skupnim zneskom ${bruto.toFixed(2)} - preverite račun.`
  } else {
    izven.amount_total = r2(osnova + ddv)
  }
  const glavna = [...deli].filter(x => x.vrsta !== 'pavsalno_nadomestilo').sort((a, b) => b.osnova - a.osnova)[0]
  izven.vat_rate = glavna ? glavna.stopnja : (d.vat_rate ?? 0)
  return { ...d, ...izven } as any
}

export interface ZneskiPrejetega {
  amount_net: number
  vat_rate: number
  vat_amount: number
  amount_total: number
  vat_breakdown: DdvDel[] | null
}

/**
 * Zneski za shranjevanje prejetega racuna - ENA pot za vse obrazce.
 *   · nezavezanec: bruto je strosek, DDV 0 (prelet 298)
 *   · razclenitev velja, ce se njena osnova ujema z vneseno osnovo in je
 *     uporabnik ni spremenil na eno stopnjo - DDV se NE preracuna
 *   · sicer ena stopnja: DDV = osnova × stopnja, zaokrozeno na cent
 */
export function zneskiZaShranjevanje(o: {
  jeZavezanec: boolean
  osnova: number
  stopnja: number
  bruto?: number | null
  razclenitev?: DdvDel[] | null
}): ZneskiPrejetega {
  if (!o.jeZavezanec) {
    const b = r2(Number(o.bruto ?? o.osnova) || 0)
    return { amount_net: b, vat_rate: 0, vat_amount: 0, amount_total: b, vat_breakdown: null }
  }
  const osnova = r2(Number(o.osnova) || 0)
  const deli = o.razclenitev && o.razclenitev.length > 0 ? o.razclenitev : null
  if (deli && Math.abs(vsota(deli, 'osnova') - osnova) < 0.011) {
    // Stopnja v obrazcu je glavna stopnja razclenitve (normalizirajAiDdv) -
    // ce jo je uporabnik spremenil, velja njegova (ena) stopnja.
    const glavna = deli.filter(x => x.vrsta !== 'pavsalno_nadomestilo').sort((a, b) => b.osnova - a.osnova)[0]
    if (!glavna || Math.abs(glavna.stopnja - (Number(o.stopnja) || 0)) < 0.001) {
      const ddv = vsota(deli, 'ddv')
      return { amount_net: osnova, vat_rate: o.stopnja, vat_amount: ddv, amount_total: r2(osnova + ddv), vat_breakdown: deli }
    }
  }
  const ddv = r2(osnova * (Number(o.stopnja) || 0) / 100)
  return { amount_net: osnova, vat_rate: Number(o.stopnja) || 0, vat_amount: ddv, amount_total: r2(osnova + ddv), vat_breakdown: null }
}

/**
 * Prejeti racun → deli po stopnjah za DDV obracun in KPR. Razclenitev, ce
 * obstaja in se sesteje v zapis (± 1 cent na del); sicer ena stopnja iz
 * vat_rate (null = izpelji iz razmerja - to naredi klicatelj).
 */
export function razcleniPrejetRacun(r: { amount_net: any; vat_amount: any; vat_rate: any; vat_breakdown?: any }): Array<DdvDel> {
  const deli = preberiRazclenitev(r.vat_breakdown)
  const osnova = r2(Number(r.amount_net) || 0), ddv = r2(Number(r.vat_amount) || 0)
  if (deli) {
    const tol = 0.011 * deli.length
    if (Math.abs(vsota(deli, 'osnova') - osnova) <= tol && Math.abs(vsota(deli, 'ddv') - ddv) <= tol) return deli
  }
  return [{ stopnja: r.vat_rate == null || r.vat_rate === '' ? NaN : Number(r.vat_rate), osnova, ddv }]
}
