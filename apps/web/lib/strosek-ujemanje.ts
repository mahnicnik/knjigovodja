/**
 * PRELET 332: ali je strosek, najden v e-posti, ZE vnesen med stroske.
 *
 * Uporaba: e-postno skeniranje (streznik - stevec v obvestilu) in seznam
 * "Najdeni stroski" (brskalnik - oznaka "Ze dodano" ob vsakem predlogu).
 * Ujemanje se vedno racuna SPROTI, zato predlog dobi oznako tudi, ce je bil
 * strosek vnesen sele PO skeniranju.
 *
 * Pravila (od najmocnejsega):
 *  1. enaka stevilka racuna (+ podoben dobavitelj ali enak znesek)  -> gotovo
 *  2. enaka davcna st. dobavitelja + enak znesek + datum +-10 dni    -> gotovo
 *  3. enak znesek + datum +-3 dni + podoben dobavitelj               -> gotovo
 *  4. enak znesek + datum +-7 dni                                     -> verjetno
 * Znesek je "enak" do 1 centa: bruto z bruto ali neto z neto (nikoli navzkriz).
 */
export type ObstojeciStrosek = {
  id: string
  vendor: string | null
  receipt_date: string | null
  amount_total: number | string | null
  amount_net?: number | string | null
  receipt_number?: string | null
  vendor_tax_num?: string | null
}

export type Ujemanje = {
  receiptId: string
  vendor: string
  datum: string | null
  znesek: number
  zanesljivost: 'gotovo' | 'verjetno'
}

export const STROSEK_POLJA = 'id, vendor, receipt_date, amount_total, amount_net, receipt_number, vendor_tax_num'

const PRAVNE_OBLIKE = /\b(d\.?\s?o\.?\s?o|s\.?\s?p|d\.?\s?d|d\.?\s?n\.?\s?o|k\.?\s?d|gmbh|ltd|limited|inc|llc|bv|ag|sa|srl|spa|oy|ab|as)\b\.?/g

export function normalizirajIme(s: any): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(PRAVNE_OBLIKE, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function podobnoIme(a: any, b: any): boolean {
  const x = normalizirajIme(a), y = normalizirajIme(b)
  if (!x || !y) return false
  if (x === y || x.includes(y) || y.includes(x)) return true
  const bx = new Set(x.split(' ').filter(t => t.length >= 3))
  return y.split(' ').some(t => t.length >= 3 && bx.has(t))
}

const oznaka = (s: any) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const davcna = (s: any) => String(s ?? '').replace(/\D/g, '')
const stevilo = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : NaN }

function dniMed(a: any, b: any): number {
  if (!a || !b) return Infinity
  const ta = Date.parse(String(a).slice(0, 10)), tb = Date.parse(String(b).slice(0, 10))
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Infinity
  return Math.abs(ta - tb) / 86_400_000
}

/** extracted = podatki, ki jih je AI prebral iz priloge (email_scan_pending.extracted). */
export function najdiUjemanje(extracted: any, obstojeci: ObstojeciStrosek[]): Ujemanje | null {
  if (!extracted || !Array.isArray(obstojeci) || obstojeci.length === 0) return null
  const znesek = stevilo(extracted.amount_total ?? extracted.amount_net)
  const neto = stevilo(extracted.amount_net)
  const st = oznaka(extracted.invoice_number)
  const dav = davcna(extracted.vendor_tax_number)
  let najboljse: { u: Ujemanje; tocke: number } | null = null

  for (const r of obstojeci) {
    const rz = stevilo(r.amount_total)
    // Bruto z bruto ALI neto z neto. Neto je nujen: pri racunih z vec
    // stopnjami DDV Racunko shrani bruto kot neto x stopnja, zato se bruto
    // razlikuje od racuna (npr. 379,00 vs 380,19 EUR), neto pa je enak.
    // NIKOLI bruto z neto - 8,19 EUR bruto enega racuna ni 8,19 EUR neto drugega.
    const rn = stevilo(r.amount_net)
    const enakBruto = Number.isFinite(znesek) && znesek !== 0 && Number.isFinite(rz) && Math.abs(rz - znesek) <= 0.011
    const enakNeto = Number.isFinite(neto) && neto !== 0 && Number.isFinite(rn) && Math.abs(rn - neto) <= 0.011
    const enakZnesek = enakBruto || enakNeto
    const dni = dniMed(extracted.date, r.receipt_date)
    const imeOk = podobnoIme(extracted.vendor, r.vendor)
    const enakaSt = st.length >= 3 && st === oznaka(r.receipt_number)
    const enakaDav = dav.length >= 8 && dav === davcna(r.vendor_tax_num)

    let tocke = 0
    let zanesljivost: Ujemanje['zanesljivost'] | null = null
    if (enakaSt && (imeOk || enakZnesek || enakaDav)) { zanesljivost = 'gotovo'; tocke = 100 }
    else if (enakaDav && enakZnesek && dni <= 10) { zanesljivost = 'gotovo'; tocke = 90 }
    else if (enakZnesek && dni <= 3 && imeOk) { zanesljivost = 'gotovo'; tocke = 80 }
    else if (enakZnesek && dni <= 7) { zanesljivost = 'verjetno'; tocke = 50 }
    if (!zanesljivost) continue
    tocke -= Math.min(dni, 30) // blizji datum ima prednost

    if (!najboljse || tocke > najboljse.tocke) {
      najboljse = {
        tocke,
        u: { receiptId: r.id, vendor: r.vendor || '', datum: r.receipt_date, znesek: Number.isFinite(rz) ? rz : znesek, zanesljivost },
      }
    }
  }
  return najboljse?.u ?? null
}

/** Datumsko okno stroskov, ki jih je smiselno primerjati s predlogi. */
export function oknoZaPrimerjavo(predlogi: any[]): { od: string; do: string } | null {
  const datumi = predlogi
    .map(p => Date.parse(String(p?.extracted?.date || p?.email_date || '').slice(0, 10)))
    .filter(Number.isFinite)
  if (datumi.length === 0) return null
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
  return { od: iso(Math.min(...datumi) - 12 * 86_400_000), do: iso(Math.max(...datumi) + 12 * 86_400_000) }
}
