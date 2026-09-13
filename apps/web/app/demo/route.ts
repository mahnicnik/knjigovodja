import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * VSTOP V PREDSTAVITEV (prelet 258)
 * ═════════════════════════════════
 *
 * Obiskovalec klikne gumb na zacetni strani in je v aplikaciji - brez
 * registracije, brez e-poste, brez kartice.
 *
 * ZAKAJ PRAVA APLIKACIJA IN NE POSNEMANA STRAN:
 * Posnemano stran bi bilo treba vzdrzevati vzporedno z izdelkom, in vsaka
 * nova funkcija se tam ne bi pokazala, dokler je ne prepisemo. Cez pol leta
 * bi bila zastarela in bi delala skodo namesto koristi.
 *
 * VAROVALKA, KI JE ZE V IZDELKU:
 * Predstavitveno podjetje ima `furs_demo_mode = true`, zato racuni dobijo
 * OZNACENE lazne kode (DEMO-...) in se NE prijavijo pri FURS. To je
 * najnevarnejsi del in je resen v bazi, ne v tej poti.
 *
 * GESLO NI SKRIVNOST in to je namen - racun je javen. Pomembno je le, da
 * nima dostopa do nicesar razen predstavitvenih podatkov, kar zagotavlja
 * pravilo dostopa v bazi (RLS): vidi samo svojo organizacijo.
 *
 * Hranimo ga vseeno v okoljski spremenljivki, ne v kodi - ce ga bo kdaj
 * treba zamenjati, se to naredi brez objave nove razlicice.
 */
export async function GET(request: NextRequest) {
  const email = process.env.DEMO_EMAIL || 'demo@xn--raunko-j2a.si'
  const geslo = process.env.DEMO_PASSWORD

  if (!geslo) {
    console.error('DEMO_PASSWORD ni nastavljen — predstavitev ni na voljo.')
    return NextResponse.redirect(new URL('/?demo=nedostopno', request.url))
  }

  const cookieStore = await cookies()
  const zapisi: { name: string; value: string; options: any }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (piskotki) => { zapisi.push(...piskotki) },
      },
    },
  )

  // Ce je kdo ze prijavljen, ga NE odjavimo - lastna seja je pomembnejsa od
  // predstavitve. Raje ga peljemo na nadzorno plosco njegovega podjetja.
  const { data: { user: obstojeci } } = await supabase.auth.getUser()
  if (obstojeci && obstojeci.email !== email) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password: geslo })
  if (error) {
    console.error('Prijava v predstavitev ni uspela:', error.message)
    return NextResponse.redirect(new URL('/?demo=napaka', request.url))
  }

  // Kam naj pristane. Privzeto blagajna, ker je to tisto, cesar drugi nimajo.
  const kam = request.nextUrl.searchParams.get('kam')
  const varnaPot = kam && /^[a-z-]+$/.test(kam) ? `/${kam}` : '/pos'

  const odgovor = NextResponse.redirect(new URL(varnaPot, request.url))
  for (const p of zapisi) odgovor.cookies.set(p.name, p.value, p.options)
  return odgovor
}
