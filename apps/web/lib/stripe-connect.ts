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
 * PRODUKCIJSKI NACIN (prelet 363): nacin doloca kljuc STRIPE_CONNECT_SECRET_KEY
 * (sk_live_/rk_live_ = zivo, pravi denar; sk_test_ = testno). Povezan racun
 * pripada nacinu, v katerem je bil ustvarjen (organizations.
 * stripe_account_livemode) - ob neujemanju velja, da Stripe ni povezan.
 * V zivem nacinu placila s kartico NISO mogoca v predstavitvi (furs_demo_mode)
 * in s FURS testnim okoljem (furs_test_mode): pravi denar zahteva pravo
 * davcno potrditev.
 *
 * DAVCNO POTRJEVANJE JE OBVEZNO: placilo s Stripe je na voljo SAMO podjetju z
 * veljavnim FURS certifikatom in poslovnim prostorom (ali v predstavitvi,
 * furs_demo_mode). Glej preveriPogoje().
 */
import Stripe from 'stripe'
import { createClient as ustvariAdmin, type SupabaseClient } from '@supabase/supabase-js'
import { prostorZaPortal } from '@/lib/furs-invoice-confirm'
import { efektivniPaket } from '@/lib/paket'

export const CONNECT_API_VERZIJA = '2026-04-22.dahlia'

/** Najmanjsi znesek, ki ga Stripe sprejme v EUR (0,50 EUR). */
export const NAJMANJ_CENTI = 50

export class ConnectNiNastavljen extends Error {}

export function stripeConnect(): Stripe {
  const kljuc = process.env.STRIPE_CONNECT_SECRET_KEY
  if (!kljuc) throw new ConnectNiNastavljen('Plačila s kartico (Stripe) na strežniku še niso nastavljena.')
  return new Stripe(kljuc, { apiVersion: CONNECT_API_VERZIJA as any, maxNetworkRetries: 2, timeout: 20000 })
}

export function connectNastavljen(): boolean {
  const k = process.env.STRIPE_CONNECT_SECRET_KEY
  return !!k
}

export function jeTestniKljuc(): boolean {
  return /^(sk|rk)_test_/.test(process.env.STRIPE_CONNECT_SECRET_KEY || '')
}

/** Zivi (produkcijski) kljuc - pravi denar. */
export function jeZiviKljuc(kljuc = process.env.STRIPE_CONNECT_SECRET_KEY || ''): boolean {
  return /^(sk|rk)_live_/.test(kljuc)
}

/**
 * Ali shranjen povezan racun pripada nacinu kljuca na strezniku. Racuni brez
 * oznake (null) so iz casa pred preletom 363 - vsi testni.
 */
export function racunUstrezaNacinu(livemode: boolean | null | undefined, zivo = jeZiviKljuc()): boolean {
  return (livemode ?? false) === zivo
}

/**
 * PRELET 372: v ZIVEM nacinu smejo Stripe povezati in sprejemati placila samo
 * organizacije s seznama STRIPE_CONNECT_DOVOLJENE_ORG (org_id-ji, locene z
 * vejico). Prazen seznam = nihce. V testnem nacinu seznam ne velja.
 * Ostali vidijo "Placila s kartico — kmalu na voljo".
 *
 * 6.10.2026: "*" = vse organizacije (placila s kartico so na voljo vsem s
 * paketom Pro + POS; paket, FURS certifikat in ostali pogoji se se vedno
 * preverjajo v preveriPogoje / zivoNiDovoljeno).
 */
export function dovoljenaVZivem(
  orgId: string | null | undefined,
  zivo = jeZiviKljuc(),
  seznam = process.env.STRIPE_CONNECT_DOVOLJENE_ORG || '',
): boolean {
  if (!zivo) return true
  if (!orgId) return false
  if (seznam.trim() === '*') return true
  return seznam.split(',').map(x => x.trim().toLowerCase()).filter(Boolean).includes(orgId.toLowerCase())
}

export const KMALU_NA_VOLJO = 'Plačila s kartico — kmalu na voljo.'

