import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { generateApiKey } from '@/lib/api-auth'
import { resolveActiveOrgId, resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set() {}, remove() {},
      },
    }
  )
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })

    const { orgId: __orgId, role: __role } = await resolveActiveOrgId(supabase, user.id, getRequestedOrgId(req))
    const member = __orgId ? { org_id: __orgId, role: __role } : null // vec-org podpora (30.7.2026)

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Nimate dovoljenja za generiranje API ključev' }, { status: 403 })
    }

    const body = await req.json()
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Ime ključa je obvezno' }, { status: 400 })
    }

    const { key, prefix, hash } = generateApiKey(false)

    const { error } = await supabase.from('api_keys').insert({
      org_id: member.org_id,
      name: body.name.trim(),
      key_hash: hash,
      key_prefix: prefix,
      is_active: true,
    })

    if (error) throw new Error(error.message)

    // Vrni SAMO enkrat — ne shranjujemo plain text ključa
    return NextResponse.json({ success: true, key })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}