/**
 * PAKET ORGANIZACIJE – EN SAM VIR RESNICE (revizija paketov, 6.10.2026)
 *
 * Doslej je vsaka stran in vsaka API pot sama brala `subscription_status`
 * in ga primerjala s 'pro'/'pro_pos'. Dve napaki, ki ju to odpravlja:
 *
 *  1. `trial_ends_at` se ni upostevalo nikjer. Preizkus je zakljucil samo
 *     nocni pg_cron posel - ce ne tece, je preizkus Pro + POS trajal za vedno,
 *     do naslednjega zagona pa je imela organizacija ves dostop.
 *  2. Pravila (kaj sodi v Pro, kaj v Pro + POS) so bila razpršena po
 *     ducatu datotek in so se razhajala s cenikom.
 *
 * Isto pravilo kot `efektivniPaket` ima baza v funkciji `efektivni_paket`
 * (migracija 182) - sprozilci v bazi in koda morata govoriti isto.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type Paket = 'free' | 'pro' | 'pro_pos'

export type OrgNarocnina = {
  subscription_status?: string | null
  trial_ends_at?: string | null
  stripe_subscription_id?: string | null
} | null | undefined

/** Najvec racunov v brezplacnem paketu - SKUPAJ, ne na mesec. */
export const BREZPLACNI_RACUNI = 5

/** Preizkus brez placila, ki se je ze iztekel. */
export function jeIztekelPreizkus(org: OrgNarocnina, zdaj: Date = new Date()): boolean {
  if (!org?.trial_ends_at || org.stripe_subscription_id) return false
  return new Date(org.trial_ends_at).getTime() <= zdaj.getTime()
}

/** Preizkus brez placila, ki se tece. */
export function jeVPreizkusu(org: OrgNarocnina, zdaj: Date = new Date()): boolean {
  return !!org?.trial_ends_at && !org.stripe_subscription_id && !jeIztekelPreizkus(org, zdaj)
}

/**
 * Paket, ki ga organizacija DEJANSKO ima.
 * 'cancelled', neznane vrednosti in iztekel preizkus brez placila -> 'free'.
 */
export function efektivniPaket(org: OrgNarocnina, zdaj: Date = new Date()): Paket {
  const s = org?.subscription_status
  if (s !== 'pro' && s !== 'pro_pos') return 'free'
  if (jeIztekelPreizkus(org, zdaj)) return 'free'
  return s
}

export const imaPro = (org: OrgNarocnina, zdaj?: Date) => efektivniPaket(org, zdaj) !== 'free'
export const imaPos = (org: OrgNarocnina, zdaj?: Date) => efektivniPaket(org, zdaj) === 'pro_pos'

export const IME_PAKETA: Record<Paket, string> = { free: 'Brezplačno', pro: 'Pro', pro_pos: 'Pro + POS' }

/** Stolpci, ki jih potrebuje `efektivniPaket` - za .select(). */
export const STOLPCI_PAKETA = 'subscription_status, trial_ends_at, stripe_subscription_id'

// ─────────────────────────────────────────────────────────────────
// FUNKCIJE S CENIKA
// ─────────────────────────────────────────────────────────────────

export type Funkcija =
  | 'furs' | 'email' | 'skener' | 'ai' | 'uvoz_banke' | 'uvoz_pdf' | 'eslog'
  | 'izvoz' | 'racunovodja' | 'zahtevki'
  | 'pos' | 'zaloge' | 'ekipa_pin' | 'pos_kartica'

const POTREBEN: Record<Funkcija, Exclude<Paket, 'free'>> = {
  furs: 'pro', email: 'pro', skener: 'pro', ai: 'pro', uvoz_banke: 'pro', uvoz_pdf: 'pro',
  eslog: 'pro', izvoz: 'pro', racunovodja: 'pro', zahtevki: 'pro',
  pos: 'pro_pos', zaloge: 'pro_pos', ekipa_pin: 'pro_pos', pos_kartica: 'pro_pos',
}

export function potrebenPaket(f: Funkcija): Exclude<Paket, 'free'> {
  return POTREBEN[f]
}

export function dovoljeno(org: OrgNarocnina, f: Funkcija, zdaj?: Date): boolean {
  return POTREBEN[f] === 'pro' ? imaPro(org, zdaj) : imaPos(org, zdaj)
}

/** Sporocilo za 403, ko funkcija ni v paketu. */
export function sporociloPaketa(f: Funkcija, opis?: string): string {
  const ime = POTREBEN[f] === 'pro' ? 'v paketih Pro in Pro + POS' : 'v paketu Pro + POS'
  return `${opis ?? 'Ta funkcija'} je na voljo ${ime}. Paket izberete v Nastavitve → Naročnina.`
}

// ─────────────────────────────────────────────────────────────────
// STREZNIK
// ─────────────────────────────────────────────────────────────────

type Bralec = Pick<SupabaseClient, 'from'>

/** Prebere organizacijo in vrne njen efektivni paket. */
export async function naloziPaket(sb: Bralec, orgId: string): Promise<Paket> {
  const { data } = await sb.from('organizations').select(STOLPCI_PAKETA).eq('id', orgId).maybeSingle()
  return efektivniPaket(data)
}

/**
 * Za API poti: vrne `null`, ce je funkcija dovoljena, sicer odgovor 403.
 *
 *   const zavrnjeno = await zahtevajPaket(supabase, orgId, 'furs', 'FURS fiskalizacija')
 *   if (zavrnjeno) return zavrnjeno
 */
export async function zahtevajPaket(sb: Bralec, orgId: string, f: Funkcija, opis?: string): Promise<Response | null> {
  const { data } = await sb.from('organizations').select(STOLPCI_PAKETA).eq('id', orgId).maybeSingle()
  if (dovoljeno(data, f)) return null
  return Response.json({ error: sporociloPaketa(f, opis), paket: potrebenPaket(f) }, { status: 403 })
}

// ─────────────────────────────────────────────────────────────────
// STRANI (middleware)
// ─────────────────────────────────────────────────────────────────

/**
 * Strani, ki so v celoti funkcija placljivega paketa. Strani z evidencami
 * (racuni, KPO, DDV, dnevni zakljucki) NISO tu: po izteku paketa morajo
 * podatki ostati berljivi (10-letna hramba), zaklene se samo funkcija.
 */
export const STRANI_PAKETA: { predpona: string; funkcija: Funkcija }[] = [
  { predpona: '/pos', funkcija: 'pos' },
  { predpona: '/zaloge', funkcija: 'zaloge' },
  { predpona: '/ai', funkcija: 'ai' },
  { predpona: '/scan', funkcija: 'skener' },
  { predpona: '/banka', funkcija: 'uvoz_banke' },
]

/** Funkcija, ki jo zahteva pot, ali null. '/pos' ne sme ujeti '/posta'. */
export function funkcijaZaPot(pathname: string): Funkcija | null {
  for (const s of STRANI_PAKETA) {
    if (pathname === s.predpona || pathname.startsWith(s.predpona + '/')) return s.funkcija
  }
  return null
}

/** Funkcija s cenika, ki jo odpre povabilo z dano vlogo (null = brez omejitve). */
export function funkcijaVloge(role: string): Funkcija | null {
  if (role === 'accountant' || role === 'viewer') return 'racunovodja'
  if (role === 'cashier') return 'ekipa_pin'
  return null
}
