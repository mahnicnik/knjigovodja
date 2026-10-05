import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveActiveOrgId, getRequestedOrgId } from '@/lib/active-org-server'
import { knjiziPosDneve, dneviMed } from '@/lib/pos-kpo'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Prenos POS prometa v KPO ob Z-porocilu ("Z-porocilo, samo obracun").
 *
 * PREDELANO (revizija V5, oktober 2026): ista pot kot zakljucek izmene -
 * lib/pos-kpo.ts knjizi PO DNEVIH iz izvornih racunov, s stornom in vracili,
 * z locenim DDV po stopnjah in idempotentno (kpo_entries.pos_kljuc).
 *
 * Prej je ta endpoint pisal svoj vnos s kategorijo "POS promet": brez
 * Z-porocila bruto znesek z DDV 0, vracila samo v opombi. Ce je blagajnik
 * isti dan uporabil tudi "Zakljuci", je bil promet knjizen DVAKRAT.
 *
 * Zneska iz telesa zahteve (amount, refunds) NE uporabimo vec - promet se
 * vedno preracuna iz racunov v bazi. Obdobje: okno Z-porocila (z_report_id)
 * ali en dan (date).
 */

async function prijavljenUporabnik() {
  const cookieStore = await cookies()
  const authed = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await authed.auth.getUser()
  return { user, authed }
}

export async function POST(req: NextRequest) {
  try {
    const { user, authed } = await prijavljenUporabnik()
    if (!user) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })

    const { date, z_report_id } = await req.json()
    const supabase = getServiceClient()

    // Organizacija: pri Z-porocilu tista, ki ji pripada blagajna porocila
    // (uporabnik mora biti njen clan); sicer aktivna organizacija.
    // POPRAVLJENO (V5): prej org_members.maybeSingle() - pri clanu vec
    // organizacij napaka ali napacna organizacija.
    let orgId: string | null = null
    let businessId: string | null = null
    let dnevi: string[] = []

    if (z_report_id) {
      const { data: zr } = await supabase.from('z_reports')
        .select('business_id, opened_at, closed_at').eq('id', z_report_id).maybeSingle()
      if (!zr) return NextResponse.json({ error: 'Z-poročilo ne obstaja' }, { status: 404 })
      const { data: org } = await supabase.from('organizations').select('id').eq('pos_business_id', zr.business_id).maybeSingle()
      const { data: clan } = org
        ? await supabase.from('org_members').select('org_id').eq('user_id', user.id).eq('org_id', org.id).maybeSingle()
        : { data: null }
      if (!org || !clan) return NextResponse.json({ error: 'Z-poročilo ne pripada vaši organizaciji' }, { status: 403 })
      orgId = org.id
      businessId = zr.business_id
      dnevi = dneviMed(zr.opened_at, zr.closed_at || new Date().toISOString())
    } else {
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: 'Manjka z_report_id ali date (YYYY-MM-DD)' }, { status: 400 })
      }
      const { orgId: aktivna } = await resolveActiveOrgId(authed as any, user.id, getRequestedOrgId(req))
      if (!aktivna) return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })
      const { data: org } = await supabase.from('organizations').select('pos_business_id').eq('id', aktivna).single()
      orgId = aktivna
      businessId = org?.pos_business_id ?? null
      dnevi = [date]
    }

    if (!orgId || !businessId) {
      return NextResponse.json({ error: 'Organizacija nima blagajne' }, { status: 400 })
    }

    const knjizbe = await knjiziPosDneve(supabase, orgId, businessId, dnevi)
    return NextResponse.json({
      success: true,
      dnevi,
      knjizb: knjizbe.length,
      neto: knjizbe.reduce((s, k) => s + k.neto, 0) / 100,
      ddv: knjizbe.reduce((s, k) => s + k.ddv, 0) / 100,
    })
  } catch (e: any) {
    console.error('sync-income error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
