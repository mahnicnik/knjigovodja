/**
 * PRELET 357: PLACILA STRANK PREK STRIPE CONNECT (Express).
 * ═══════════════════════════════════════════════════════════
 *
 * LOCENO OD NAROCNIN RACUNKA. app/api/stripe/{checkout,portal,webhook} in
 * STRIPE_SECRET_KEY so za naroCnino Racunka. Placila strank tecejo prek
 * platformnega kljuca STRIPE_CONNECT_SECRET_KEY na POVEZANEM racunu
 * uporabnika (direct charges, glava Stripe-Account) - denar gre neposredno
 * uporabniku, Stripe mu provizijo zaracuna sam ("Stripe handles pricing").
 *
 * SAMO TESTNI NACIN: dokler ni izrecno dovoljeno (STRIPE_CONNECT_DOVOLI_LIVE=1),
 * zivi kljuc (sk_live_) ne deluje - odjemalec vrne napako, nic se ne zaracuna.
 *
 * DAVCNO POTRJEVANJE JE OBVEZNO: placilo s Stripe je na voljo SAMO podjetju z
 * veljavnim FURS certifikatom in poslovnim prostorom (ali v predstavitvi,
 * furs_demo_mode). Glej preveriPogoje().
 */
import Stripe from 'stripe'
import { createClient as ustvariAdmin, type SupabaseClient } from '@supabase/supabase-js'

export const CONNECT_API_VERZIJA = '2026-04-22.dahlia'

/** Najmanjsi znesek, ki ga Stripe sprejme v EUR (0,50 EUR). */
export const NAJMANJ_CENTI = 50

export class ConnectNiNastavljen extends Error {}

export function stripeConnect(): Stripe {
  const kljuc = process.env.STRIPE_CONNECT_SECRET_KEY
  if (!kljuc) throw new ConnectNiNastavljen('Plačila s kartico (Stripe) na strežniku še niso nastavljena.')
  if (kljuc.startsWith('sk_live_') || kljuc.startsWith('rk_live_')) {
    if (process.env.STRIPE_CONNECT_DOVOLI_LIVE !== '1') {
      throw new ConnectNiNastavljen('Stripe Connect je trenutno dovoljen samo v testnem načinu.')
    }
  }
  return new Stripe(kljuc, { apiVersion: CONNECT_API_VERZIJA as any, maxNetworkRetries: 2, timeout: 20000 })
}

export function connectNastavljen(): boolean {
  const k = process.env.STRIPE_CONNECT_SECRET_KEY
  if (!k) return false
  if ((k.startsWith('sk_live_') || k.startsWith('rk_live_')) && process.env.STRIPE_CONNECT_DOVOLI_LIVE !== '1') return false
  return true
}

export function jeTestniKljuc(): boolean {
  return (process.env.STRIPE_CONNECT_SECRET_KEY || '').startsWith('sk_test_')
}

/**
 * Provizija Racunka (application_fee_amount) v centih.
 * Nastavitev STRIPE_CONNECT_PROVIZIJA_ODSTOTEK, privzeto 0 - Racunko ne
 * zaracuna nicesar. Pri 0 polja sploh ne posljemo Stripu.
 */
export function provizijaCenti(znesekCenti: number, odstotek = Number(process.env.STRIPE_CONNECT_PROVIZIJA_ODSTOTEK || 0)): number {
  if (!Number.isFinite(odstotek) || odstotek <= 0) return 0
  return Math.min(znesekCenti - 1, Math.round(znesekCenti * odstotek / 100))
}

