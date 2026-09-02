import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getFursCertificate } from '@/lib/furs-cert'
import { preveriPosrednika } from '@/lib/furs'
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
  let orgIdZaDnevnik: string | null = null
  if (user) {
    const { orgId } = await resolveActiveOrgId(authClient, user.id, getRequestedOrgId(req))
    if (orgId) {
      orgIdZaDnevnik = orgId
      const { cert, isTest } = await getFursCertificate(authClient, orgId)
      hasCert = !!cert
      testMode = isTest
    }
  }

  // ── STANJE POVEZAVE (prelet 160, temeljito predelano) ──────────────
  //
  // PREJ: koda je z Vercela klicala FURS NEPOSREDNO na vrata 9002 in iz
  // odgovora sklepala o dosegljivosti. Ta preverba NI MOGLA uspeti nikoli -
  // Vercel odhodni promet na 9002 blokira, zato gre dejanska izdaja racuna
  // (lib/furs.ts) prek posredniskega streznika. Blagajna je torej trkala
  // po poti, ki je zaprta prav zato, da posrednik obstaja: pisalo je
  // "FURS ni dosegljiv", medtem ko so racuni normalno odhajali in je
  // portal (ki poslje pravi testni racun prek posrednika) kazal uspeh.
  //
  // Povrhu je "Zadnja sinhronizacija" izpisovala `new Date()` - torej
  // trenutni cas ob vsakem odprtju zaslona. Podatek ni povedal nicesar.
  //
  // ZDAJ: stanje beremo iz DEJANSKE zgodovine potrjevanja (furs_log).
  // To ni ugibanje o omrezju, ampak dokaz: ali je FURS nase racune
  // resnicno potrdil in kdaj nazadnje. RLS na tabeli je "org members
  // only", zato uporabnikova seja vidi le svojo organizacijo.
  let connected = false
  let lastSync = null
  let lastError = null

  if (hasCert && zivaPreverba && orgIdZaDnevnik) {
    const { data: zadnji } = await authClient
      .from('furs_log')
      .select('status, error_message, request_at, response_at')
      .eq('org_id', orgIdZaDnevnik)
      .order('request_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: zadnjaUspesna } = await authClient
      .from('furs_log')
      .select('response_at, request_at')
      .eq('org_id', orgIdZaDnevnik)
      .eq('status', 'success')
      .order('request_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Certifikat je nalozen; sporocamo napako SAMO, ce je zadnji poskus
    // dejansko spodletel. Ce potrjevanja se ni bilo, to ni napaka - je
    // blagajna, ki se ni izdala racuna.
    connected = !zadnji || zadnji.status !== 'error'
    if (zadnji?.status === 'error') lastError = zadnji.error_message || null

    const cas = zadnjaUspesna?.response_at || zadnjaUspesna?.request_at
    if (cas) {
      lastSync = new Date(cas).toLocaleString('sl-SI', {
        hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric'
      })
    }
  }

  return NextResponse.json({
    connected: zivaPreverba ? (hasCert && connected) : hasCert,
    live: zivaPreverba,
    testMode,
    hasCert,
    lastSync,
    // PRELET 160: ce je zadnje potrjevanje spodletelo, blagajniku povemo
    // ZAKAJ. Prej je pisalo le "certifikat morda ni nastavljen ali je
    // potekel" - domneva, ki je bila najpogosteje napacna.
    lastError,
    // PRELET 191: posrednik je edina pot racunov do FURS. Ce pade, tega
    // doslej ni bilo mogoce videti nikjer - napaka se je pokazala sele ob
    // prvem neuspelem racunu.
    proxy: zivaPreverba ? await preveriPosrednika(4000) : null,
    environment: testMode ? 'test' : 'production',
  })
}