/**
 * Razlog, zakaj v ZIVEM nacinu placila s kartico niso mogoca, ali null.
 * Pravi denar mora vedno dobiti pravo davcno potrditev pri FURS.
 */
export function zivoNiDovoljeno(org: { furs_demo_mode?: boolean | null; furs_test_mode?: boolean | null } | null, zivo = jeZiviKljuc()): string | null {
  if (!zivo) return null
  if (org?.furs_demo_mode) return 'V predstavitvi pravih plačil s kartico ni — računi tu niso davčno potrjeni pri FURS.'
  if (org?.furs_test_mode) return 'FURS je v testnem okolju. Za prava plačila s kartico preklopite na produkcijski FURS certifikat.'
  return null
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
  /** PRELET 371 (M5): FURS za racune s portala (prostor 'web' ali 'both'). */
  fursOkPortal: boolean
  fursRazlogPortal: string | null
  demo: boolean
  paketPos: boolean             // Pro + POS (blagajna)
  paketPortal: boolean          // Pro ali Pro + POS (zahtevki)
  accountId: string | null
  /** PRELET 372: zivi nacin, organizacija ni na seznamu - "kmalu na voljo". */
  kmalu: boolean
}

export async function preveriPogoje(admin: SupabaseClient, orgId: string): Promise<Pogoji> {
  const { data: org } = await admin
    .from('organizations')
    .select('id, subscription_status, trial_ends_at, stripe_subscription_id, furs_demo_mode, furs_test_mode, stripe_account_id, stripe_charges_enabled, stripe_account_livemode')
    .eq('id', orgId)
    .maybeSingle()
  // Revizija paketov: efektivni paket (iztekel preizkus = free).
  const status = efektivniPaket(org)
  const demo = !!org?.furs_demo_mode
  let fursOk = false
  let fursRazlog: string | null = null
  let fursOkPortal = false
  let fursRazlogPortal: string | null = null
  const zivoOvira = zivoNiDovoljeno(org)
  if (zivoOvira) {
    fursRazlog = zivoOvira
    fursRazlogPortal = zivoOvira
  } else if (demo) {
    fursOk = true
    fursOkPortal = true
  } else {
    const isTest = org?.furs_test_mode ?? false
    const danes = new Date().toISOString().slice(0, 10)
    const [{ data: cert }, { data: prostori }] = await Promise.all([
      admin.from('furs_certificates').select('id, valid_to')
        .eq('org_id', orgId).eq('is_active', true).eq('is_test', isTest).maybeSingle(),
      admin.from('business_premises').select('id, channel, is_active')
        .eq('org_id', orgId).eq('is_active', true),
    ])
    const r = ocenaFurs({ cert, prostori: prostori || [], danes })
    fursOk = r.fursOk; fursRazlog = r.fursRazlog
    fursOkPortal = r.fursOkPortal; fursRazlogPortal = r.fursRazlogPortal
  }
  // PRELET 372: zivi nacin samo za organizacije s seznama.
  const kmalu = !dovoljenaVZivem(orgId)
  // Racun iz drugega nacina (npr. testni po prehodu na zivo) ne velja.
  const racun = !kmalu && org?.stripe_account_id && racunUstrezaNacinu(org?.stripe_account_livemode) ? org.stripe_account_id : null
  return {
    kmalu,
    nastavljeno: connectNastavljen() && !kmalu,
    stripePovezan: !!racun,
    stripeAktiven: !!racun && !!org?.stripe_charges_enabled,
    fursOk,
    fursRazlog,
    fursOkPortal,
    fursRazlogPortal,
    demo,
    paketPos: status === 'pro_pos',
    paketPortal: status !== 'free',
    accountId: racun,
  }
}

/**
 * PRELET 371 (M5): FURS pogoji iz certifikata in prostorov. Blagajna lahko
 * uporabi katerikoli aktiven prostor (kot potrdiNarociloPriFurs), portal pa
 * samo prostor po pravilu confirmIssuedInvoiceWithFurs (prostorZaPortal).
 */
