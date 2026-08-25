import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * ZAKONSKE NOVOSTI IZ PRAVEGA VIRA (25.8.2026)
 *
 * Prej je bil v kodi TRDO ZAPISAN seznam sestih vnosov iz leta 2025 - brez
 * vira in brez osvezevanja. Vsebina je bila tudi napacna: trdila je, da je
 * minimalna placa 1.253,90 EUR, aplikacija pa je racunala z 1.481,88 EUR.
 *
 * KAJ POCNEMO: objave iz uradnih virov POKAZEMO in povezemo na izvirnik.
 * KAJ NE POCNEMO: ne razlagamo jih in ne izpeljujemo stevilk iz njih. Razlaga
 * je delo racunovodkinje; aplikacija pove "to je bilo objavljeno", ne "to za
 * vas pomeni".
 *
 * ZAKAJ FILTRIRAMO: viri FURS so vecinoma obvestila o spremembah dokumentov z
 * ozkih podrocij (carinska nomenklatura, diplomatske oprostitve, TARIC). Brez
 * filtra bi razdelek napolnili s sumom, ki za s.p. nima pomena.
 */

export const maxDuration = 60

/** Viri. Poskusimo vec naslovov - RSS poti se obcasno spremenijo. */
const VIRI = [
  { ime: 'FURS — podjetja', url: 'https://www.fu.gov.si/rss/podjetja/' },
  { ime: 'FURS — fizične osebe', url: 'https://www.fu.gov.si/rss/fizicne_osebe/' },
  { ime: 'FURS — podjetja (EN)', url: 'https://www.fu.gov.si/en/rss/businesses/' },
]

/**
 * Kljucne besede, po katerih objava velja za relevantno za s.p.
 * Namenoma OZKO: raje spregledamo objavo, kot da uporabnika zasujemo.
 */
const KLJUCNE: Array<{ beseda: RegExp; kategorija: string }> = [
  { beseda: /davčn\w* blagajn|ZDavPR|potrjevanj\w* računov/i, kategorija: 'blagajna' },
  { beseda: /minimaln\w* plač|regres/i,                        kategorija: 'zaposleni' },
  { beseda: /prispevk\w*|ZPIZ|ZZZS|socialn\w* varnost/i,       kategorija: 'prispevki' },
  { beseda: /dohodnin\w*|ZDoh|olajšav\w*|akontacij\w*/i,       kategorija: 'dohodnina' },
  { beseda: /\bDDV\b|ZDDV|davek na dodano vrednost/i,          kategorija: 'ddv' },
  { beseda: /normiran\w*|pavšaln\w*|dejavnost fizičnih oseb/i, kategorija: 'dohodnina' },
  { beseda: /e-?račun|eSLOG|e-?poslovanj/i,                    kategorija: 'splosno' },
  { beseda: /samostojn\w* podjetnik|\bs\.p\.\B/i,              kategorija: 'splosno' },
]

/** Zelo preprosto luscenje RSS - viri so majhni in dobro oblikovani. */
function razcleniRss(xml: string) {
  const zapisi: Array<{ guid: string; naslov: string; opis: string; povezava: string; datum: string | null }> = []
  const bloki = xml.split('<item>').slice(1)

  const polje = (blok: string, ime: string) => {
    const m = blok.match(new RegExp(`<${ime}[^>]*>([\\s\\S]*?)</${ime}>`, 'i'))
    if (!m) return ''
    return m[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
  }

  for (const b of bloki) {
    const naslov = polje(b, 'title')
    if (!naslov) continue
    zapisi.push({
      guid: polje(b, 'guid') || naslov,
      naslov,
      opis: polje(b, 'description'),
      povezava: polje(b, 'link'),
      datum: polje(b, 'pubDate') || null,
    })
  }
  return zapisi
}

export async function GET(req: NextRequest) {
  // Cron se avtorizira z glavo; rocni klic dovolimo v razvoju.
  const skrivnost = process.env.CRON_SECRET
  if (skrivnost && req.headers.get('authorization') !== `Bearer ${skrivnost}`) {
    return NextResponse.json({ error: 'Neavtoriziran klic' }, { status: 401 })
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const zdaj = new Date().toISOString()
  let najdenih = 0, obdrzanih = 0
  const napake: string[] = []
  const uspesniViri: string[] = []

  for (const vir of VIRI) {
    try {
      const res = await fetch(vir.url, {
        headers: { 'User-Agent': 'Racunko/1.0 (+https://xn--raunko-j2a.si)' },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) { napake.push(`${vir.ime}: HTTP ${res.status}`); continue }

      const xml = await res.text()
      if (!xml.includes('<item>')) { napake.push(`${vir.ime}: odgovor ni RSS`); continue }

      const zapisi = razcleniRss(xml)
      najdenih += zapisi.length
      uspesniViri.push(vir.ime)

      for (const z of zapisi) {
        const besedilo = `${z.naslov} ${z.opis}`
        const ujemanja = KLJUCNE.filter(k => k.beseda.test(besedilo))
        if (ujemanja.length === 0) continue   // za s.p. ni relevantno

        // Objave, starejse od enega leta, ne kazemo - niso vec "novosti".
        const objavljeno = z.datum ? new Date(z.datum) : null
        if (objavljeno && !Number.isNaN(objavljeno.getTime())) {
          const letoNazaj = Date.now() - 365 * 86400000
          if (objavljeno.getTime() < letoNazaj) continue
        }

        const { error } = await db.from('legal_updates').upsert({
          external_id: z.guid,
          title: z.naslov.slice(0, 300),
          summary: (z.opis || 'Podrobnosti so v izvirni objavi.').slice(0, 900),
          source: vir.ime,
          source_url: z.povezava || vir.url,
          category: ujemanja[0].kategorija,
          severity: 'info',
          effective_date: objavljeno && !Number.isNaN(objavljeno.getTime())
            ? objavljeno.toISOString().slice(0, 10) : null,
          published_at: objavljeno && !Number.isNaN(objavljeno.getTime())
            ? objavljeno.toISOString() : null,
          fetched_at: zdaj,
          matched_terms: ujemanja.map(u => u.kategorija),
        }, { onConflict: 'external_id' })

        if (error) napake.push(`zapis "${z.naslov.slice(0, 40)}": ${error.message}`)
        else obdrzanih++
      }
    } catch (e: any) {
      napake.push(`${vir.ime}: ${e?.message || e}`)
    }
  }

  // Zabelezimo tek TUDI ob neuspehu - sicer uporabnik ne ve, ali je seznam
  // star en dan ali pol leta.
  await db.from('legal_updates_sync').upsert({
    id: 1,
    last_run_at: zdaj,
    last_ok_at: uspesniViri.length > 0 ? zdaj : undefined,
    items_found: najdenih,
    items_kept: obdrzanih,
    error: napake.length > 0 ? napake.slice(0, 5).join(' · ') : null,
  })

  return NextResponse.json({
    ok: uspesniViri.length > 0,
    viri: uspesniViri,
    najdenih,
    obdrzanih,
    napake,
  })
}
