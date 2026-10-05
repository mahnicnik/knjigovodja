/**
 * POS BLAGAJNA → KPO KNJIGA — ENA SAMA POT (revizija K5, V4, V5; oktober 2026)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * PREJ:
 *   K5  Promet izmene se je knjizil z datumom ZAKLJUCKA izmene. Izmena, odprta
 *       od 30.8. do oktobra, bi avgustovski in septembrski promet (Q3) knjizila
 *       v Q4 - v napacno davcno obdobje.
 *   V4  Storno in vracila se niso odsteli nikjer: syncSessionToKPO je stornirane
 *       racune le izpustil (storno po zakljucku izmene ni popravil nicesar),
 *       negativne skupine je preskocil, vracila pa je /api/pos/sync-income
 *       zapisal samo v opombo.
 *   V5  Dve poti: "Zakljuci" (kategorija pos_prodaja) in "Z-porocilo (samo
 *       obracun)" prek /api/pos/sync-income (kategorija "POS promet", brez
 *       Z-porocila bruto z DDV 0). Ob obeh bi bil promet knjizen dvakrat.
 *
 * ZDAJ: en sam izracun in en sam zapis, ki ga klicejo vse tri poti (zakljucek
 * izmene, Z-porocilo, storno/vracilo). Zapis je DNEVNI:
 *
 *   za vsak lokalni dan D, vrsto (izdelek/storitev) in stopnjo DDV:
 *     + racuni, zakljuceni na dan D (placani in pozneje stornirani)
 *     − racuni, stornirani na dan D       (storno je dokument dneva storna)
 *     − vracila, izvedena na dan D        (razdeljena po stopnjah izvirnika)
 *
 * Vsak zapis ima kljuc kpo_entries.pos_kljuc (migracija 178, unikaten po
 * organizaciji) in se ob vsakem knjizenju PRERACUNA iz izvornih podatkov in
 * PREPISE. Zato je knjizenje idempotentno: zakljucek izmene, Z-porocilo in
 * storno lahko isti dan knjizijo poljubnokrat, rezultat je vedno isti.
 *
 * ZDRUZLJIVOST: pred to spremembo knjizeni POS vnosi (brez pos_kljuc) ostanejo.
 * Ne ponovimo nicesar, kar je bilo zakljuceno PRED zadnjim starim zapisom
 * (meja = created_at zadnjega starega POS vnosa organizacije).
 *
 * Zaokrozevanje: po racunu in stopnji (kot v FURS razclenitvi in lib/ddv.ts).
 */

import { jeStoritevVrstica } from '@/lib/pos-calc'
import { vatExemptionText } from '@/lib/vat-exemptions'

// ───────────────────────────── tipi ─────────────────────────────

export type PosVrstica = {
  total: any; qty?: any; unit_price?: any; vat_rate: any; voided: boolean | null
  service_id?: string | null
  items?: { bookable?: boolean | null; vat_exemption_code?: string | null; vat_exemption_custom_text?: string | null } | null
}
export type PosNarocilo = {
  id?: string
  closed_at: string | null
  voided_at?: string | null
  status?: string | null
  total: any
  tip_amount: any
  invoice_number?: string | null
  order_lines: PosVrstica[] | null
  payments: Array<{ method: string | null }> | null
}
export type PosVracilo = {
  id?: string
  refunded_at: string
  amount: any
  orders: PosNarocilo | null // izvirni racun (refunds.original_order_id)
}

export type Vrsta = 'izdelek' | 'storitev'
/** Del racuna: vrsta + stopnja, osnova in DDV v CENTIH (zaokrozeno po racunu). */
export type Del = { vrsta: Vrsta; stopnja: number; neto: number; ddv: number; klavzule: string[] }

export interface PosKnjizba {
  dan: string           // lokalni datum YYYY-MM-DD
  vrsta: Vrsta
  stopnja: number
  neto: number          // centi, lahko negativno
  ddv: number           // centi, lahko negativno
  prodaja: number       // centi bruto: racuni dneva
  storno: number        // centi bruto: storno dneva (pozitivno = odsteto)
  vracila: number       // centi bruto: vracila dneva (pozitivno = odsteto)
  klavzule: string[]
}

