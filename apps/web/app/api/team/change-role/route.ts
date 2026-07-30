import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// NOV ENDPOINT (30.7.2026, audit K8): prej je sprememba vloge tekla
// NEPOSREDNO iz brskalnika (supabase.from('org_members').update({role})),
// brez ikakrsnega preverjanja pravic - UI je gumbe skril za ne-lastnike,
// a to je bilo SAMO kozmeticno (konzola v brskalniku to zaobide v celoti),
// RLS politika pa je dovoljevala UPDATE vsakemu clanu organizacije.
// Posledica: blagajnik/racunovodja bi lahko sebe povzdignil v 'owner'.
//
// Ta endpoint doda PRAVO strežniško preverjanje pred vsako spremembo.

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value }, set() {}, remove() {} } }
  )
}

const VALID_ROLES = ['owner', 'admin', 'cashier', 'viewer', 'accountant']

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })

    const { memberId, newRole } = await req.json()
    if (!memberId || !newRole) return NextResponse.json({ error: 'Manjkajo parametri' }, { status: 400 })
    if (!VALID_ROLES.includes(newRole)) return NextResponse.json({ error: 'Neveljavna vloga' }, { status: 400 })

    const { data: caller } = await supabase
      .from('org_members')
      .select('id, org_id, role')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!caller) return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })
    if (!['owner', 'admin'].includes(caller.role)) {
      return NextResponse.json({ error: 'Nimate pravic za spreminjanje vlog' }, { status: 403 })
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

    // SAMO owner sme podeliti ALI odvzeti 'owner' vlogo - admin ne sme
    // povzdigniti nikogar (niti sebe) v owner, niti degradirati obstojecega owner-ja.
    if ((newRole === 'owner' || target.role === 'owner') && caller.role !== 'owner') {
      return NextResponse.json({ error: 'Samo lastnik lahko spreminja lastniško vlogo' }, { status: 403 })
    }

    // Ce degradiramo owner-ja (ali sebe, ce sem owner), preveri da ni zadnji
    if (target.role === 'owner' && newRole !== 'owner') {
      const { count } = await admin
        .from('org_members')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', caller.org_id)
        .eq('role', 'owner')
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: 'Organizacija mora imeti vsaj enega lastnika - najprej dodelite lastništvo drugemu članu' }, { status: 400 })
      }
    }

    const { error } = await admin.from('org_members').update({ role: newRole }).eq('id', memberId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
