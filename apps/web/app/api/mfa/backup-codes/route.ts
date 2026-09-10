import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import crypto from 'crypto'

/**
 * USTVARJANJE REZERVNIH KOD (prelet 241)
 * ══════════════════════════════════════
 *
 * Kode se prikazejo SAMO ENKRAT - ob tem odgovoru. Pozneje jih ni mogoce
 * priklicati, ker v bazi hranimo le zgoscene vrednosti. To ni nerodnost,
 * ampak namen: ce bi jih bilo mogoce znova prebrati, bi vsak, ki pride do
 * racuna, dobil tudi kode.
 *
 * Ustvarjanje novih kod STARE RAZVELJAVI. Sicer bi se scasoma nabralo vec
 * veljavnih nizov, uporabnik pa ne bi vedel, kateri se delujejo.
 */

const SOL = 'racunko-mfa-v1'

/** Zgoscena vrednost kode. SHA-256 zadosca: koda je nakljucna in enkratna. */
function zgosti(koda: string): string {
  return crypto.createHash('sha256').update(SOL + koda.trim().toUpperCase()).digest('hex')
}

/** Kode brez znakov, ki se zamenjujejo: 0/O, 1/I/L. */
function ustvariKodo(): string {
  const znaki = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const b = crypto.randomBytes(10)
  let s = ''
  for (let i = 0; i < 10; i++) {
    s += znaki[b[i] % znaki.length]
    if (i === 4) s += '-'
  }
  return s
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )

    const kode = Array.from({ length: 10 }, () => ustvariKodo())

    // Stare razveljavimo, da ne ostanejo v obtoku vzporedno z novimi.
    await admin.from('mfa_backup_codes').delete().eq('user_id', user.id)

    const { error } = await admin.from('mfa_backup_codes').insert(
      kode.map(k => ({ user_id: user.id, code_hash: zgosti(k) })),
    )
    if (error) throw error

    await admin.from('mfa_audit').insert({
      user_id: user.id, actor_id: user.id, action: 'codes_generated',
      note: 'Ustvarjenih 10 rezervnih kod',
    })

    return NextResponse.json({ kode })
  } catch (e: any) {
    console.error('rezervne kode:', e)
    return NextResponse.json({ error: 'Kod ni bilo mogoče ustvariti.' }, { status: 500 })
  }
}
