'use client'

import { createClient } from '@/lib/supabase'

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  AKTIVNA ORGANIZACIJA — podpora za več organizacij na uporabnika
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Zakaj obstaja (audit 30.7.2026):
 *  Shema org_members ima UNIQUE(org_id, user_id) — uporabnik LAHKO pripada
 *  več organizacijam. A koda je na 36 mestih uporabljala .maybeSingle(),
 *  ki ob več zadetkih VRNE NAPAKO (PGRST116), ne prve vrstice.
 *
 *  Posledica: računovodja, ki ga povabita dve stranki, ali podjetnik z
 *  dvema dejavnostma, dobi prazen zaslon namesto aplikacije.
 *
 *  Ta modul je edina točka, kjer se določi "katera organizacija je aktivna".
 * ═══════════════════════════════════════════════════════════════════════
 */

const STORAGE_KEY = 'rk_active_org_id'

export interface Membership {
  org_id: string
  role: string
  organizations: any
}

/** Vrne shranjeno izbiro (če obstaja). Varno tudi pri strežniškem izrisu. */
export function getStoredOrgId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** Shrani izbiro aktivne organizacije. */
export function setStoredOrgId(orgId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, orgId)
  } catch {
    // localStorage ni na voljo (zasebni način ipd.) — izbira ne bo trajna,
    // aplikacija pa vseeno deluje (pade na prvo organizacijo).
  }
}

/** Počisti izbiro (npr. ob odjavi). */
export function clearStoredOrgId(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

/**
 * Vrne VSA članstva prijavljenega uporabnika, urejena po datumu.
 * Nikoli ne vrže napake ob več organizacijah.
 */
export async function getMemberships(): Promise<Membership[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('org_members')
    .select('org_id, role, organizations(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  return (data ?? []) as unknown as Membership[]
}

/**
 * Vrne AKTIVNO članstvo — shranjeno izbiro, če je še veljavna, sicer prvo.
 *
 * To nadomešča vzorec:
 *   .from('org_members').select('organizations(*)').eq('user_id', ...).single()
 * ki je ob več organizacijah vrnil napako.
 */
export async function getActiveMembership(): Promise<Membership | null> {
  const memberships = await getMemberships()
  if (memberships.length === 0) return null

  const storedId = getStoredOrgId()
  if (storedId) {
    const match = memberships.find(m => m.org_id === storedId)
    if (match) return match
    // Shranjena izbira ni več veljavna (odstranjen dostop) — počisti.
    clearStoredOrgId()
  }

  return memberships[0]
}

/** Bližnjica: samo organizacija aktivnega članstva. */
export async function getActiveOrg(): Promise<any | null> {
  const m = await getActiveMembership()
  return m?.organizations ?? null
}

/** Bližnjica: samo org_id aktivnega članstva. */
export async function getActiveOrgId(): Promise<string | null> {
  const m = await getActiveMembership()
  return m?.org_id ?? null
}
