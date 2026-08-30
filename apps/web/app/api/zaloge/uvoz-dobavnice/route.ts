import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'

/**
 * UVOZ DOBAVNICE V ZALOGO PORTALA (26.8.2026)
 *
 * Blagajna je uvoz dobavnice ze imela, portal pa ne - stranka brez blagajne
 * (trgovina z oblacili, spletna prodaja) je morala vsak artikel vnesti rocno.
 *
 * ZAKAJ SVOJA POT IN NE TISTA IZ BLAGAJNE: obe razclenita isti dokument, a
 * pisata v RAZLICNE tabele. Blagajna v `items`/`ingredients`, portal v
 * `inventory_items`. Skupna bi morala vedeti, katera je katera, in bi se ob
 * spremembi ene pokvarila za drugo.
 *
 * KAJ NAREDI:
 *   1. razcleni PDF ali sliko dobavnice
 *   2. artikle, ki jih ze imamo, POSODOBI (kolicina + nabavna cena)
 *   3. nove DODA
 *   4. vsako spremembo zabelezi v `inventory_movements`
 *
 * NE UVOZI SAM: vrne predlog, ki ga uporabnik potrdi. Dobavnice se berejo
 * napacno pogosteje, kot bi si clovek mislil - tiho spreminjanje zaloge bi
 * bilo tezko opaziti.
 */

export const maxDuration = 60

