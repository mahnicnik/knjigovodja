/**
 * PRENOS NAMENSKEGA POTRDILA NA BLAGAJNIŠKO NAPRAVO (prelet 158)
 * ═══════════════════════════════════════════════════════════════
 *
 * ZAKAJ TA POT OBSTAJA: FURS v pogostih vprašanjih o davčnem potrjevanju
 * izrecno pravi, da se ob programski opremi oziroma namenskem potrdilu
 * "v oblaku" prekinitev internetne povezave šteje za NEDELOVANJE
 * elektronske naprave — račun se sme takrat izdati le iz vezane knjige
 * računov. Da lahko blagajna brez povezave izda VELJAVEN račun z ZOI
 * (9. člen ZDavPR), mora biti potrdilo fizično na napravi, ker se ZOI
 * podpisuje z njegovim zasebnim ključem.
 *
 * VARNOST:
 *  · potrdilo dobi SAMO lastnik organizacije — lastnik se torej enkrat
 *    prijavi na vsaki blagajniški napravi, ki naj dela brez povezave;
 *  · namizna aplikacija ga shrani šifrirano prek OS shrambe ključev
 *    (Electron safeStorage), ne v golem besedilu;
 *  · prenos teče izključno prek HTTPS na prijavljeni seji.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getFursCertificate } from '@/lib/furs-cert'
import { resolveActiveOrgId, getRequestedOrgId } from '@/lib/active-org-server'

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

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
    }

    const { orgId, role } = await resolveActiveOrgId(supabase, user.id, getRequestedOrgId(req))
    if (!orgId) {
      return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })
    }
    if (role !== 'owner') {
      // Blagajnik potrdila ne more prenesti — to je pričakovano in tiho:
      // naprava se pripravi, ko se nanjo enkrat prijavi lastnik.
      return NextResponse.json(
        { error: 'Potrdilo lahko na napravo prenese samo lastnik.' },
        { status: 403 }
      )
    }

    const { cert, isTest } = await getFursCertificate(supabase, orgId)
    if (!cert) {
      return NextResponse.json(
        { error: `FURS ${isTest ? 'testni' : 'produkcijski'} certifikat ni naložen.` },
        { status: 404 }
      )
    }

    return NextResponse.json({
      p12: cert.certificate_data,
      password: cert.certificate_password ?? '',
      taxNumber: cert.tax_number ?? null,
      isTest,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Napaka strežnika' }, { status: 500 })
  }
}