export function ocenaFurs(o: { cert: { valid_to?: string | null } | null; prostori: { channel?: string | null; is_active?: boolean | null }[]; danes: string }) {
  let certRazlog: string | null = null
  if (!o.cert) certRazlog = 'Za plačila s kartico mora biti naložen veljaven FURS certifikat.'
  else if (o.cert.valid_to && String(o.cert.valid_to) < o.danes) certRazlog = 'FURS certifikat je potekel — naložite novega.'
  const aktivni = o.prostori.filter(p => p.is_active !== false)
  const fursRazlog = certRazlog || (aktivni.length === 0 ? 'Za plačila s kartico mora biti vpisan poslovni prostor pri FURS.' : null)
  const fursRazlogPortal = certRazlog || (!prostorZaPortal(aktivni)
    ? (aktivni.length === 0
      ? 'Za plačila s kartico mora biti vpisan poslovni prostor pri FURS.'
      : 'Za račune s portala mora imeti poslovni prostor kanal »splet« ali »oboje« (prostor samo za blagajno ne velja).')
    : null)
  return { fursOk: !fursRazlog, fursRazlog, fursOkPortal: !fursRazlogPortal, fursRazlogPortal }
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

/** Znesek racuna v CELIH centih (orders.total je numeric(…,2)). */
export function centiNarocila(total: number | string | null | undefined): number {
  return Math.round(Number(total || 0) * 100)
}

/**
 * PRELET 365 (H2): ZNESEK ZA STRIPE = orders.total iz baze.
 *
 * orders.total racuna sprozilec trg_recalc_order_total iz order_lines.total
 * (popusti na vrsticah, modifikatorji ...); isti znesek uporabita pay_order in
 * davcna potrditev. Lasten izracun iz unit_price + mods se je lahko razlikoval
 * za cent (3 × 2,00 € s popustom 1,00 €: racun 5,00 €, Stripe 5,01 €) - zakljucek
 * je nato padel, webhook je vracal 500, Stripe je ponavljal 3 dni.
 * Izracun iz postavk ostane le za opis postavk v Checkoutu; ce se vsota ne
 * ujema na cent, gre ena postavka s tocnim zneskom racuna.
 */
export function znesekZaStripe(order: NarociloZaZnesek & { total: number | string }, vrstice: VrsticaNarocila[]) {
  const izracun = izracunajZnesekNarocila(order, vrstice)
  const centi = centiNarocila(order.total)
  return { ...izracun, centi, skupaj: centi / 100, postavkeSeUjemajo: izracun.centi === centi }
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

// ─────────────────────────────────────────────────────────────────
// PRELET 368 (M2): PREVERBA PLACANE SEJE V WEBHOOKU
// ─────────────────────────────────────────────────────────────────

/**
 * Placana Checkout seja se zakljuci SAMO, ce se ujema z vrstico, ki jo je
 * ustvaril Racunko: ista organizacija, ista (zadnja) seja, isti znesek v
 * centih in valuta. Vrne razlog neujemanja ali null.
 */
export function neujemanjeSeje(
  vrstica: { org_id: string; checkout_session_id: string | null; centi: number; valuta?: string | null } | null,
  sess: { id: string; amount_total: number | null; currency: string | null },
  orgIdIzMetapodatkov: string | undefined,
): string | null {
  if (!vrstica) return 'plačilo v Računku ne obstaja'
  if (!orgIdIzMetapodatkov || vrstica.org_id !== orgIdIzMetapodatkov) return 'organizacija se ne ujema'
  if (!vrstica.checkout_session_id || vrstica.checkout_session_id !== sess.id) return 'seja se ne ujema z zadnjo sejo plačila'
  if (sess.amount_total !== vrstica.centi) return `znesek se ne ujema (plačano ${sess.amount_total} centov, pričakovano ${vrstica.centi})`
  if ((sess.currency || '').toLowerCase() !== (vrstica.valuta || 'eur').toLowerCase()) return `valuta se ne ujema (${sess.currency})`
  return null
}