export function adminSupabase(): SupabaseClient {
  return ustvariAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

export function javniUrl(req?: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL
  if (env) return env.replace(/\/$/, '')
  if (req) return new URL(req.url).origin
  return 'https://xn--raunko-j2a.si'
}

// ─────────────────────────────────────────────────────────────────
// POGOJI ZA PLACILO S STRIPE
// ─────────────────────────────────────────────────────────────────

export type Pogoji = {
  nastavljeno: boolean          // platformni kljuc na strezniku
  stripePovezan: boolean        // organizacija ima povezan racun
  stripeAktiven: boolean        // charges_enabled
  fursOk: boolean               // veljaven certifikat + poslovni prostor (ali demo)
  fursRazlog: string | null
  demo: boolean
  paketPos: boolean             // Pro + POS (blagajna)
  paketPortal: boolean          // Pro ali Pro + POS (zahtevki)
  accountId: string | null
}

export async function preveriPogoje(admin: SupabaseClient, orgId: string): Promise<Pogoji> {
  const { data: org } = await admin
    .from('organizations')
    .select('id, subscription_status, furs_demo_mode, furs_test_mode, stripe_account_id, stripe_charges_enabled')
    .eq('id', orgId)
    .maybeSingle()
  const status = String(org?.subscription_status || 'free')
  const demo = !!org?.furs_demo_mode
  let fursOk = false
  let fursRazlog: string | null = null
  if (demo) {
    fursOk = true
  } else {
    const isTest = org?.furs_test_mode ?? false
    const danes = new Date().toISOString().slice(0, 10)
    const [{ data: cert }, { data: prostor }] = await Promise.all([
      admin.from('furs_certificates').select('id, valid_to')
        .eq('org_id', orgId).eq('is_active', true).eq('is_test', isTest).maybeSingle(),
      admin.from('business_premises').select('id')
        .eq('org_id', orgId).eq('is_active', true).limit(1).maybeSingle(),
    ])
    if (!cert) fursRazlog = 'Za plačila s kartico mora biti naložen veljaven FURS certifikat.'
    else if (cert.valid_to && String(cert.valid_to) < danes) fursRazlog = 'FURS certifikat je potekel — naložite novega.'
    else if (!prostor) fursRazlog = 'Za plačila s kartico mora biti vpisan poslovni prostor pri FURS.'
    else fursOk = true
  }
  return {
    nastavljeno: connectNastavljen(),
    stripePovezan: !!org?.stripe_account_id,
    stripeAktiven: !!org?.stripe_account_id && !!org?.stripe_charges_enabled,
    fursOk,
    fursRazlog,
    demo,
    paketPos: status === 'pro_pos',
    paketPortal: status === 'pro' || status === 'pro_pos',
    accountId: org?.stripe_account_id ?? null,
  }
}

// ─────────────────────────────────────────────────────────────────
// ZNESEK NAROCILA - IZRACUNAN NA STREZNIKU IZ POSTAVK
// ─────────────────────────────────────────────────────────────────

export type VrsticaNarocila = {
  name: string
  qty: number | string
  unit_price: number | string
  mods?: Array<{ name?: string; delta?: number | string }> | null
  voided?: boolean | null
}

export type NarociloZaZnesek = {
  discount_pct?: number | string | null
  discount_fixed?: number | string | null
  tip_amount?: number | string | null
}

const r2 = (x: number) => Math.round(x * 100) / 100

/**
 * Enak izracun kot sprozilec trg_recalc_order_total v bazi (prelet 178), le
 * da znesek VRSTICE izracuna znova iz kolicine, cene in doplacil - ne vzame
 * zneska, ki ga je vpisal brskalnik. Brskalnik ne poslje nobenega zneska.
 */
export function izracunajZnesekNarocila(order: NarociloZaZnesek, vrstice: VrsticaNarocila[]) {
  const postavke = vrstice
    .filter(v => !v.voided)
    .map(v => {
      const kolicina = Number(v.qty) || 0
      const doplacila = (v.mods || []).reduce((s, m) => s + (Number(m?.delta) || 0), 0)
      const znesek = Math.max(0, (Number(v.unit_price) + doplacila) * kolicina)
      return { ime: String(v.name || 'Postavka'), kolicina, znesek }
    })
  const vmesna = postavke.reduce((s, p) => s + p.znesek, 0)
  const pct = Number(order.discount_pct) || 0
  const fiksni = Number(order.discount_fixed) || 0
  const napitnina = Number(order.tip_amount) || 0
  const popust = Math.min(vmesna, r2(vmesna * pct / 100) + fiksni)
  const skupaj = r2(vmesna - popust + napitnina)
  return {
    postavke,
    vmesna: r2(vmesna),
    popust: r2(popust),
    napitnina: r2(napitnina),
    skupaj,
    centi: Math.round(skupaj * 100),
  }
}

/**
 * Postavke za Stripe Checkout. Kadar na racunu ni popusta ali napitnine in se
 * vsota postavk ujema na cent, gre vsaka postavka posebej (stranka vidi, kaj
 * placa). Sicer ena postavka z opisom - Stripe negativnih postavk ne pozna.
 */
export function postavkeZaCheckout(
  izracun: ReturnType<typeof izracunajZnesekNarocila>,
  naslov: string,
  valuta = 'eur',
) {
  const posamezne = izracun.postavke
    .filter(p => p.znesek > 0)
    .map(p => ({
      quantity: 1,
      price_data: {
        currency: valuta,
        unit_amount: Math.round(p.znesek * 100),
        product_data: { name: (p.kolicina !== 1 ? `${fmtKolicina(p.kolicina)}× ` : '') + p.ime.slice(0, 200) },
      },
    }))
  const vsota = posamezne.reduce((s, p) => s + p.price_data.unit_amount, 0)
  if (izracun.popust === 0 && izracun.napitnina === 0 && vsota === izracun.centi && posamezne.length > 0 && posamezne.length <= 100) {
    return posamezne
  }
  const opis = izracun.postavke.map(p => `${fmtKolicina(p.kolicina)}× ${p.ime}`).join(', ').slice(0, 480)
  return [{
    quantity: 1,
    price_data: {
      currency: valuta,
      unit_amount: izracun.centi,
      product_data: { name: naslov, ...(opis ? { description: opis } : {}) },
    },
  }]
}

function fmtKolicina(k: number) {
  return Number.isInteger(k) ? String(k) : String(k).replace('.', ',')
}

export function eurIzCentov(c: number) {
  return (c / 100).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

/** Nakljucna koda za kratko povezavo /p/[koda] (NFC nalepka). */
export function novaKratkaKoda(dolzina = 8): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bajti = crypto.getRandomValues(new Uint8Array(dolzina))
  return Array.from(bajti, b => abc[b % abc.length]).join('')
}
