/**
 * PAKET ORGANIZACIJE – EN SAM VIR RESNICE (revizija paketov, 6.10.2026)
 *
 * NEPREKRSLJIVO PRAVILO: za organizacije, ki so obstajale ob objavi
 * (organizations.obstojeca_pravila = true, migracija 182), se NE spremeni
 * nic. Vsako NOVO preverjanje paketa se zato zacne z `jeObstojeca` ->
 * dovoljeno. Obstojece preverbe v API poteh (npr. ai-chat, furs/confirm)
 * ostanejo nespremenjene; preverbe iz tega modula so jim samo DODANE.
 *
 * Varno tudi PRED migracijo: ce stolpca obstojeca_pravila se ni (undefined)
 * ali organizacije ni bilo mogoce prebrati (null), velja organizacija za
 * obstojeco - nova pravila se uveljavijo samo ob izrecnem `false`.
 * Zato pri preverbah VEDNO beremo `select('*')`, ne seznama stolpcev:
 * poimenovan stolpec, ki se ne obstaja, bi vrnil napako.
 *
 * Isto pravilo ima baza v `org_dovoljeno` / `efektivni_paket` (migracija 182).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type Paket = 'free' | 'pro' | 'pro_pos'

export type OrgNarocnina = {
  subscription_status?: string | null
  trial_ends_at?: string | null
  stripe_subscription_id?: string | null
  obstojeca_pravila?: boolean | null
} | null | undefined

/** Najvec racunov v brezplacnem paketu (nove organizacije) - skupaj, ne na mesec. */
export const BREZPLACNI_RACUNI = 5

/** Organizacija, ki je obstajala ob objavi (ali stanje pred migracijo): pravila kot doslej. */
export function jeObstojeca(org: OrgNarocnina): boolean {
  return org?.obstojeca_pravila !== false
}

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
 * Obstojece organizacije: kot doslej - samo subscription_status.
 * Nove: 'cancelled', neznane vrednosti in iztekel preizkus brez placila -> 'free'
 * (takoj, ne sele po nocnem pg_cron opravilu).
 */
export function efektivniPaket(org: OrgNarocnina, zdaj: Date = new Date()): Paket {
  const s = org?.subscription_status
  if (s !== 'pro' && s !== 'pro_pos') return 'free'
  if (!jeObstojeca(org) && jeIztekelPreizkus(org, zdaj)) return 'free'
  return s
}

export const imaPro = (org: OrgNarocnina, zdaj?: Date) => efektivniPaket(org, zdaj) !== 'free'
export const imaPos = (org: OrgNarocnina, zdaj?: Date) => efektivniPaket(org, zdaj) === 'pro_pos'

export const IME_PAKETA: Record<Paket, string> = { free: 'Brezplačno', pro: 'Pro', pro_pos: 'Pro + POS' }

// ─────────────────────────────────────────────────────────────────
// FUNKCIJE S CENIKA (samo za nove organizacije)
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

/** Ali sme organizacija uporabiti funkcijo. Obstojece: vedno (kot doslej). */
export function dovoljeno(org: OrgNarocnina, f: Funkcija, zdaj?: Date): boolean {
  if (jeObstojeca(org)) return true
  return POTREBEN[f] === 'pro' ? imaPro(org, zdaj) : imaPos(org, zdaj)
}

/** Sporocilo za 403, ko funkcija ni v paketu. */
export function sporociloPaketa(f: Funkcija, opis?: string): string {
  const ime = POTREBEN[f] === 'pro' ? 'v paketih Pro in Pro + POS' : 'v paketu Pro + POS'
  return `${opis ?? 'Ta funkcija'} je na voljo ${ime}. Paket izberete v Nastavitve → Naročnina.`
}

/** Funkcija s cenika, ki jo odpre povabilo z dano vlogo (null = brez omejitve). */
export function funkcijaVloge(role: string): Funkcija | null {
  if (role === 'accountant' || role === 'viewer') return 'racunovodja'
  if (role === 'cashier') return 'ekipa_pin'
  return null
}

// ─────────────────────────────────────────────────────────────────
// STREZNIK
// ─────────────────────────────────────────────────────────────────

type Bralec = Pick<SupabaseClient, 'from'>

/**
 * DODANA preverba za API poti: vrne `null`, ce je funkcija dovoljena, sicer 403.
 * Obstojece organizacije, neprebrana organizacija in stanje pred migracijo
 * -> vedno `null` (dovoljeno, kot doslej).
 *
 *   const zavrnjeno = await zahtevajPaket(supabase, orgId, 'izvoz', 'Izvoz za računovodjo')
 *   if (zavrnjeno) return zavrnjeno
 */
export async function zahtevajPaket(sb: Bralec, orgId: string, f: Funkcija, opis?: string): Promise<Response | null> {
  const { data } = await sb.from('organizations').select('*').eq('id', orgId).maybeSingle()
  if (dovoljeno(data, f)) return null
  return Response.json({ error: sporociloPaketa(f, opis), paket: potrebenPaket(f) }, { status: 403 })
}

// ─────────────────────────────────────────────────────────────────
// STRANI (middleware)
// ─────────────────────────────────────────────────────────────────

/**
 * Strani, ki so v celoti funkcija placljivega paketa (samo nove organizacije).
 * Strani z evidencami (racuni, KPO, DDV, dnevni zakljucki) NISO tu: po
 * izteku paketa morajo podatki ostati berljivi (10-letna hramba).
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
