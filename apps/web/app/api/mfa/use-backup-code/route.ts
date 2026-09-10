import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import crypto from 'crypto'

/**
 * UPORABA REZERVNE KODE (prelet 241)
 * ══════════════════════════════════
 *
 * Supabase rezervnih kod ne pozna - z njimi seje ni mogoce dvigniti na drugo
 * stopnjo. Koda zato druge stopnje ne NADOMESTI, ampak jo ODSTRANI:
 * uporabnik pride noter z geslom in jo nastavi na novo.
 *
 * VAROVALKA: klicatelj mora ze imeti veljavno sejo z GESLOM (raven aal1).
 * Sama koda torej ne zadosca - potrebna sta oba dela, geslo in koda. Brez
 * tega bi bila rezervna koda mocnejsa od gesla samega.
 *
 * Koda se porabi ENKRAT, tudi ce odstranitev pozneje ne uspe. Bolje izgubiti
 * eno kodo kot dovoliti vec poskusov z isto.
 */

const SOL = 'racunko-mfa-v1'
const zgosti = (k: string) =>
  crypto.createHash('sha256').update(SOL + k.trim().toUpperCase()).digest('hex')

export async function POST(request: NextRequest) {
  try {
    const { koda } = await request.json().catch(() => ({}))
    if (!koda || String(koda).trim().length < 8) {
      return NextResponse.json({ error: 'Vpišite rezervno kodo.' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Najprej vpišite email in geslo.' }, { status: 401 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )

    const { data: zadetek } = await admin
      .from('mfa_backup_codes')
      .select('id')
      .eq('user_id', user.id)
      .eq('code_hash', zgosti(String(koda)))
      .is('used_at', null)
      .maybeSingle()

    if (!zadetek) {
      return NextResponse.json({ error: 'Koda ni pravilna ali je že bila uporabljena.' }, { status: 400 })
    }

    await admin.from('mfa_backup_codes').update({ used_at: new Date().toISOString() }).eq('id', zadetek.id)

    // Odstranimo VSE potrjene faktorje - uporabnik jih bo nastavil znova.
    const { data: faktorji } = await admin.auth.admin.mfa.listFactors({ userId: user.id })
    for (const f of ((faktorji as any)?.factors || [])) {
      await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: user.id })
    }

    const { count } = await admin.from('mfa_backup_codes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).is('used_at', null)

    await admin.from('mfa_audit').insert({
      user_id: user.id, actor_id: null, action: 'backup_code_used',
      note: `Preostalih kod: ${count ?? 0}`,
    })

    return NextResponse.json({ ok: true, preostalo: count ?? 0 })
  } catch (e: any) {
    console.error('rezervna koda:', e)
    return NextResponse.json({ error: 'Kode ni bilo mogoče preveriti.' }, { status: 500 })
  }
}
