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

// SPREMENJENO (Prelet 18, 17.8.2026): definicije so se preselile v
// lib/role-access.ts, da jih lahko uporablja tudi stranski meni (AppLayout).
// Prej je meni prikazoval VSE povezave tudi racunovodji, ki pa ga je klik
// vrgel nazaj sem - aplikacija je delovala kot pokvarjena.
//
// Hkrati je bil odstranjen '/dashboard' iz seznama za accountant/cashier:
// dashboard je lastnikov pregled poslovanja, racunovodja ima svoj portal
// na /racunovodja.
import { ROLE_ALLOWED_PREFIXES, ROLE_HOME, isPathAllowedForRole } from '@/lib/role-access'

// Poti, ki jih middleware sploh ne preverja (javne strani, staticne datoteke, auth).
const PUBLIC_PREFIXES = [
  // '/register' DODANO (19.8.2026): to je glavni gumb "Zacni brezplacno" na
  // zacetni strani. Na seznamu je bil samo '/signup', ki pa se nikjer ne
  // uporablja - registracija je torej sla skozi middleware brez seje.
  '/login', '/signup', '/register', '/onboarding', '/invite', '/api/auth',
  // DODANO (19.8.2026, kriticno): ponastavitev gesla. Uporabnik, ki klikne
  // povezavo iz e-poste, NI prijavljen - middleware ga je zato prestregel in
  // preusmeril, stran za ponastavitev pa se sploh ni nalozila. Zato popravka
  // iz preleta 22 (PKCE tok) in 23 (redirect URL) nikoli nista prisla do
  // izraza: uporabnik je vsakic pristal na zacetni strani, zeton pa je bil
  // porabljen. Obe poti morata biti dosegljivi BREZ seje.
  '/forgot-password', '/reset-password',
  // DODANO (22.8.2026): javno podaljsanje kartice. Stranka pride iz opomnika
  // in NI prijavljena - brez tega bi jo middleware preusmeril na zacetno
  // stran, tako kot je nekoc ponastavitev gesla (prelet 50).
  '/obnova', '/api/obnova',
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

  // POPRAVLJENO (18.8.2026): API poti gredo skozi osvezitev seje (zato smo prisli
  // do sem), NE pa skozi omejevanje po vlogah.
  //
  // Omejitve delujejo po predponah brskalnih poti (/kpo, /invoices, ...). Klic na
  // /api/racunovodja/invoice-pdf se zacne z "/api" in se ni ujemal z nobeno
  // dovoljeno predpono, zato je racunovodja dobil 307 preusmeritev. Brskalnik ji
  // je sledil, prejel HTML strani namesto PDF in gumb za PDF je obvisel brez
  // sporocila (potrjeno v Vercel dnevnikih 18.8.2026).
  //
  // Vsaka API pot preverja dostop sama, in to natancneje: invoice-pdf preveri
  // clanstvo prav v TISTI organizaciji, ki ji racun pripada - cesar middleware
  // ne more vedeti, ker gleda samo pot. Preusmerjanje API klicev tu ni varnostni
  // ukrep, ampak okvara.
  if (pathname.startsWith('/api/')) return res

  // POPRAVLJENO (Prelet 18, 17.8.2026): tu je bil `.maybeSingle()`, ki ob VEC
  // clanstvih (racunovodja z dvema strankama - tocno primer, za katerega ta
  // vloga obstaja) vrne napako, ne prve vrstice. `member` je bil takrat null,
  // `role` undefined in middleware je vrnil `res` BREZ VSAKRSNE OMEJITVE -
  // torej ravno v primeru, ko so omejitve najbolj potrebne, jih ni bilo.
  const { data: members } = await supabase
    .from('org_members')
    .select('role')
    .eq('user_id', user.id)

  const roles = (members ?? []).map((m: any) => m.role).filter(Boolean)
  if (roles.length === 0) return res // ni clan organizacije - naj to obravnava sama stran

  // Ce je uporabnik nekje lastnik/admin, ima poln dostop (svoje podjetje) -
  // omejimo samo, kadar so VSA clanstva omejenih vlog.
  const hasUnrestricted = roles.some((r: string) => !ROLE_ALLOWED_PREFIXES[r])
  if (hasUnrestricted) return res

  const role = roles[0]

  // SPREMENJENO (17.8.2026): uporabimo skupno funkcijo namesto lastnega
  // preverjanja predpon - ta uposteva tudi ROLE_DENIED_PREFIXES
  // (npr. /invoices je racunovodji dovoljen, /invoices/new pa ne).
  if (isPathAllowedForRole(pathname, role)) return res

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