export const KPO_KATEGORIJA: Record<Vrsta, string> = { izdelek: 'pos_prodaja', storitev: 'pos_storitve' }

// ───────────────────────────── razclenitev ─────────────────────────────

const lokalniDanFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Ljubljana' })
/** Lokalni (slovenski) datum casovnega ziga. Prodaja ob 0:30 sodi v ta dan. */
export function lokalniDan(cas: string): string {
  return lokalniDanFormat.format(new Date(cas))
}

const bruto = (l: PosVrstica) => l.total != null ? Number(l.total) : Number(l.qty || 0) * Number(l.unit_price || 0)

/** Racun, ki NI nov promet: unovcenje karte obiskov (placano ob nakupu karte) ali predstavitveni. */
export function niPromet(n: PosNarocilo): boolean {
  return String(n.invoice_number || '').startsWith('DEMO') || (n.payments || []).some(p => p.method === 'pkg')
}

/**
 * Racun → deli po vrsti in stopnji. Bruto vrstic se sorazmerno prilagodi
 * dejansko zaracunanemu znesku brez napitnine (popust na racunu; enako kot
 * FURS razclenitev v api/furs/invoice). DDV zaokrozen po racunu in stopnji.
 * `delez` (0..1] uporabimo za vracilo dela racuna.
 */
export function razcleniRacun(n: PosNarocilo, delez = 1): Del[] {
  const vrstice = (n.order_lines || []).filter(l => !l.voided)
  if (vrstice.length === 0) return []
  const vsota = vrstice.reduce((s, l) => s + bruto(l), 0)
  const zaracunano = Number(n.total || 0) - Number(n.tip_amount || 0)
  const faktor = (vsota > 0 ? zaracunano / vsota : 1) * delez
  const skupine = new Map<string, { vrsta: Vrsta; stopnja: number; bruto: number; klavzule: Set<string> }>()
  for (const l of vrstice) {
    const stopnja = Number(l.vat_rate ?? 22)
    const vrsta: Vrsta = jeStoritevVrstica(l as any) ? 'storitev' : 'izdelek'
    const k = `${vrsta}|${stopnja}`
    const g = skupine.get(k) || { vrsta, stopnja, bruto: 0, klavzule: new Set<string>() }
    g.bruto += bruto(l) * faktor
    if (stopnja === 0) {
      const besedilo = vatExemptionText(l.items?.vat_exemption_code as any, l.items?.vat_exemption_custom_text as any)
      if (besedilo) g.klavzule.add(besedilo)
    }
    skupine.set(k, g)
  }
  return [...skupine.values()].map(g => {
    const neto = g.stopnja > 0 ? g.bruto / (1 + g.stopnja / 100) : g.bruto
    return {
      vrsta: g.vrsta, stopnja: g.stopnja,
      neto: Math.round(neto * 100),
      ddv: Math.round((g.bruto - neto) * 100),
      klavzule: [...g.klavzule],
    }
  })
}

/**
 * Dnevne knjizbe za dane dneve. `meja` (ISO cas) izpusti dogodke, ki so jih
 * ze knjizili stari zapisi (pred migracijo 178).
 */
