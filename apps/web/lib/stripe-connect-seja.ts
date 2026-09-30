import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveActiveOrgId, getRequestedOrgId } from '@/lib/active-org-server'

/**
 * Prijavljen uporabnik in njegova AKTIVNA organizacija za poti plačil s
 * Stripe (prelet 357). Enak vzorec kot api/furs/invoice: seja iz piškotka,
 * organizacija preverjena prek članstva (nikoli slepo iz zahteve).
 */
export async function sejaInOrganizacija(req: Request) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value }, set() {}, remove() {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { orgId, role } = await resolveActiveOrgId(supabase, user.id, getRequestedOrgId(req))
  if (!orgId) return null
  return { supabase, user, orgId, role: String(role || '').toLowerCase() }
}

export function jeLastnik(role: string) {
  return ['owner', 'lastnik', 'admin'].includes(role)
}
