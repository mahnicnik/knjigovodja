/**
 * PRELET 326: KNJIGA STRIPE PLACIL (uporabnikov lasten Stripe racun).
 * ═══════════════════════════════════════════════════════════════════
 *
 * ZAKAJ: racun je bil doslej vezan na posamezen DOGODEK in na to, katere
 * tipe dogodkov je uporabnik izbral pri webhooku. Vsak tip placila, ki ga
 * nismo poslusali (samostojno placilo, 18.9.2026 masterclass 289 EUR pri
 * Domnu Kocjanu), vsaka novejsa API verzija in vsak izpadel dogodek je
 * pomenil placilo BREZ racuna - brez sledi.
 *
 * MODEL:
 *  1. Osnova je PREMIK DENARJA, ne dogodek. Vsako placilo dobi KLJUC:
 *     ID placila (pi_...), sicer ID Stripe racuna (in_...) ali bremenitve
 *     (ch_...). Checkout, Stripe racun in placilo istega nakupa imajo ISTI
 *     kljuc -> ena vrstica v `stripe_placila` -> en racun.
 *  2. Ce ima organizacija KLJUC ZA BRANJE (restricted key), webhook samo
 *     sprozi obdelavo; podatke Racunko prebere iz Stripe API (vedno nasa,
 *     znana API verzija). Tako ni vec pomembno, katere dogodke in katero
 *     API verzijo je uporabnik izbral.
 *  3. Nocna uskladitev (api/cron/stripe-uskladitev) gre cez VSA placila
 *     zadnjih dni v Stripu in jih pelje skozi isto obdelavo. Manjkajoci ali
 *     napacno nastavljen webhook torej ne pomeni vec manjkajocega racuna.
 *  4. Vracilo v Stripu -> dobropis, povezan z izvirnim racunom.
 *  5. Kar se ne da obdelati samodejno (tuja valuta, vrnjeno pred izdajo
 *     racuna ...) dobi stanje 'pregled' in je vidno v Integracijah in na
 *     nadzorni plosci - nikoli vec tiho.
 *
 * Brez kljuca za branje obdelava deluje iz vsebine dogodka (kot doslej),
 * z enakim kljucem in knjigo - a le za dogodke, ki jih Stripe poslje.
 */
import Stripe from 'stripe'
import { lokalniDatum } from '@/lib/tax-constants'
import { confirmIssuedInvoiceWithFurs } from '@/lib/furs-invoice-confirm'
import { renderToBuffer } from '@react-pdf/renderer'
import { InvoicePDF, generateUpnQr, generateFursQr } from '@/lib/invoice-pdf'
import { buildInvoiceEmailHtml } from '@/lib/invoice-email'
import { resend, posiljateljZa } from '@/lib/resend'
import { decryptToken } from '@/lib/token-crypto'

// API verzija, s katero Racunko BERE uporabnikov Stripe - neodvisna od
// verzije, ki jo ima uporabnik nastavljeno pri webhooku.
export const STRIPE_API_VERZIJA = '2026-04-22.dahlia'

export type Vracilo = {
  id: string
  znesekCenti: number
  valuta: string
  vrnjenoOb: Date
  uspesno: boolean
}

export type Placilo = {
  kljuc: string
  paymentIntentId: string | null
  chargeId: string | null
  stripeInvoiceId: string | null
  checkoutSessionId: string | null
  znesekCenti: number
  valuta: string
  vrnjenoCenti: number
  placano: boolean
  placanoOb: Date
  kupecIme: string | null
  kupecEmail: string | null
  opis: string | null
  vir: 'checkout' | 'racun' | 'placilo' | 'bremenitev'
  opomba: string
  metadata: Record<string, any>
  vracila: Vracilo[]
  spor: boolean
  // Ce je nastavljeno: placilo se NE izda samodejno, ampak gre v 'pregled'
  // s tem razlogom (npr. placano izven Stripa - pogosto ze zaracunano drugje).
  pregled?: string
}

export type Preskok = { preskok: string; podrobnosti?: Record<string, any> }

export type IzidObdelave = {
  stanje: 'izdan' | 'preskoceno' | 'pregled' | 'napaka' | 'caka'
  razlog?: string
  racunId?: string | null
  ponovi?: boolean      // webhook naj vrne 500, da Stripe dogodek ponovi
  novRacun?: boolean
  dobropisov?: number
}

// ─────────────────────────────────────────────────────────────────
// Stripe odjemalec za organizacijo
// ─────────────────────────────────────────────────────────────────

export function stripeZaKljuc(kljuc: string): Stripe {
  return new Stripe(kljuc, { apiVersion: STRIPE_API_VERZIJA as any, maxNetworkRetries: 2, timeout: 20000 })
}

export class KljucNeDeluje extends Error {}

/**
 * Stripe odjemalec s kljucem organizacije ali null, ce kljuca ni.
 * Ce kljuc JE vpisan, a ga ni mogoce desifrirati (manjka EMAIL_TOKEN_KEY,
 * vrednost ni sifrirana ...), VRZE KljucNeDeluje - organizacija s kljucem
 * NE sme tiho preiti na obdelavo brez kljuca (pregled 326, S4/S7).
 */
export async function stripeZaOrg(supabase: any, orgId: string): Promise<{ stripe: Stripe; live: boolean } | null> {
  const { data } = await supabase
    .from('integrations')
    .select('api_key_enc')
    .eq('org_id', orgId)
    .eq('type', 'stripe')
    .eq('is_active', true)
    .maybeSingle()
  const enc: string | null = data?.api_key_enc ?? null
  if (!enc) return null
  // Samo sifrirane vrednosti (enc:v1:) - vrednost, vpisana mimo streznika
  // (neposredno v tabelo), se ne uporabi.
  if (!enc.startsWith('enc:v1:')) throw new KljucNeDeluje('kljuc_ni_sifriran')
  let kljuc: string | null = null
  try { kljuc = decryptToken(enc) } catch { kljuc = null }
  if (!kljuc) throw new KljucNeDeluje('kljuca_ni_mogoce_desifrirati')
  return { stripe: stripeZaKljuc(kljuc), live: kljuc.includes('_live_') }
}

// ─────────────────────────────────────────────────────────────────
// Pomozne
// ─────────────────────────────────────────────────────────────────