export function izracunajPosKnjizbe(
  narocila: PosNarocilo[],
  vracila: PosVracilo[],
  dnevi: Set<string> | ((dan: string) => boolean),
  meja: string | null = null,
): PosKnjizba[] {
  const vDnevih = typeof dnevi === 'function' ? dnevi : (dan: string) => dnevi.has(dan)
  const knjizbe = new Map<string, PosKnjizba>()
  const po = (cas: string | null | undefined) => !!cas && (!meja || new Date(cas).getTime() > new Date(meja).getTime())
  const dodaj = (dan: string, d: Del, predznak: 1 | -1, vir: 'prodaja' | 'storno' | 'vracila') => {
    const k = `${dan}|${d.vrsta}|${d.stopnja}`
    const z = knjizbe.get(k) || { dan, vrsta: d.vrsta, stopnja: d.stopnja, neto: 0, ddv: 0, prodaja: 0, storno: 0, vracila: 0, klavzule: [] }
    z.neto += predznak * d.neto
    z.ddv += predznak * d.ddv
    z[vir] += d.neto + d.ddv
    for (const t of d.klavzule) if (!z.klavzule.includes(t)) z.klavzule.push(t)
    knjizbe.set(k, z)
  }

  for (const n of narocila) {
    if (niPromet(n)) continue
    const status = n.status ?? 'paid'
    if (status !== 'paid' && status !== 'voided') continue
    const deli = razcleniRacun(n)
    // + na dan izdaje (tudi ce je bil pozneje storniran - storno je svoj dokument)
    if (n.closed_at && po(n.closed_at)) {
      const dan = lokalniDan(n.closed_at)
      if (vDnevih(dan)) for (const d of deli) dodaj(dan, d, 1, 'prodaja')
    }
    // − na dan storna
    if (status === 'voided' && n.voided_at && po(n.voided_at)) {
      const dan = lokalniDan(n.voided_at)
      if (vDnevih(dan)) for (const d of deli) dodaj(dan, d, -1, 'storno')
    }
  }

  for (const v of vracila) {
    if (!v.orders || niPromet(v.orders) || !po(v.refunded_at)) continue
    const dan = lokalniDan(v.refunded_at)
    if (!vDnevih(dan)) continue
    const zaracunano = Number(v.orders.total || 0) - Number(v.orders.tip_amount || 0)
    if (zaracunano <= 0) continue
    const delez = Math.min(1, Number(v.amount || 0) / zaracunano)
    for (const d of razcleniRacun(v.orders, delez)) dodaj(dan, d, -1, 'vracila')
  }

  return [...knjizbe.values()]
    .filter(k => k.neto !== 0 || k.ddv !== 0 || k.prodaja !== 0)
    .sort((a, b) => a.dan.localeCompare(b.dan) || a.vrsta.localeCompare(b.vrsta) || b.stopnja - a.stopnja)
}

/** Kljuc KPO vnosa: en vnos na podjetje, dan, vrsto in stopnjo. */
export function posKljuc(businessId: string, k: { dan: string; vrsta: Vrsta; stopnja: number }): string {
  return `pos:${businessId}:${k.dan}:${k.vrsta}:${k.stopnja}`
}

/** Vsi lokalni dnevi med dvema casoma (vkljucno). */
export function dneviMed(od: string, do_: string): string[] {
  const out: string[] = []
  const zadnji = lokalniDan(do_)
  let d = lokalniDan(od)
  for (let i = 0; i < 400 && d <= zadnji; i++) {
    out.push(d)
    const n = new Date(`${d}T12:00:00Z`)
    n.setUTCDate(n.getUTCDate() + 1)
    d = n.toISOString().slice(0, 10)
  }
  return out
}

const evri = (c: number) => Math.round(c) / 100
const fmt = (c: number) => evri(c).toFixed(2)

export function kpoVnos(orgId: string, businessId: string, k: PosKnjizba) {
  const vrstaBesedilo = k.vrsta === 'storitev' ? 'storitev' : 'izdelkov'
  const deli = [`prodaja €${fmt(k.prodaja)}`]
  if (k.storno) deli.push(`storno −€${fmt(k.storno)}`)
  if (k.vracila) deli.push(`vračila −€${fmt(k.vracila)}`)
  return {
    org_id: orgId,
    pos_kljuc: posKljuc(businessId, k),
    entry_date: k.dan,
    description: `POS blagajna — prodaja ${vrstaBesedilo} ${k.stopnja}% (${k.dan})`,
    entry_type: 'income',
    income: evri(k.neto),
    expense: 0,
    vat_out: evri(k.ddv),
    vat_in: 0,
    vat_rate: k.stopnja,
    category: KPO_KATEGORIJA[k.vrsta],
    notes: ['Dnevni povzetek POS blagajne (bruto): ' + deli.join(', ') + '.', ...k.klavzule].join(' '),
  }
}

// ───────────────────────────── knjizenje ─────────────────────────────

