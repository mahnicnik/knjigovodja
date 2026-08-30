import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getFursCertificate } from '@/lib/furs-cert'
import { resolveActiveOrgId, getRequestedOrgId } from '@/lib/active-org-server'

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

  // POPRAVLJENO (prelet 159, KRITICNO ZA ZAUPANJE): `hasCert` se je bral iz
  // OKOLJSKIH SPREMENLJIVK (FURS_CERT_B64 / FURS_CERT_PATH), certifikat pa
  // v resnici zivi v BAZI, v tabeli `furs_certificates` - od tam ga bere
  // izdaja racuna (getFursCertificate) in od tam ga bere portal.
  //
  // Posledica: nastavitve blagajne so VEDNO kazale "NI POVEZAVE" in
  // "FURS ni dosegljiv - certifikat morda ni nastavljen ali je potekel",
  // ceprav je bil certifikat nalozen in so se racuni normalno potrjevali.
  // Lastnik je bil po nepotrebnem preprican, da je fiskalizacija v okvari,
  // portal pa je hkrati kazal, da je vse v redu - dva zaslona, dva odgovora.
  //
  // Zdaj beremo IZ ISTEGA VIRA kot izdaja racuna. Vec-org varno prek
  // resolveActiveOrgId (ne "prvi clan po vrsti").
  let hasCert = !!(process.env.FURS_CERT_B64 || process.env.FURS_CERT_PATH)
  if (user) {
    const { orgId } = await resolveActiveOrgId(authClient, user.id, getRequestedOrgId(req))
    if (orgId) {
      const { cert, isTest } = await getFursCertificate(authClient, orgId)
      hasCert = !!cert
      testMode = isTest
    }
  }

  // Preveri ali FURS API odgovori
  let connected = false
  let lastSync = null

  if (hasCert && zivaPreverba) {
    try {
      // Poskusi ping FURS endpoint
      // POPRAVLJENO (prelet 159): produkcijski naslov je imel vrata 9003 in
      // pot "cash_registers", dejanska izdaja racuna (lib/furs.ts) pa uporablja
      // vrata 9002 in pot "cash_register". Preverba je torej trkala drugam kot
      // izdaja - lahko bi javljala napako, ceprav bi racuni normalno odhajali,
      // ali obratno. Zdaj preverjamo ISTI naslov, ki ga zares uporabljamo.
      const fursUrl = testMode
        ? 'https://blagajne-test.fu.gov.si:9002/v1/cash_register/invoices'
        : 'https://blagajne.fu.gov.si:9002/v1/cash_register/invoices'

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
