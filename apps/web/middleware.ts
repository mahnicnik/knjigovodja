import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Centralno preverjanje pravic po vlogi (role-based access control).
 *
 * DODANO 21.7.2026 po odkritju kriticnega varnostnega problema: nobena stran
 * (pos/page.tsx, nastavitve/*) ni preverjala `role` iz org_members - samo
 * `org_id`. To je pomenilo, da je RACUNOVODJA (vloga namenjena samo za ogled/
 * export financnih podatkov) imel poln dostop do POS terminala, nastavitev
 * blagajne (vkljucno s FURS certifikatom!) in vsega ostalega - enako kot lastnik.
 *
 * Ta middleware tece na VSAKO zahtevo (razen statike/API-jev za same auth) in
 * preveri, ali prijavljena vloga sme dostopati do zahtevane poti. Nedovoljene
 * poti preusmeri na "domaco" stran te vloge, namesto da se zanasamo, da bo
 * vsaka posamezna stran to sama preverila (kar se je izkazalo za nezanesljivo).
 */

// Predpone poti, ki jih sme obiskati posamezna vloga.
// Poti, ki niso navedene za nobeno vlogo spodaj, so na voljo VSEM prijavljenim
// (npr. /dashboard, /profil) - belezimo samo OMEJITVE za obcutljive vloge.
const ROLE_ALLOWED_PREFIXES: Record<string, string[]> = {
  accountant: ['/racunovodja', '/izvoz', '/invite', '/profil', '/dashboard'],
  cashier: ['/pos', '/invite', '/profil', '/dashboard'],
  viewer: ['/racunovodja', '/izvoz', '/pos', '/invite', '/profil', '/dashboard'],
}

// Kam preusmeriti vlogo, ce poskusa dostopati do poti, ki ji ni dovoljena.
const ROLE_HOME: Record<string, string> = {
  accountant: '/racunovodja',
  cashier: '/pos',
  viewer: '/racunovodja',
}

// Poti, ki jih middleware sploh ne preverja (javne strani, staticne datoteke, auth).
const PUBLIC_PREFIXES = [
  '/login', '/signup', '/onboarding', '/invite', '/api/auth',
  '/_next', '/favicon', '/robots', '/sitemap', '/privacy', '/terms',
  // DODANO (13.8.2026, kriticno): webhooki (Stripe, WooCommerce, Shopify)
  // klicejo zunanji servisi BREZ prijavljene seje - preverjajo se s
  // podpisom (HMAC), ne z uporabniskim piskotkom. Ce middleware rekonstruira
  // zahtevo (NextResponse.next({request:{headers}})) preden pride do
  // handlerja, se lahko poskodi SUROVO telo zahteve, kar pokvari Stripe
  // podpis ("Invalid signature") - webhooki morajo iti skozi NEDOTAKNJENI.
  '/api/webhooks',
]

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (isPublicPath(pathname)) return NextResponse.next()

  let res = NextResponse.next({ request: { headers: req.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          res.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          res.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Ni prijavljen - pusti skozi (posamezne strani/API-ji ze sami zahtevajo
  // prijavo in preusmerijo na /login; middleware se tu ne vmesava, da se
  // izognemo podvajanju logike prijave).
  if (!user) return res

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  const role = member?.role
  if (!role) return res // ni clan organizacije - naj to obravnava sama stran

  const allowed = ROLE_ALLOWED_PREFIXES[role]
  if (!allowed) return res // vloga (owner/admin) brez omejitev

  const isAllowed = allowed.some((p) => pathname.startsWith(p))
  if (isAllowed) return res

  const home = ROLE_HOME[role] ?? '/dashboard'
  if (pathname === home || pathname.startsWith(home)) return res

  const url = req.nextUrl.clone()
  url.pathname = home
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    /*
     * Ujemi vse poti razen:
     * - _next/static, _next/image (Next.js interni resursi)
     * - favicon.ico, slike
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