export const IZBOR_NAROCILA = 'id, closed_at, voided_at, status, total, tip_amount, invoice_number, order_lines(total, qty, unit_price, vat_rate, voided, service_id, items(bookable, vat_exemption_code, vat_exemption_custom_text)), payments(method)'

async function vseVrstice<T>(zgradi: () => any): Promise<T[]> {
  const out: T[] = []
  for (let z = 0; ; z += 1000) {
    const { data, error } = await zgradi().range(z, z + 999)
    if (error) throw new Error('POS → KPO: branje ni uspelo: ' + error.message)
    out.push(...((data || []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

/** Okno UTC, ki zagotovo pokrije lokalne dneve (± 1 dan zaradi casovnega pasu). */
function okno(dnevi: string[]): { od: string; do: string } {
  const s = [...dnevi].sort()
  const premakni = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
  return { od: `${premakni(s[0], -1)}T00:00:00Z`, do: `${premakni(s[s.length - 1], 2)}T00:00:00Z` }
}

/**
 * Preracuna in zapise dnevne POS vnose v KPO za dane lokalne dneve.
 * Idempotentno - klici ga poljubnokrat (zakljucek izmene, Z-porocilo, storno,
 * vracilo). Vrne zapisane knjizbe.
 */
export async function knjiziPosDneve(db: any, orgId: string, businessId: string, dnevi: string[]): Promise<PosKnjizba[]> {
  if (dnevi.length === 0) return []
  const { od, do: doCas } = okno(dnevi)
  const nabor = new Set(dnevi)

  const [narocila, vracila, stari] = await Promise.all([
    vseVrstice<PosNarocilo>(() => db.from('orders').select(IZBOR_NAROCILA)
      .eq('business_id', businessId).in('status', ['paid', 'voided'])
      .or(`and(closed_at.gte.${od},closed_at.lt.${doCas}),and(voided_at.gte.${od},voided_at.lt.${doCas})`)
      .order('id')),
    vseVrstice<PosVracilo>(() => db.from('refunds').select(`id, refunded_at, amount, orders(${IZBOR_NAROCILA})`)
      .eq('business_id', businessId).gte('refunded_at', od).lt('refunded_at', doCas).order('id')),
    // Meja: zadnji POS vnos, knjizen po STAREM nacinu (brez kljuca).
    db.from('kpo_entries').select('created_at').eq('org_id', orgId).is('pos_kljuc', null)
      .in('category', ['pos_prodaja', 'pos_storitve', 'POS promet'])
      .order('created_at', { ascending: false }).limit(1),
  ])
  if (stari.error) throw new Error('POS → KPO: branje knjige ni uspelo: ' + stari.error.message)
  const meja: string | null = stari.data?.[0]?.created_at ?? null

  const knjizbe = izracunajPosKnjizbe(narocila, vracila, nabor, meja)

  // Kljuci teh dni, ki obstajajo, a jih izracun ne vrne vec (npr. ves promet
  // dneva je bil storniran na isti dan) - postavimo jih na 0.
  const { data: obstojeci, error: obErr } = await db.from('kpo_entries').select('pos_kljuc')
    .eq('org_id', orgId).like('pos_kljuc', `pos:${businessId}:%`).in('entry_date', dnevi)
  if (obErr) throw new Error('POS → KPO: branje knjige ni uspelo: ' + obErr.message)
  const novi = new Set(knjizbe.map(k => posKljuc(businessId, k)))
  const vrstice = knjizbe.map(k => kpoVnos(orgId, businessId, k))
  for (const o of obstojeci || []) {
    if (novi.has(o.pos_kljuc)) continue
    const [, , dan, vrsta, stopnja] = String(o.pos_kljuc).split(':')
    vrstice.push(kpoVnos(orgId, businessId, { dan, vrsta: vrsta as Vrsta, stopnja: Number(stopnja), neto: 0, ddv: 0, prodaja: 0, storno: 0, vracila: 0, klavzule: [] }))
  }
  if (vrstice.length === 0) return knjizbe

  const { error } = await db.from('kpo_entries').upsert(vrstice, { onConflict: 'org_id,pos_kljuc' })
  if (error) throw new Error('POS → KPO: zapis ni uspel: ' + error.message)
  return knjizbe
}
