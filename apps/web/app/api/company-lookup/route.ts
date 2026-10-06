import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { poisciPodjetje } from '@/lib/register-zavezancev'

export const dynamic = 'force-dynamic'

/**
 * Iskanje podatkov o podjetju po davcni stevilki.
 *
 * Oktober 2026: vir je register davcnih zavezancev FURS (tabela
 * register_zavezancev, polni /api/cron/register-zavezancev), ce zavezanca ni,
 * se VIES (samo zavezanci za DDV, omejitev 5 s). Nekdanji zunanji
 * slo-podjetja-api.eu ne deluje vec in je odstranjen. FURS nima TRR, zato je
 * transakcijski_računi vedno null.
 *
 * Varnost (16.8.2026): zahteva prijavo, vnos mora biti 8 mest (lahko s SI).
 */
export async function GET(req: NextRequest) {
  // 1. Zahtevamo prijavo
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set() {}, remove() {},
      },
    },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
  }

  const tax = req.nextUrl.searchParams.get('tax')
  if (!tax) return NextResponse.json({ error: 'Manjka davčna številka' }, { status: 400 })

  // 2. Preverba oblike: slovenska davcna stevilka je 8 mest, lahko s predpono SI
  const ocisceno = tax.replace(/^SI/i, '').replace(/\s/g, '')
  if (!/^\d{8}$/.test(ocisceno)) {
    return NextResponse.json({ error: 'Davčna številka mora imeti 8 mest' }, { status: 400 })
  }

  try {
    // Tabela je dostopna samo s service role (RLS brez politik).
    const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const podatki = await poisciPodjetje(ocisceno, { db })
    if (!podatki) return NextResponse.json({ error: 'Ni najdeno' }, { status: 404 })
    return NextResponse.json(podatki)
  } catch (e: any) {
    console.error('[company-lookup]', e?.message)
    return NextResponse.json({ error: 'Iskanje trenutno ni na voljo' }, { status: 500 })
  }
}