const id = (v: any): string | null => (typeof v === 'string' ? v : v?.id ?? null)
const sekVDatum = (s: any, rezerva?: Date): Date => (Number(s) > 0 ? new Date(Number(s) * 1000) : (rezerva ?? new Date()))
const opisPostavk = (inv: any): string =>
  Array.isArray(inv?.lines?.data) ? inv.lines.data.map((l: any) => l?.description).filter(Boolean).join(', ') : ''

async function vsaVracilaPlacila(stripe: Stripe, piId: string): Promise<Vracilo[]> {
  const out: Vracilo[] = []
  for await (const r of (stripe.refunds.list({ payment_intent: piId, limit: 100 }) as any)) {
    out.push({
      id: r.id,
      znesekCenti: Number(r.amount || 0),
      valuta: String(r.currency || 'eur').toLowerCase(),
      vrnjenoOb: sekVDatum(r.created),
      uspesno: r.status === 'succeeded',
    })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────
// 1) Katero placilo zadeva dogodek (samo ID-ji)
// ─────────────────────────────────────────────────────────────────

export type Referenca = {
  paymentIntentId?: string | null
  stripeInvoiceId?: string | null
  checkoutSessionId?: string | null
  chargeId?: string | null
}

export function referencaIzDogodka(event: any): Referenca | null {
  const o = event?.data?.object || {}
  switch (event?.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return { checkoutSessionId: o.id }
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
      return { stripeInvoiceId: o.id }
    case 'payment_intent.succeeded':
      return { paymentIntentId: o.id }
    case 'charge.succeeded':
    case 'charge.refunded':
    case 'charge.dispute.created':
    case 'charge.dispute.closed':
      return { paymentIntentId: id(o.payment_intent), chargeId: o.object === 'dispute' ? id(o.charge) : o.id }
    case 'charge.refund.updated':
    case 'refund.created':
    case 'refund.updated':
      return { paymentIntentId: id(o.payment_intent), chargeId: id(o.charge) }
    default:
      return null
  }
}

// ─────────────────────────────────────────────────────────────────
// 2a) Normalizacija PREK STRIPE API (priporoceno - neodvisno od verzije)
// ─────────────────────────────────────────────────────────────────

export async function normalizirajPrekoApi(stripe: Stripe, ref: Referenca): Promise<Placilo | Preskok> {
  let piId = ref.paymentIntentId ?? null
  let inId = ref.stripeInvoiceId ?? null
  let seja: any = null

  if (ref.checkoutSessionId) {
    seja = await stripe.checkout.sessions.retrieve(ref.checkoutSessionId)
    if (seja.payment_status !== 'paid') {
      return { preskok: 'checkout_ni_placan', podrobnosti: { payment_status: seja.payment_status } }
    }
    piId = piId ?? id(seja.payment_intent)
    inId = inId ?? id(seja.invoice)
  }

  if (!piId && ref.chargeId) {
    const ch: any = await stripe.charges.retrieve(ref.chargeId)
    piId = id(ch.payment_intent)
    if (!piId) {
      // Stara neposredna bremenitev brez PaymentIntent (Charges API).
      if (ch.status !== 'succeeded') return { preskok: 'bremenitev_ni_uspela' }
      return {
        kljuc: ch.id, paymentIntentId: null, chargeId: ch.id, stripeInvoiceId: null, checkoutSessionId: null,
        znesekCenti: Number(ch.amount_captured ?? ch.amount ?? 0), valuta: String(ch.currency || 'eur').toLowerCase(),
        vrnjenoCenti: Number(ch.amount_refunded || 0), placano: !!ch.paid && ch.status === 'succeeded',
        placanoOb: sekVDatum(ch.created), kupecIme: ch.billing_details?.name ?? null,
        kupecEmail: ch.billing_details?.email ?? ch.receipt_email ?? null, opis: ch.description ?? null,
        vir: 'bremenitev', opomba: '', metadata: ch.metadata || {},
        vracila: (ch.refunds?.data || []).map((r: any) => ({ id: r.id, znesekCenti: Number(r.amount || 0), valuta: String(r.currency || 'eur').toLowerCase(), vrnjenoOb: sekVDatum(r.created), uspesno: r.status === 'succeeded' })),
        spor: !!ch.disputed,
      }
    }
  }

  let racun: any = null
  if (inId) {
    racun = await stripe.invoices.retrieve(inId, { expand: ['payments'] } as any)
    if (!piId) {
      const pl = (racun.payments?.data || []).find((p: any) => p?.payment?.type === 'payment_intent' && p?.status === 'paid')
      piId = id(pl?.payment?.payment_intent)
    }
    if (!piId) {
      // Stripe racun, placan BREZ placila prek Stripa: iz dobroimetja
      // stranke ali oznacen "placan izven Stripa".
      if (racun.status !== 'paid') return { preskok: 'stripe_racun_ni_placan', podrobnosti: { status: racun.status } }
      // Pregled 326 (S5): tak racun je pogosto ze zaracunan drugje (gotovina,
      // nakazilo) ali poravnan z dobroimetjem iz prejsnjega placila - zato NE
      // samodejno, ampak v pregled z gumbom "Izdaj racun".
      return {
        kljuc: racun.id, paymentIntentId: null, chargeId: null, stripeInvoiceId: racun.id, checkoutSessionId: seja?.id ?? null,
        znesekCenti: Number(racun.total ?? 0), valuta: String(racun.currency || 'eur').toLowerCase(),
        vrnjenoCenti: 0, placano: true, placanoOb: sekVDatum(racun.status_transitions?.paid_at),
        kupecIme: racun.customer_name ?? null, kupecEmail: racun.customer_email ?? null,
        opis: opisPostavk(racun) || racun.description || null, vir: 'racun',
        opomba: ' Plačano izven Stripe ali iz dobroimetja stranke.',
        metadata: racun.metadata || {}, vracila: [], spor: false,
        pregled: 'placano_izven_stripe_ali_dobroimetje',
      }
    }
  }

  if (!piId) return { preskok: 'placilo_ni_najdeno' }

  const pi: any = await stripe.paymentIntents.retrieve(piId, { expand: ['latest_charge'] } as any)
  if (pi.status !== 'succeeded') return { preskok: 'placilo_ni_uspelo', podrobnosti: { status: pi.status } }
  const ch: any = typeof pi.latest_charge === 'object' ? pi.latest_charge : null

  // Pripada placilo Stripe racunu? (od API 2025-03-31 povezava prek InvoicePayment)
  // Pregled 326 (B3): napaka tu se NE pogoltne - ce ne vemo, ali placilo
  // pripada Stripe racunu ali Checkoutu, bi lahko nastal dvojnik (racun pod
  // stripe-in_/stripe-cs_ iz casa pred 326). Napaka -> ponovni poskus.
  if (!racun) {
    const ip: any = await (stripe as any).invoicePayments.list({ payment: { type: 'payment_intent', payment_intent: piId }, limit: 1 })
    const najden = id(ip?.data?.[0]?.invoice)
    if (najden) racun = await stripe.invoices.retrieve(najden)
  }
  if (!seja && !racun) {
    const s: any = await stripe.checkout.sessions.list({ payment_intent: piId, limit: 1 } as any)
    seja = s?.data?.[0] ?? null
  }
  let opis: string | null = null
  if (racun) opis = opisPostavk(racun) || racun.description || null
  if (!opis && seja) {
    try {
      const li: any = await stripe.checkout.sessions.listLineItems(seja.id, { limit: 50 })
      opis = (li?.data || []).map((x: any) => x?.description).filter(Boolean).join(', ') || null
    } catch { /* ni kriticno */ }
  }
  opis = opis || pi.description || null

  const vracila = Number(ch?.amount_refunded || 0) > 0 ? await vsaVracilaPlacila(stripe, piId) : []

  return {
    kljuc: pi.id,
    paymentIntentId: pi.id,
    chargeId: ch?.id ?? null,
    stripeInvoiceId: racun?.id ?? null,
    checkoutSessionId: seja?.id ?? null,
    znesekCenti: Number(pi.amount_received ?? pi.amount ?? 0),
    valuta: String(pi.currency || 'eur').toLowerCase(),
    vrnjenoCenti: Number(ch?.amount_refunded || 0),
    placano: true,
    placanoOb: sekVDatum(ch?.created ?? pi.created),
    kupecIme: ch?.billing_details?.name ?? racun?.customer_name ?? seja?.customer_details?.name ?? pi.shipping?.name ?? null,
    kupecEmail: ch?.billing_details?.email ?? pi.receipt_email ?? racun?.customer_email ?? seja?.customer_details?.email ?? null,
    opis,
    vir: racun ? 'racun' : seja ? 'checkout' : 'placilo',
    opomba: '',
    metadata: { ...(seja?.metadata || {}), ...(pi.metadata || {}) },
    vracila,
    spor: !!ch?.disputed,
  }
}

// ─────────────────────────────────────────────────────────────────
// 2b) Normalizacija IZ VSEBINE DOGODKA (brez kljuca za branje)
// ─────────────────────────────────────────────────────────────────
// Deluje za API verzije, ki v dogodku se nosijo povezavo placilo <-> racun
// (do 2025-02-24). Pri novejsih verzijah nekaterih primerov ni mogoce
// varno lociti - takrat PRESKOK z razlogom (resitev: kljuc za branje).

export function normalizirajIzDogodka(event: any): Placilo | Preskok {
  const o = event?.data?.object || {}
  const ob = sekVDatum(event?.created)
  switch (event?.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      if (o.mode === 'subscription') return { preskok: 'subscription_checkout_awaiting_invoice_paid' }
      if (o.invoice) return { preskok: 'checkout_with_invoice_awaiting_invoice_paid' }
      if (o.payment_status !== 'paid') return { preskok: 'checkout_ni_placan', podrobnosti: { payment_status: o.payment_status } }
      const pi = id(o.payment_intent)
      return {
        kljuc: pi || o.id, paymentIntentId: pi, chargeId: null, stripeInvoiceId: null, checkoutSessionId: o.id,
        znesekCenti: Number(o.amount_total ?? 0), valuta: String(o.currency || 'eur').toLowerCase(), vrnjenoCenti: 0,
        placano: true, placanoOb: ob, kupecIme: o.customer_details?.name ?? null, kupecEmail: o.customer_details?.email ?? null,
        opis: null, vir: 'checkout', opomba: '', metadata: o.metadata || {}, vracila: [], spor: false,
      }
    }
    case 'invoice.paid':
    case 'invoice.payment_succeeded': {
      const pi = id(o.payment_intent) // prisoten do API 2025-02-24
      const total = Number(o.total ?? 0)
      const placano = Number(o.amount_paid ?? 0)
      let opomba = ''
      let pregled: string | undefined
      if (total > 0 && placano <= 0) { opomba = ' Plačano izven Stripe ali iz dobroimetja stranke.'; pregled = 'placano_izven_stripe_ali_dobroimetje' }
      return {
        kljuc: pi || o.id, paymentIntentId: pi, chargeId: id(o.charge), stripeInvoiceId: o.id, checkoutSessionId: null,
        znesekCenti: total > 0 ? total : placano, valuta: String(o.currency || 'eur').toLowerCase(), vrnjenoCenti: 0,
        placano: true, placanoOb: sekVDatum(o.status_transitions?.paid_at, ob),
        kupecIme: o.customer_name ?? null, kupecEmail: o.customer_email ?? null,
        opis: opisPostavk(o) || o.description || null, vir: 'racun', opomba, metadata: o.metadata || {}, vracila: [], spor: false, pregled,
      }
    }
    case 'payment_intent.succeeded': {
      if (o.invoice) return { preskok: 'payment_intent_for_invoice_awaiting_invoice_paid', podrobnosti: { invoice: o.invoice } }
      if (!('invoice' in o)) return { preskok: 'payment_intent_api_version_unsupported', podrobnosti: { api_version: event.api_version ?? null } }
      const ch = o.charges?.data?.[0] ?? {}
      return {
        kljuc: o.id, paymentIntentId: o.id, chargeId: ch.id ?? id(o.latest_charge), stripeInvoiceId: null, checkoutSessionId: null,
        znesekCenti: Number(o.amount_received ?? o.amount ?? 0), valuta: String(o.currency || 'eur').toLowerCase(),
        vrnjenoCenti: Number(ch.amount_refunded || 0), placano: true, placanoOb: ob,
        kupecIme: ch.billing_details?.name ?? o.shipping?.name ?? null,
        kupecEmail: ch.billing_details?.email ?? o.receipt_email ?? null,
        opis: o.description ?? null, vir: 'placilo', opomba: '', metadata: o.metadata || {}, vracila: [], spor: false,
      }
    }
    default:
      // Vracila in spori brez kljuca za branje: iz dogodka ne vemo zanesljivo,
      // kateremu racunu pripadajo -> preskok z jasnim razlogom.
      return { preskok: 'potreben_kljuc_za_branje', podrobnosti: { event_type: event?.type } }
  }
}

export const jePreskok = (x: Placilo | Preskok): x is Preskok => (x as any).preskok !== undefined

// ─────────────────────────────────────────────────────────────────
// 3) Izdaja racuna / dobropisa
// ─────────────────────────────────────────────────────────────────

async function naslednjaStevilka(supabase: any, orgId: string): Promise<string> {
  // Najvisja STR-LLLL-NNNN + 1 (glej komentar v webhooks/stripe, 16.8.2026).
  const leto = new Date().getFullYear()
  const { data } = await supabase.from('issued_invoices').select('invoice_number').eq('org_id', orgId).like('invoice_number', `STR-${leto}-%`)
  const vz = new RegExp(`^STR-${leto}-(\\d+)$`)
  const max = (data ?? []).reduce((m: number, r: any) => { const x = vz.exec(String(r.invoice_number ?? '')); return x ? Math.max(m, parseInt(x[1], 10)) : m }, 0)
  return `STR-${leto}-${String(max + 1).padStart(4, '0')}`
}

type VpisIzid = { id: string; stevilka: string } | { dvojnik: true } | { trk: true; sporocilo: string }

/** Vpis z do 3 poskusi; loci "isto placilo ze ima racun" od "trk stevilke". */
async function vpisiSStevilko(supabase: any, orgId: string, vrstica: Record<string, any>): Promise<VpisIzid> {
  let zadnja = ''
  for (let poskus = 0; poskus < 3; poskus++) {
    const stevilka = await naslednjaStevilka(supabase, orgId)
    const { data, error } = await supabase.from('issued_invoices').insert({ ...vrstica, invoice_number: stevilka }).select('id').single()
    if (!error && data) return { id: data.id, stevilka }
    if (error?.code !== '23505') throw new Error(`Vpis računa ni uspel: ${error?.message}`)
    const besedilo = `${error.message || ''} ${error.details || ''}`
    if (/issued_invoices_org_webhook_ref_uniq|external_reference/.test(besedilo)) return { dvojnik: true }
    zadnja = error.message
  }
  return { trk: true, sporocilo: zadnja }
}

async function najdiRacunPoReferencah(supabase: any, orgId: string, reference: (string | null)[]): Promise<string | null> {
  const refs = Array.from(new Set(reference.filter(Boolean).map(r => `stripe-${r}`)))
  if (refs.length === 0) return null
  const { data } = await supabase.from('issued_invoices').select('id').eq('org_id', orgId).in('external_reference', refs).limit(1)
  return data?.[0]?.id ?? null
}

async function fiskaliziraj(supabase: any, orgId: string, racunId: string) {
  try {
    const r = await confirmIssuedInvoiceWithFurs(supabase, orgId, racunId, 'card')
    if (!r.success) console.error('FURS potrditev Stripe dokumenta ni uspela:', racunId, r.error)
    return r
  } catch (e: any) {
    console.error('FURS potrditev Stripe dokumenta - nepricakovana napaka:', racunId, e?.message)
    return null
  }
}

async function izdajRacun(supabase: any, org: any, p: Placilo): Promise<VpisIzid> {
  const bruto = p.znesekCenti / 100
  const neto = bruto / (org.vat_registered ? 1.22 : 1)
  const ddv = org.vat_registered ? bruto - neto : 0
  const r2 = (x: number) => Math.round(x * 100) / 100
  const danes = lokalniDatum()
  const datumPlacila = lokalniDatum(p.placanoOb)
  const kupec = p.kupecIme || p.kupecEmail || 'Stranka iz Stripe'
  const opis = (p.opis || `Stripe plačilo #${p.kljuc}`).slice(0, 300)
  const postavke = [{ description: opis, quantity: 1, unit_price: r2(neto), amount_net: r2(neto), vat_rate: org.vat_registered ? 22 : 0, vat_amount: r2(ddv) }]

  const vpis = await vpisiSStevilko(supabase, org.id, {
    org_id: org.id,
    invoice_type: 'invoice',
    client_name: kupec,
    client_email: p.kupecEmail,
    issue_date: danes,
    due_date: danes,
    service_date_from: datumPlacila,
    service_date_to: datumPlacila,
    line_items: postavke,
    amount_net: r2(neto),
    vat_amount: r2(ddv),
    amount_total: r2(bruto),
    status: 'paid',
    paid_at: p.placanoOb.toISOString(),
    paid_amount: bruto,
    notes: `Stripe plačilo (${p.kljuc}).${p.opomba}`,
    external_reference: `stripe-${p.kljuc}`,
  })
  if (!('id' in vpis)) return vpis

  const { error: kpoErr } = await supabase.from('kpo_entries').insert({
    org_id: org.id, entry_date: danes, description: `Stripe — ${kupec}`, entry_type: 'income',
    income: neto, vat_out: ddv, invoice_id: vpis.id, category: 'spletna_prodaja', notes: 'Avtomatski vnos iz Stripe',
  })
  if (kpoErr) console.error('Stripe: racun', vpis.stevilka, 'je nastal, vnos v KPO NI uspel:', kpoErr.message)

  const furs = await fiskaliziraj(supabase, org.id, vpis.id)

  // PDF + e-posta kupcu (napaka tu NIKOLI ne podre obdelave - racun obstaja).
  const koncnaSt = (furs?.success && furs.invoiceNumber) ? furs.invoiceNumber : vpis.stevilka
  if (p.kupecEmail) {
    try {
      const zaPdf = {
        invoice_number: koncnaSt, invoice_type: 'invoice', client_name: kupec, client_email: p.kupecEmail,
        issue_date: danes, due_date: danes, line_items: postavke, amount_net: r2(neto), vat_amount: r2(ddv), amount_total: r2(bruto),
        status: 'paid', paid_at: p.placanoOb.toISOString(), zoi: furs?.zoi ?? null, eor: furs?.eor ?? null, organizations: org,
      }
      const qr = await generateUpnQr(zaPdf, org)
      let fursQr: string | undefined
      if (furs?.success && furs.zoi) { try { fursQr = await generateFursQr(furs.zoi, new Date(danes)) } catch { /* brez QR */ } }
      const pdf = await renderToBuffer(InvoicePDF({ invoice: zaPdf, org, qrDataUrl: qr, fursQrDataUrl: fursQr }) as any)
      const html = buildInvoiceEmailHtml({
        orgName: org.name, invoiceNumber: koncnaSt, issueDate: danes, amount: bruto, dueDate: danes,
        customMessage: 'Vaše Stripe plačilo je bilo uspešno zaključeno. V prilogi je račun.', iban: org.iban ?? null, reference: null,
      })
      const { error: mErr } = await resend.emails.send({
        from: posiljateljZa(org.name), to: [p.kupecEmail], subject: `Račun ${koncnaSt}`, html,
        attachments: [{ filename: `racun-${koncnaSt}.pdf`, content: pdf }],
      } as any)
      if (!mErr) await supabase.from('issued_invoices').update({ last_email_sent_at: new Date().toISOString() }).eq('id', vpis.id)
      else console.error('Stripe: e-posta z racunom ni bila poslana:', vpis.id, mErr.message)
    } catch (e: any) {
      console.error('Stripe: PDF/e-posta racuna ni uspela:', vpis.id, e?.message)
    }
  }
  return vpis
}

async function izdajDobropis(supabase: any, org: any, v: Vracilo, izvirnikId: string, kljucPlacila: string): Promise<VpisIzid | { napaka: string }> {
  const { data: izv } = await supabase.from('issued_invoices')
    .select('id, invoice_number, client_name, client_email, amount_net, vat_amount, amount_total, line_items')
    .eq('id', izvirnikId).single()
  if (!izv) return { napaka: 'izvirni_racun_ni_najden' }
  const skupaj = Number(izv.amount_total || 0)
  if (skupaj <= 0) return { napaka: 'izvirni_racun_brez_zneska' }
  const r2 = (x: number) => Math.round(x * 100) / 100
  const bruto = v.znesekCenti / 100
  const delez = Math.min(1, bruto / skupaj)
  const neto = r2(Number(izv.amount_net || 0) * delez)
  const ddv = r2(bruto - neto)
  const stopnja = Number(izv.line_items?.[0]?.vat_rate ?? 0)
  const danes = lokalniDatum()
  const datumVracila = lokalniDatum(v.vrnjenoOb)

  const vpis = await vpisiSStevilko(supabase, org.id, {
    org_id: org.id,
    invoice_type: 'credit_note',
    related_invoice_id: izv.id,
    client_name: izv.client_name,
    client_email: izv.client_email,
    issue_date: danes,
    due_date: danes,
    service_date_from: datumVracila,
    service_date_to: datumVracila,
    // Postavke POZITIVNE, zneski racuna negativni - enako kot rocni dobropis v
    // aplikaciji; FURS predznak vzame iz amount_total (pregled 326, B4).
    line_items: [{ description: `Vračilo po računu ${izv.invoice_number}`, quantity: 1, unit_price: neto, amount_net: neto, vat_rate: stopnja, vat_amount: ddv }],
    amount_net: -neto,
    vat_amount: -ddv,
    amount_total: -r2(bruto),
    status: 'paid',
    paid_at: v.vrnjenoOb.toISOString(),
    paid_amount: -r2(bruto),
    notes: `Dobropis — Stripe vračilo ${v.id} (plačilo ${kljucPlacila}) k računu ${izv.invoice_number}.`,
    external_reference: `stripe-${v.id}`,
  })
  if (!('id' in vpis)) return vpis

  const { error: kpoErr } = await supabase.from('kpo_entries').insert({
    org_id: org.id, entry_date: danes, description: `Stripe vračilo — ${izv.client_name}`, entry_type: 'income',
    income: -neto, vat_out: -ddv, invoice_id: vpis.id, category: 'spletna_prodaja', notes: 'Avtomatski vnos iz Stripe (vračilo)',
  })
  if (kpoErr) console.error('Stripe: dobropis', vpis.stevilka, 'je nastal, vnos v KPO NI uspel:', kpoErr.message)
  await fiskaliziraj(supabase, org.id, vpis.id)
  return vpis
}

// ─────────────────────────────────────────────────────────────────
// 4) Obdelava placila v knjigi (idempotentno)
// ─────────────────────────────────────────────────────────────────

const gostitelj = (u: any) => { try { return new URL(String(u)).host.replace(/^www\./, '').toLowerCase() } catch { return '' } }

async function nastaviStanje(supabase: any, orgId: string, kljuc: string, stanje: string, razlog: string | null, racunId?: string | null) {
  const upd: Record<string, any> = { stanje, razlog, posodobljeno: new Date().toISOString() }
  if (racunId !== undefined) upd.racun_id = racunId
  const { error } = await supabase.from('stripe_placila').update(upd).eq('org_id', orgId).eq('kljuc', kljuc)
  if (error) console.error('stripe_placila: stanja ni bilo mogoce zapisati:', kljuc, error.message)
}

export type OpcijeObdelave = {
  // Rocna potrditev ("Izdaj racun"): obide pregled, ki caka na odlocitev
  // uporabnika (placilo pred zacetkom samodejne izdaje, izven Stripa ...).
  prisili?: boolean
}

/**
 * Od kdaj Racunko racune za Stripe placila izdaja SAMODEJNO.
 * Pregled 326 (B1): uskladitev bi sicer izdala racune tudi za placila pred
 * povezavo ali za placila, ki jih je uporabnik ze rocno zaracunal - DVOJNIK.
 * Starejsa placila gredo v 'pregled' z gumbom "Izdaj racun".
 */
async function zacetekSamodejneIzdaje(supabase: any, orgId: string): Promise<Date | null> {
  const { data } = await supabase.from('integrations').select('samodejno_od, created_at').eq('org_id', orgId).eq('type', 'stripe').maybeSingle()
  const v = data?.samodejno_od ?? data?.created_at ?? null
  return v ? new Date(v) : null
}

/**
 * Pregled 326 (S1): racun, ki obstaja, a mu manjka vnos v KPO ali FURS
 * potrditev (npr. streznik prekinjen sredi obdelave), se dopolni. Vrne
 * razlog, ce kaj se vedno manjka (vidno v Integracijah in na nadzorni plosci).
 */
async function dokoncajRacun(supabase: any, orgId: string, racunId: string, kupec: string, ravnokarIzdan: boolean): Promise<string | null> {
  const { data: rac } = await supabase.from('issued_invoices').select('id, amount_net, vat_amount, issue_date, eor, zoi, invoice_type').eq('id', racunId).maybeSingle()
  if (!rac) return 'racun_ne_obstaja'
  const { data: kpo } = await supabase.from('kpo_entries').select('id').eq('invoice_id', racunId).limit(1)
  if (!kpo || kpo.length === 0) {
    const { error } = await supabase.from('kpo_entries').insert({
      org_id: orgId, entry_date: rac.issue_date, description: `Stripe — ${kupec}`, entry_type: 'income',
      income: Number(rac.amount_net || 0), vat_out: Number(rac.vat_amount || 0), invoice_id: racunId,
      category: 'spletna_prodaja', notes: 'Avtomatski vnos iz Stripe (dopolnitev)',
    })
    if (error) return 'kpo_manjka'
  }
  if (!rac.eor) {
    // Ravnokar izdan racun je izdajRacun ze poskusil potrditi - ne podvajamo klica.
    if (ravnokarIzdan) return 'furs_ni_potrjen'
    const r = await fiskaliziraj(supabase, orgId, racunId)
    if (!r?.success) return 'furs_ni_potrjen'
  }
  return null
}

export async function obdelajPlacilo(supabase: any, org: any, p: Placilo, izvor: string, opcije: OpcijeObdelave = {}): Promise<IzidObdelave> {
  const orgId = org.id
  // 1. Knjiga: vpis ali dopolnitev (null vrednosti NE prepisejo ze znanih).
  const vrstica: Record<string, any> = {
    org_id: orgId, kljuc: p.kljuc, znesek_centi: p.znesekCenti, valuta: p.valuta,
    vrnjeno_centi: p.vrnjenoCenti, placano: p.placano, placano_ob: p.placanoOb.toISOString(),
    vir: p.vir, spor: p.spor, zadnji_dogodek: izvor, posodobljeno: new Date().toISOString(),
  }
  const neobvezno: Record<string, any> = {
    payment_intent_id: p.paymentIntentId, charge_id: p.chargeId, stripe_invoice_id: p.stripeInvoiceId,
    checkout_session_id: p.checkoutSessionId, kupec_ime: p.kupecIme, kupec_email: p.kupecEmail, opis: p.opis,
  }
  for (const [k, v] of Object.entries(neobvezno)) if (v) vrstica[k] = v
  const { data: zapis, error: upErr } = await supabase
    .from('stripe_placila').upsert(vrstica, { onConflict: 'org_id,kljuc' }).select('stanje, racun_id').single()
  if (upErr || !zapis) {
    console.error('stripe_placila: vpis ni uspel:', p.kljuc, upErr?.message)
    return { stanje: 'napaka', razlog: 'knjiga_placil_nedostopna', ponovi: true }
  }

  // Vrstica, ki jo je zabeleziNeobdelano ustvaril pod drugim ID-jem istega
  // placila (cs_/in_/ch_, ker dogodek ni nosil pi_), je zdaj odvec.
  const drugiIdji = [p.checkoutSessionId, p.stripeInvoiceId, p.chargeId, p.paymentIntentId].filter((x): x is string => !!x && x !== p.kljuc)
  if (drugiIdji.length) {
    await supabase.from('stripe_placila').delete().eq('org_id', orgId).in('kljuc', drugiIdji).is('racun_id', null).neq('stanje', 'izdan')
  }

  const kupec = p.kupecIme || p.kupecEmail || 'Stranka iz Stripe'
  const samodejnoOd = await zacetekSamodejneIzdaje(supabase, orgId)
  const predZacetkom = (d: Date) => !opcije.prisili && !!samodejnoOd && d.getTime() < samodejnoOd.getTime() - 5 * 60_000
  let racunId: string | null = zapis.racun_id ?? null
  let novRacun = false

  // 2. Racun (natanko enkrat).
  if (!racunId) {
    // Racuni pred preletom 326 imajo reference stripe-cs_/stripe-in_/stripe-pi_.
    racunId = await najdiRacunPoReferencah(supabase, orgId, [p.kljuc, p.paymentIntentId, p.stripeInvoiceId, p.checkoutSessionId, p.chargeId])
    if (!racunId) {
      let preskok: { stanje: 'preskoceno' | 'pregled'; razlog: string } | null = null
      if (!p.placano) preskok = { stanje: 'preskoceno', razlog: 'ni_placano' }
      else if (p.znesekCenti <= 0) preskok = { stanje: 'preskoceno', razlog: 'amount_zero_or_negative' }
      else if (p.valuta !== 'eur') preskok = { stanje: 'pregled', razlog: `tuja_valuta_${p.valuta}` }
      else if (p.metadata?.order_id && p.metadata?.site_url) {
        // WooCommerce Stripe Gateway: racun izda WooCommerce integracija (prelet 325).
        const { data: woo } = await supabase.from('integrations').select('settings').eq('org_id', orgId).eq('type', 'woocommerce').eq('is_active', true).maybeSingle()
        if (woo && gostitelj(woo.settings?.shop_url) && gostitelj(woo.settings?.shop_url) === gostitelj(p.metadata.site_url)) {
          preskok = { stanje: 'preskoceno', razlog: 'woocommerce_order_invoiced_by_woocommerce' }
        }
      }
      if (!preskok && !opcije.prisili) {
        if (p.pregled) preskok = { stanje: 'pregled', razlog: p.pregled }
        else if (p.vrnjenoCenti >= p.znesekCenti) preskok = { stanje: 'pregled', razlog: 'v_celoti_vrnjeno_pred_racunom' }
        else if (predZacetkom(p.placanoOb)) preskok = { stanje: 'pregled', razlog: 'pred_zacetkom_samodejne_izdaje' }
      }
      if (preskok) {
        // Preskok ne sme prepisati ze izdanega stanja (hkratna obdelava).
        if (zapis.stanje !== 'izdan') await nastaviStanje(supabase, orgId, p.kljuc, preskok.stanje, preskok.razlog)
        return { stanje: preskok.stanje, razlog: preskok.razlog }
      }

      const izid = await izdajRacun(supabase, org, p)
      if ('id' in izid) {
        racunId = izid.id
        novRacun = true
      } else if ('dvojnik' in izid) {
        racunId = await najdiRacunPoReferencah(supabase, orgId, [p.kljuc])
      } else {
        await nastaviStanje(supabase, orgId, p.kljuc, 'napaka', 'invoice_number_conflict')
        return { stanje: 'napaka', razlog: 'invoice_number_conflict', ponovi: true }
      }
    }
  }

  // 2b. Racun obstaja - dopolnimo, kar morda manjka (KPO, FURS).
  const manjka = racunId ? await dokoncajRacun(supabase, orgId, racunId, kupec, novRacun) : 'racun_ne_obstaja'
  await nastaviStanje(supabase, orgId, p.kljuc, 'izdan', manjka, racunId)

  // 3. Vracila -> dobropisi (vsako vracilo natanko enkrat).
  let dobropisov = 0
  for (const v of p.vracila) {
    const { data: vz } = await supabase.from('stripe_vracila')
      .upsert({ org_id: orgId, refund_id: v.id, kljuc_placila: p.kljuc, znesek_centi: v.znesekCenti, valuta: v.valuta, vrnjeno_ob: v.vrnjenoOb.toISOString(), posodobljeno: new Date().toISOString() }, { onConflict: 'org_id,refund_id' })
      .select('stanje, dobropis_id').single()
    const oznaci = (stanje: string, razlog: string | null, dobropisId?: string | null) =>
      supabase.from('stripe_vracila').update({ stanje, razlog, ...(dobropisId !== undefined ? { dobropis_id: dobropisId } : {}), posodobljeno: new Date().toISOString() }).eq('org_id', orgId).eq('refund_id', v.id)

    if (!v.uspesno) {
      // Pregled 326 (S6): vracilo, ki je pozneje spodletelo, ima morda ze dobropis.
      if (vz?.dobropis_id) await oznaci('pregled', 'vracilo_ni_uspelo_dobropis_obstaja')
      continue
    }
    if (vz?.dobropis_id) continue
    if (!racunId) { await oznaci('pregled', 'placilo_brez_racuna'); continue }
    if (v.valuta !== 'eur') { await oznaci('pregled', `tuja_valuta_${v.valuta}`); continue }
    if (predZacetkom(v.vrnjenoOb)) { await oznaci('pregled', 'pred_zacetkom_samodejne_izdaje'); continue }
    const d = await izdajDobropis(supabase, org, v, racunId, p.kljuc)
    if ('id' in d) {
      dobropisov++
      await oznaci('izdan', null, d.id)
    } else if ('dvojnik' in d) {
      await oznaci('izdan', null, await najdiRacunPoReferencah(supabase, orgId, [v.id]))
    } else {
      await oznaci('napaka', 'napaka' in d ? d.napaka : 'invoice_number_conflict')
    }
  }

  return { stanje: 'izdan', racunId, novRacun, dobropisov, razlog: manjka ?? undefined }
}

/**
 * Pregled 326 (B5, B2, B3): dogodek, ki ga ni bilo mogoce varno obdelati
 * (kljuc ne deluje, kljuc drugega nacina/racuna, brez kljuca ni mogoce
 * lociti ...), se zapise v knjigo kot 'napaka'/'pregled', ce iz vsebine
 * dogodka razberemo placilo - da je VIDNO, ne le v dnevniku.
 */
export async function zabeleziNeobdelano(supabase: any, orgId: string, event: any, stanje: 'napaka' | 'pregled', razlog: string): Promise<void> {
  const o = event?.data?.object || {}
  const piId = o.object === 'payment_intent' ? o.id : id(o.payment_intent)
  const kljuc = piId || o.id
  if (!kljuc) return
  const centi = Number(o.amount_received ?? o.amount_total ?? o.total ?? o.amount ?? 0)
  const { data: obst } = await supabase.from('stripe_placila').select('stanje').eq('org_id', orgId).eq('kljuc', kljuc).maybeSingle()
  if (obst?.stanje === 'izdan') return
  const { error } = await supabase.from('stripe_placila').upsert({
    org_id: orgId, kljuc, znesek_centi: centi, valuta: String(o.currency || 'eur').toLowerCase(),
    placano: true, placano_ob: sekVDatum(event?.created).toISOString(), vir: 'placilo',
    stanje, razlog, zadnji_dogodek: event?.type ?? null, posodobljeno: new Date().toISOString(),
    ...(piId ? { payment_intent_id: piId } : {}),
  }, { onConflict: 'org_id,kljuc' })
  if (error) console.error('stripe_placila: neobdelanega dogodka ni bilo mogoce zabeleziti:', error.message)
}

// ─────────────────────────────────────────────────────────────────
// 5) Uskladitev: vsa placila zadnjih N dni iz Stripa
// ─────────────────────────────────────────────────────────────────

export type IzidUskladitve = { pregledanih: number; novihRacunov: number; dobropisov: number; zaPregled: number; napak: number; napake: string[]; casPotekel: boolean }

export async function uskladiOrg(supabase: any, org: any, stripe: Stripe, dni: number, rokMs = 40_000): Promise<IzidUskladitve> {
  const zacetek = Date.now()
  const od = Math.floor(Date.now() / 1000) - dni * 86400
  const izid: IzidUskladitve = { pregledanih: 0, novihRacunov: 0, dobropisov: 0, zaPregled: 0, napak: 0, napake: [], casPotekel: false }

  // Ze obdelana placila (racun izdan brez manjkajocega, vracila enaka) preskocimo brez klicev API.
  const { data: znana } = await supabase.from('stripe_placila').select('kljuc, stanje, razlog, vrnjeno_centi').eq('org_id', org.id).gte('placano_ob', new Date(od * 1000).toISOString())
  const znano = new Map<string, any>((znana || []).map((z: any) => [z.kljuc, z]))

  const casPotekel = () => {
    if (Date.now() - zacetek <= rokMs) return false
    izid.casPotekel = true
    return true
  }
  const obdelaj = async (ref: Referenca, kljucHint: string, vrnjenoHint: number | null) => {
    const z = znano.get(kljucHint)
    const koncano = z && ((z.stanje === 'izdan' && !z.razlog) || z.stanje === 'preskoceno' || z.stanje === 'pregled')
    if (koncano && (vrnjenoHint === null || Number(z.vrnjeno_centi) === vrnjenoHint)) return
    izid.pregledanih++
    try {
      const p = await normalizirajPrekoApi(stripe, ref)
      if (jePreskok(p)) return
      const r = await obdelajPlacilo(supabase, org, p, 'uskladitev')
      if (r.novRacun) izid.novihRacunov++
      izid.dobropisov += r.dobropisov || 0
      if (r.stanje === 'pregled') izid.zaPregled++
      if (r.stanje === 'napaka') { izid.napak++; izid.napake.push(`${kljucHint}: ${r.razlog}`) }
    } catch (e: any) {
      izid.napak++
      izid.napake.push(`${kljucHint}: ${e?.message || e}`)
    }
  }
  const sklop = async (ime: string, fn: () => Promise<void>) => {
    try { await fn() } catch (e: any) { izid.napak++; izid.napake.push(`${ime}: ${e?.message || e}`) }
  }

  // a) Vsa uspesna placila (PaymentIntent) - checkout, Stripe racuni, samostojna.
  await sklop('placila', async () => {
    for await (const pi of (stripe.paymentIntents.list({ created: { gte: od }, limit: 100, expand: ['data.latest_charge'] } as any) as any)) {
      if (casPotekel()) break
      if (pi.status !== 'succeeded') continue
      const vrnjeno = typeof pi.latest_charge === 'object' && pi.latest_charge ? Number(pi.latest_charge.amount_refunded || 0) : null
      await obdelaj({ paymentIntentId: pi.id }, pi.id, vrnjeno)
    }
  })
  // b) Stripe racuni, placani BREZ placila prek Stripa -> v pregled (ne samodejno).
  await sklop('racuni', async () => {
    for await (const inv of (stripe.invoices.list({ status: 'paid', created: { gte: od }, limit: 100, expand: ['data.payments'] } as any) as any)) {
      if (casPotekel()) break
      const sPlacilom = (inv.payments?.data || []).some((p: any) => p?.payment?.type === 'payment_intent')
      if (sPlacilom || Number(inv.total || 0) <= 0) continue
      await obdelaj({ stripeInvoiceId: inv.id }, inv.id, null)
    }
  })
  // c) Vracila v oknu - tudi za placila, starejsa od okna.
  await sklop('vracila', async () => {
    for await (const rf of (stripe.refunds.list({ created: { gte: od }, limit: 100 } as any) as any)) {
      if (casPotekel()) break
      const piId = id(rf.payment_intent)
      if (!piId) continue
      const { data: ze } = await supabase.from('stripe_vracila').select('stanje').eq('org_id', org.id).eq('refund_id', rf.id).maybeSingle()
      if (ze?.stanje === 'izdan' && rf.status === 'succeeded') continue
      if (!ze && rf.status !== 'succeeded') continue
      await obdelaj({ paymentIntentId: piId }, `${piId}#${rf.id}`, -1)
    }
  })

  if (izid.casPotekel) izid.napake.push('časovna omejitev — preostanek ob naslednji uskladitvi')
  else await supabase.from('integrations').update({ zadnja_uskladitev: new Date().toISOString() }).eq('org_id', org.id).eq('type', 'stripe')
  return izid
}

// ─────────────────────────────────────────────────────────────────
// 6) Preverba nastavitve (kljuc + webhook)
// ─────────────────────────────────────────────────────────────────

export type Preverba = { ok: boolean; naslov: string; opis: string }

export const POTREBNI_DOGODKI = ['checkout.session.completed', 'invoice.paid', 'payment_intent.succeeded', 'charge.refunded']

export async function preveriNastavitev(stripe: Stripe, orgId: string): Promise<Preverba[]> {
  const out: Preverba[] = []
  const poskusi = async (naslov: string, fn: () => Promise<any>, dovoljenje: string) => {
    try { await fn(); out.push({ ok: true, naslov, opis: 'Dostop deluje.' }) }
    catch (e: any) {
      const brezPravic = e?.statusCode === 403 || /permission|does not have the required/i.test(String(e?.message))
      out.push({ ok: false, naslov, opis: brezPravic ? `Ključ nima dovoljenja "${dovoljenje}" (Read).` : String(e?.message || e) })
    }
  }
  await poskusi('Plačila', () => stripe.paymentIntents.list({ limit: 1 }), 'PaymentIntents')
  await poskusi('Bremenitve in vračila', () => stripe.refunds.list({ limit: 1 }), 'Charges and Refunds')
  await poskusi('Računi', () => stripe.invoices.list({ limit: 1 }), 'Invoices')
  await poskusi('Checkout', () => stripe.checkout.sessions.list({ limit: 1 }), 'Checkout Sessions')

  try {
    const ep: any = await stripe.webhookEndpoints.list({ limit: 100 })
    const nasi = (ep.data || []).filter((w: any) => String(w.url || '').includes(`org_id=${orgId}`))
    if (nasi.length === 0) {
      out.push({ ok: false, naslov: 'Webhook', opis: 'V Stripu ni webhooka, ki bi kazal na Računko za to organizacijo. Nočna uskladitev bo plačila vseeno zajela, a z zamikom do enega dne.' })
    } else {
      for (const w of nasi) {
        const vsi = (w.enabled_events || []).includes('*')
        const manjka = vsi ? [] : POTREBNI_DOGODKI.filter(d => !(w.enabled_events || []).includes(d))
        out.push({
          ok: w.status === 'enabled' && manjka.length === 0,
          naslov: `Webhook ${w.id}`,
          opis: w.status !== 'enabled' ? 'Webhook je v Stripu onemogočen.'
            : manjka.length ? `Manjkajo dogodki: ${manjka.join(', ')} (dodajte jih v Stripe → Edit destination).`
            : 'Pravilno nastavljen.',
        })
      }
    }
  } catch (e: any) {
    out.push({ ok: false, naslov: 'Webhook', opis: 'Ključ nima dovoljenja "Webhook Endpoints" (Read) — nastavitve webhooka ni mogoče preveriti (ni obvezno).' })
  }
  return out
}
