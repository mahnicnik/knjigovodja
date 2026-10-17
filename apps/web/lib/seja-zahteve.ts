import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createJwtClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * Supabase odjemalec za API pot, ki jo klice SPLET (piskotki seje) ALI
 * ANDROID BLAGAJNA (JWT seje telefona v `Authorization: Bearer ...`).
 * API kljuci (rk_...) sem ne spadajo - zanje velja /api/v1 (lib/api-auth).
 * Isti vzorec kot /api/furs/invoice (16.10.2026).
 */
export function jwtIzGlave(req: NextRequest): string | null {
  const g = req.headers.get('authorization') || ''
  if (!g.startsWith('Bearer ')) return null
  const t = g.slice(7).trim()
  return t && !t.startsWith('rk_') ? t : null
}

export async function sejaZahteve(req: NextRequest): Promise<{ supabase: any; userId: string | null }> {
  const jwt = jwtIzGlave(req)
  if (jwt) {
    const supabase = createJwtClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user } } = await supabase.auth.getUser(jwt)
    return { supabase, userId: user?.id ?? null }
  }
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value }, set() {}, remove() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, userId: user?.id ?? null }
}
