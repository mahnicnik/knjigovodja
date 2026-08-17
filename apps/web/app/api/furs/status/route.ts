import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  // POPRAVLJENO (16.8.2026): endpoint je bil odprt in ob vsakem klicu sprozil
  // odhodno zahtevo na FURS - kdorkoli ga je lahko klical v zanki. Zdaj
  // zahteva prijavo (prikazuje se v nastavitvah blagajne).
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

  // POPRAVLJENO (16.8.2026): prej je neprijavljena zahteva dobila 401, kar je
  // pokvarilo nadzorni sistem (klice ta naslov vsakih 5 minut in je odslej
  // vedno javljal napako).
  //
  // Podatki tu niso obcutljivi - povedo le, ali je certifikat nalozen in ali je
  // vklopljen testni nacin, nic o uporabnikih ali prometu. Skrb je bila drugje:
  // vsak klic je sprozil ODHODNO zahtevo na FURS, kar bi kdo lahko zlorabil.
  //
  // Zato zdaj: neprijavljeni dobijo stanje iz nastavitev BREZ klica na FURS,
  // prijavljeni pa tudi zivo preverbo povezave.
  const zivaPreverba = !!user

  // POPRAVLJENO (17.8.2026): testni nacin iz BAZE, ne iz okoljske spremenljivke -
  // sicer prikaz ne ustreza temu, kar dejansko pocne izdaja racuna.
  let testMode = process.env.FURS_TEST_MODE === 'true'
  if (user) {
    const { data: m } = await authClient.from('org_members').select('org_id').eq('user_id', user.id).limit(1).maybeSingle()
    if (m?.org_id) {
      const { data: o } = await authClient.from('organizations').select('furs_test_mode').eq('id', m.org_id).maybeSingle()
      if (o) testMode = !!o.furs_test_mode
    }
  }
  const hasCert = !!(process.env.FURS_CERT_B64 || process.env.FURS_CERT_PATH)

  // Preveri ali FURS API odgovori
  let connected = false
  let lastSync = null

  if (hasCert && zivaPreverba) {
    try {
      // Poskusi ping FURS endpoint
      const fursUrl = testMode
        ? 'https://blagajne-test.fu.gov.si:9002/v1/cash_registers/invoices/register'
        : 'https://blagajne.fu.gov.si:9003/v1/cash_registers/invoices/register'

      // Ne pošiljamo pravega zahtevka, samo preverimo dosegljivost
      const res = await fetch(fursUrl, {
        method: 'OPTIONS',
        signal: AbortSignal.timeout(3000),
      }).catch(() => null)

      // FURS vrne 405 za OPTIONS - to pomeni da je dosegljiv
      connected = res !== null
      lastSync = new Date().toLocaleString('sl-SI', {
        hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric'
      })
    } catch {
      connected = false
    }
  }

  return NextResponse.json({
    connected: zivaPreverba ? (hasCert && connected) : hasCert,
    live: zivaPreverba,
    testMode,
    hasCert,
    lastSync,
    environment: testMode ? 'test' : 'production',
  })
}