const NAVODILO = `Iz te dobavnice ali računa dobavitelja izlušči podatke.

Vrni SAMO JSON, brez pojasnil in brez oznak za kodo:
{
  "dobavitelj": "naziv dobavitelja",
  "stevilka_dokumenta": "številka dobavnice",
  "datum": "YYYY-MM-DD",
  "artikli": [
    {
      "naziv": "ime artikla, kot piše na dokumentu",
      "sku": "šifra ali EAN, če obstaja, sicer null",
      "kolicina": 12,
      "enota": "kos",
      "cena_brez_ddv": 1.05,
      "popust_procent": 0,
      "ddv_stopnja": 22,
      "neto_cena_brez_ddv": 1.05
    }
  ]
}

Pravila:
- "neto_cena_brez_ddv" je cena NA ENOTO po odbitem popustu — to je nabavna cena.
- Če je na dokumentu samo cena z DDV, jo pretvori v ceno brez DDV.
- Če česa ni mogoče razbrati, uporabi null. Ne ugibaj.
- Zneskov ne zaokrožuj na dve mesti — nabavne cene imajo pogosto štiri.`

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })

  const { fileBase64, mediaType, orgId, potrdi, artikli } = await req.json().catch(() => ({} as any))
  if (!orgId) return NextResponse.json({ error: 'Manjka organizacija.' }, { status: 400 })

  // ── DRUGI KORAK: uporabnik je predlog potrdil ──
  if (potrdi && Array.isArray(artikli)) {
    let dodanih = 0, posodobljenih = 0
    const napake: string[] = []

    for (const a of artikli) {
      if (!a?.naziv || !(Number(a.kolicina) > 0)) continue
      const cena = a.neto_cena_brez_ddv != null ? Number(a.neto_cena_brez_ddv) : null

      // Ujemanje najprej po sifri, sele nato po imenu - sifra je zanesljivejsa.
      const { data: obstojeci } = a.sku
        ? await supabase.from('inventory_items').select('id, current_stock')
            .eq('org_id', orgId).eq('sku', a.sku).limit(1)
        : await supabase.from('inventory_items').select('id, current_stock')
            .eq('org_id', orgId).ilike('name', a.naziv).limit(1)

      const najden = obstojeci?.[0]

      if (najden) {
        const novo = Number(najden.current_stock || 0) + Number(a.kolicina)
        const posodobitev: any = { current_stock: novo }
        if (cena != null && cena > 0) posodobitev.purchase_price = cena
        const { error } = await supabase.from('inventory_items').update(posodobitev).eq('id', najden.id)
        if (error) { napake.push(`${a.naziv}: ${error.message}`); continue }
        posodobljenih++

        await supabase.from('inventory_movements').insert({
          org_id: orgId, item_id: najden.id, type: 'in',
          quantity: Number(a.kolicina), unit_price: cena,
          reference: a.dokument || 'Uvoz dobavnice',
          notes: a.dobavitelj || null,
        })
      } else {
        const { data: nov, error } = await supabase.from('inventory_items').insert({
          org_id: orgId,
          name: String(a.naziv).slice(0, 200),
          sku: a.sku || null,
          unit: a.enota || 'kos',
          purchase_price: cena,
          vat_rate: a.ddv_stopnja ?? 22,
          current_stock: Number(a.kolicina),
          is_active: true,
        }).select('id').single()

        if (error) { napake.push(`${a.naziv}: ${error.message}`); continue }
        dodanih++

        await supabase.from('inventory_movements').insert({
          org_id: orgId, item_id: nov.id, type: 'in',
          quantity: Number(a.kolicina), unit_price: cena,
          reference: a.dokument || 'Uvoz dobavnice',
          notes: a.dobavitelj || null,
        })
      }
    }

    return NextResponse.json({ ok: true, dodanih, posodobljenih, napake: napake.slice(0, 5) })
  }

  // ── PRVI KORAK: razclenimo dokument in vrnemo PREDLOG ──
  if (!fileBase64) return NextResponse.json({ error: 'Manjka datoteka.' }, { status: 400 })
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Branje dokumentov ni nastavljeno.' }, { status: 503 })
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const jePdf = String(mediaType || '').includes('pdf')

    const odgovor = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          jePdf
            ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
            // DODANO (26.8.2026): tudi SLIKA, ne samo PDF - dobavnice pogosto
            // pridejo na papir in jih uporabnik slika s telefonom.
            : { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: fileBase64 } },
          { type: 'text', text: NAVODILO },
        ] as any,
      }],
    })

    const besedilo = odgovor.content
      .filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
    const cist = besedilo.replace(/```json|```/g, '').trim()

    let podatki: any
    try { podatki = JSON.parse(cist) }
    catch {
      return NextResponse.json({ error: 'Dokumenta ni bilo mogoče razbrati. Poskusite z jasnejšo sliko ali PDF.' }, { status: 422 })
    }

    if (!Array.isArray(podatki?.artikli) || podatki.artikli.length === 0) {
      return NextResponse.json({ error: 'Na dokumentu ni bilo mogoče najti nobenega artikla.' }, { status: 422 })
    }

    // Povemo, kateri artikli so ZE v zalogi - uporabnik vidi, kaj bo dodano
    // in kaj posodobljeno, preden potrdi.
    const { data: vsi } = await supabase.from('inventory_items')
      .select('id, name, sku, current_stock, purchase_price').eq('org_id', orgId)

    const oznaceni = podatki.artikli.map((a: any) => {
      const najden = (vsi || []).find((x: any) =>
        (a.sku && x.sku && String(x.sku) === String(a.sku))
        || String(x.name).toLowerCase() === String(a.naziv || '').toLowerCase())
      return {
        ...a,
        dobavitelj: podatki.dobavitelj ?? null,
        dokument: podatki.stevilka_dokumenta ?? null,
        obstaja: !!najden,
        trenutna_zaloga: najden?.current_stock ?? null,
        prejsnja_cena: najden?.purchase_price ?? null,
      }
    })

    return NextResponse.json({
      ok: true,
      dobavitelj: podatki.dobavitelj ?? null,
      stevilka: podatki.stevilka_dokumenta ?? null,
      datum: podatki.datum ?? null,
      artikli: oznaceni,
    })
  } catch (e: any) {
    console.error('uvoz dobavnice (portal):', e?.message || e)
    return NextResponse.json({ error: e?.message || 'Dokumenta ni bilo mogoče obdelati.' }, { status: 500 })
  }
}
