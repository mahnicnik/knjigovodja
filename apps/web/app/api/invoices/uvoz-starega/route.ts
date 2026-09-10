import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { ugotoviObliko, razcleni } from '@/lib/stevilcenje'

/**
 * UVOZ STAREGA RAČUNA (prelet 244)
 * ════════════════════════════════
 *
 * Prebere PDF ali sliko racuna iz drugega programa in iz nje pripravi
 * OSNUTEK. Osnutek in ne izdan racun - uporabnik mora videti, kaj je bilo
 * prebrano, preden to postane davcni dokument.
 *
 * OBLIKA STEVILKE: ne ugibamo je iz enega racuna, ampak jo ugotovimo iz
 * ze uvozenih. Ena sama "26-0001" je lahko letnica+zaporedna ali predpona+
 * zaporedna; deset stevilk pove, katero od tega drzi.
 *
 * ZAKAJ TO SPLOH POTREBUJEMO: pri prehodu iz drugega programa je zgodovina
 * tisto, kar stranko zadrzi. Ce je ne more preseliti, ostane pri starem.
 */

const NAVODILO = `Iz tega racuna izlusci podatke. Odgovori SAMO z JSON, brez razlage:
{
  "stevilka": "tocna stevilka racuna, kot je zapisana",
  "datum": "YYYY-MM-DD",
  "datum_zapadlosti": "YYYY-MM-DD ali null",
  "kupec": { "naziv": "", "naslov": "", "davcna": "" },
  "postavke": [{ "opis": "", "kolicina": 1, "cena_brez_ddv": 0, "stopnja_ddv": 22 }],
  "skupaj_brez_ddv": 0,
  "ddv": 0,
  "skupaj": 0
}
Ce podatka ni, uporabi null. Zneske vrni kot stevila, brez valute.
Stevilko racuna prepisi TOCNO tako, kot je na dokumentu - ne spreminjaj
locil, vodilnih nicel ali vrstnega reda delov.`

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

    const { orgId, datoteka, mediaType } = await request.json().catch(() => ({}))
    if (!orgId || !datoteka) {
      return NextResponse.json({ error: 'Manjka datoteka.' }, { status: 400 })
    }

    // Oblika stevilcenja iz ZE OBSTOJECIH racunov te organizacije.
    const { data: obstojeci } = await supabase
      .from('issued_invoices').select('invoice_number')
      .eq('org_id', orgId).order('issue_date', { ascending: false }).limit(30)

    const oblika = ugotoviObliko((obstojeci || []).map((r: any) => r.invoice_number))

    const jePdf = String(mediaType || '').includes('pdf')
    const vsebina = jePdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: datoteka } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: datoteka } }

    const odgovor = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: [vsebina, { type: 'text', text: NAVODILO }] }],
      }),
    })

    if (!odgovor.ok) {
      return NextResponse.json({ error: 'Računa ni bilo mogoče prebrati.' }, { status: 502 })
    }

    const d = await odgovor.json()
    const besedilo = (d.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
    let prebrano: any
    try {
      prebrano = JSON.parse(besedilo.replace(/```json|```/g, '').trim())
    } catch {
      return NextResponse.json({
        error: 'Odgovora ni bilo mogoče razčleniti. Račun vpišite ročno.',
      }, { status: 422 })
    }

    // Razclenimo prebrano stevilko in povemo, ali ustreza obliki ostalih.
    const razclenjena = razcleni(String(prebrano.stevilka || ''))
    const ustreza = oblika.vrsta === 'neznana' || razclenjena.vrsta === oblika.vrsta

    return NextResponse.json({
      prebrano,
      stevilka: {
        razclenjena,
        oblikaOstalih: oblika,
        ustreza,
        // Opozorilo, ne zavrnitev: prvi uvozeni racun nima s cim primerjati,
        // in oblika se sme sredi leta spremeniti.
        opozorilo: ustreza ? null
          : `Oblika številke se razlikuje od ostalih računov (${oblika.vrsta}). Preverite, preden izdate.`,
      },
    })
  } catch (e: any) {
    console.error('uvoz starega racuna:', e)
    return NextResponse.json({ error: 'Uvoz ni uspel.' }, { status: 500 })
  }
}
