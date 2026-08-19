import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Iskanje podatkov o podjetju po davcni stevilki (posrednik do zunanjega API).
 *
 * POPRAVLJENO (16.8.2026), tri pomanjkljivosti:
 *  1. Endpoint je bil ODPRT - klical ga je lahko kdorkoli brez prijave.
 *     Kot odprt posrednik je omogocal, da nekdo prek nase domene obremenjuje
 *     zunanji API (in tvega, da nas ta blokira).
 *  2. Vnos se je vstavil NEPOSREDNO v naslov, brez kodiranja. Znak "&" v
 *     vnosu je lahko dodal svoje parametre in spremenil poizvedbo.
 *  3. Ni bilo preverbe oblike - poslalo se je karkoli.
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
    // 3. Kodiranje vnosa, da ne more spremeniti poizvedbe
    const res = await fetch(
      `https://slo-podjetja-api.eu/api?search=${encodeURIComponent(ocisceno)}&limit=1`,
      { headers: { 'User-Agent': 'Racunko/1.0' }, next: { revalidate: 3600 } },
    )
    if (!res.ok) return NextResponse.json({ error: 'API napaka' }, { status: 500 })
    const data = await res.json()
    if (!data || data.length === 0) return NextResponse.json({ error: 'Ni najdeno' }, { status: 404 })
    return NextResponse.json(data[0])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
