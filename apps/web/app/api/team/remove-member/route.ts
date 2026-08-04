import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { resolveActiveOrgId, getRequestedOrgId } from '@/lib/active-org-server'

// NOV ENDPOINT (30.7.2026, audit K8) - glej team/change-role/route.ts za
// polno razlago problema. Isti popravek za odstranitev clana.

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value }, set() {}, remove() {} } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })

    const { memberId } = await req.json()
    if (!memberId) return NextResponse.json({ error: 'Manjka memberId' }, { status: 400 })

    // POPRAVLJENO (30.7.2026): podpora vec organizacijam - prej je
    // .maybeSingle() ob vec clanstvih vrnil NAPAKO.
    const { orgId: callerOrgId, role: callerRole } = await resolveActiveOrgId(
      supabase, user.id, getRequestedOrgId(req)
    )
    const caller = callerOrgId ? { org_id: callerOrgId, role: callerRole } : null
    if (!caller) return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })
    if (!['owner', 'admin'].includes(caller.role)) {
      return NextResponse.json({ error: 'Nimate pravic za odstranjevanje članov' }, { status: 403 })
    }

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    const { data: target } = await admin
      .from('org_members')
      .select('id, org_id, role')
      .eq('id', memberId)
      .maybeSingle()
    if (!target || target.org_id !== caller.org_id) {
      return NextResponse.json({ error: 'Član ni najden v vaši organizaciji' }, { status: 404 })
    }

    // SAMO owner sme odstraniti drugega owner-ja (admin ne sme)
    if (target.role === 'owner' && caller.role !== 'owner') {
      return NextResponse.json({ error: 'Samo lastnik lahko odstrani drugega lastnika' }, { status: 403 })
    }

    // Ce odstranjujemo owner-ja, preveri da ni zadnji
    if (target.role === 'owner') {
      const { count } = await admin
        .from('org_members')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', caller.org_id)
        .eq('role', 'owner')
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: 'Ne morete odstraniti edinega lastnika organizacije' }, { status: 400 })
      }
    }

    const { error } = await admin.from('org_members').delete().eq('id', memberId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
