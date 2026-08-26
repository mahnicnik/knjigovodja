import { NextRequest, NextResponse } from 'next/server'
import { GET as crpajNovosti } from '../cron/legal-updates/route'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Seznam STATIC_UPDATES je bil ODSTRANJEN (25.8.2026) — glej pojasnilo spodaj.

/**
 * POPRAVLJENO (16.8.2026, VARNOST): endpoint je bil ODPRT - klical ga je lahko
 * kdorkoli brez prijave, pri tem pa uporablja kljuc s POLNIMI pravicami in
 * IZBRISE ter znova napolni tabelo legal_updates. Vsak zunanji klic je torej
 * lahko sprozil brisanje. Zdaj zahteva prijavo.
 */
export async function GET() {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set() {}, remove() {},
      },
    },
  )
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
  }

  try {
    // Preveri ali so že novosti v bazi
    const { data: existing } = await supabase
      .from('legal_updates')
      .select('id')
      .limit(1)

    // ODSTRANJENO (25.8.2026): tu se je ob vsakem klicu IZBRISALA tabela in
    // znova napolnila s TRDO ZAPISANIM seznamom sestih vnosov iz leta 2025.
    // Vsebina ni bila samo stara, ampak NAPACNA: trdila je, da je minimalna
    // placa 1.253,90 EUR, aplikacija pa je racunala z 1.481,88 EUR.
    //
    // Vsebino zdaj crpa /api/cron/legal-updates iz uradnih virov FURS. Ta pot
    // samo POVE, kaksno je stanje - ne pise vec nicesar.
    const { data: sync } = await supabase
      .from('legal_updates_sync').select('*').eq('id', 1).maybeSingle()

    return NextResponse.json({
      objav: existing?.length ?? 0,
      zadnjiTek: sync?.last_run_at ?? null,
      zadnjiUspeh: sync?.last_ok_at ?? null,
      napaka: sync?.error ?? null,
    })
  } catch (error: any) {
    console.error('Legal updates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * ROCNO OSVEZEVANJE (dodano 25.8.2026).
 *
 * Gumb "Preveri" v pripomocku je klical GET te poti, ta pa po preletu 112
 * samo POROCA o stanju - vsebine ne prinese vec. Klik zato ni naredil
 * nicesar: kazalnik se je zavrtel in seznam je ostal enak.
 *
 * Crpanje opravi ista koda kot nocno opravilo, le da se tu avtorizira s
 * PRIJAVO namesto s skrivnostjo crona - uporabnik v brskalniku je nima.
 */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Neprijavljen uporabnik' }, { status: 401 })

  // Klic notranje: skrivnost crona podamo iz okolja, saj smo na strezniku.
  const notranji = new NextRequest(new URL(req.url), {
    headers: process.env.CRON_SECRET
      ? { authorization: `Bearer ${process.env.CRON_SECRET}` }
      : undefined,
  })
  const res = await crpajNovosti(notranji)
  return NextResponse.json(await res.json())
}
