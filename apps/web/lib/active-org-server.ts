import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Strežniška različica izbire aktivne organizacije (audit 30.7.2026).
 *
 * API endpointi nimajo dostopa do localStorage, zato:
 *  1. če odjemalec pošlje org_id (glava x-active-org ali telo zahteve),
 *     se PREVERI, ali je uporabnik res član te organizacije, in uporabi
 *  2. sicer se vzame prva (najstarejša) organizacija uporabnika
 *
 * Ključno: org_id se NIKOLI ne zaupa slepo — vedno se preveri članstvo.
 * (Enaka napaka je bila najdena v stripe/test endpointu, ki je org_id
 * jemal iz telesa zahteve brez preverjanja.)
 */
export async function resolveActiveOrgId(
  supabase: SupabaseClient,
  userId: string,
  requestedOrgId?: string | null
): Promise<{ orgId: string | null; role: string | null }> {
  const { data: memberships } = await supabase
    .from('org_members')
    .select('org_id, role, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (!memberships || memberships.length === 0) {
    return { orgId: null, role: null }
  }

  if (requestedOrgId) {
    const match = memberships.find(m => m.org_id === requestedOrgId)
    if (match) return { orgId: match.org_id, role: match.role }
    // Zahtevana organizacija ni med uporabnikovimi — NE uporabi je.
    // Pade na prvo (varno), namesto da bi vrnila tuje podatke.
  }

  return { orgId: memberships[0]?.org_id, role: memberships[0]?.role }
}

/** Prebere zaželeno organizacijo iz glave zahteve (če jo odjemalec pošlje). */
export function getRequestedOrgId(req: Request): string | null {
  return req.headers.get('x-active-org')
}


/**
 * Kot resolveActiveOrgId, a vrne tudi ORGANIZACIJO z izbranimi polji.
 *
 * Nadomesca vzorec:
 *   .from('org_members').select('organizations(subscription_status)')
 *     .eq('user_id', ...).maybeSingle()
 * ki je ob vec clanstvih vracal NAPAKO.
 *
 * @param columns polja organizacije, npr. 'subscription_status' ali
 *                'id, name, stripe_customer_id'
 */
export async function resolveActiveOrg(
  supabase: SupabaseClient,
  userId: string,
  requestedOrgId: string | null,
  columns: string = '*'
): Promise<{ orgId: string | null; role: string | null; organizations: any | null }> {
  const { orgId, role } = await resolveActiveOrgId(supabase, userId, requestedOrgId)
  if (!orgId) return { orgId: null, role: null, organizations: null }

  const { data: org } = await supabase
    .from('organizations')
    .select(columns)
    .eq('id', orgId)
    .maybeSingle()

  return { orgId, role, organizations: org ?? null }
}
