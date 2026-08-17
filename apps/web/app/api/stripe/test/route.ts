import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveActiveOrgId, resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'

// POPRAVLJENO (30.7.2026, audit API sloja):
//
// PREJ: endpoint NI imel NOBENE avtentikacije, jemal je org_id iz TELESA
// ZAHTEVE, in s service-role kljucem (obide RLS) bral stripe_settings.
// secret_key TE organizacije. Ceprav skrivnega kljuca ni vracal, je
// razkril Stripe racun (ID, ime podjetja ali e-naslov) KATEREKOLI
// organizacije, ce si poznal njen org_id - brez prijave.
//
// ZDAJ: preveri prijavo IN da je klicatelj dejansko clan te organizacije
// (org_id se ne jemlje vec iz telesa zahteve, ampak se izpelje iz seje).

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const authed = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value }, set() {}, remove() {} } }
    )

    const { data: { user } } = await authed.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
    }

    // org_id se IZPELJE IZ SEJE, ne jemlje iz telesa zahteve - s tem je
    // dostop do tuje organizacije strukturno nemogoc.
    const { orgId: __orgId, role: __role } = await resolveActiveOrgId(authed, user.id, getRequestedOrgId(request))
    const member = __orgId ? { org_id: __orgId, role: __role } : null // vec-org podpora (30.7.2026)

    if (!member) {
      return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })
    }
    if (!['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Nimate pravic za pregled Stripe nastavitev' }, { status: 403 })
    }

    const { data: settings } = await sb
      .from('stripe_settings').select('secret_key').eq('org_id', member.org_id).maybeSingle()

    if (!settings?.secret_key) {
      return NextResponse.json({ error: 'Stripe ključ ni nastavljen' }, { status: 400 })
    }

    // Test z Stripe API
    const res = await fetch('https://api.stripe.com/v1/account', {
      // POPRAVLJENO (17.8.2026): casovna omejitev - brez nje zahteva ob
      // neodzivni storitvi visi, dokler je streznik sam ne prekine.
      signal: AbortSignal.timeout(10000),
      headers: { 'Authorization': `Bearer ${settings.secret_key}` }
    })

    const data = await res.json()

    if (data.error) {
      return NextResponse.json({ error: data.error.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      account_id: data.id,
      account_name: data.business_profile?.name || data.email || data.id,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
