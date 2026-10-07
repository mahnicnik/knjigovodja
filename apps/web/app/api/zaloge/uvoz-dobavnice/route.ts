import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { zahtevajPaket } from '@/lib/paket'
import { predlagajVsebino, preracunaj, kljucPretvorbe } from '@/lib/pakiranje'

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
      "vsebina_pakiranja": null,
      "enota_vsebine": null,
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
- Zneskov ne zaokrožuj na dve mesti — nabavne cene imajo pogosto štiri.
- "vsebina_pakiranja" in "enota_vsebine": koliko ENOT PORABE je v ENEM pakiranju, kot ga šteje "kolicina". Primeri: "SOD LAŠKO 20L", 1 kos → 20 in "L"; "ČAJ 20/1" ali "20 vrečk", 1 paket → 20 in "kos"; "VINO 6x0,75L", 1 karton → 6 in "kos"; "KAVA 1KG", 2 kos → 1 in "kg". Če je pakiranje že enota porabe (1 steklenica, 1 kos) ali tega ni mogoče razbrati, vrni null. Ne ugibaj.`

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

  // REVIZIJA PAKETOV (migracija 182): DODANA preverba za nove organizacije
  // (zaloge = Pro + POS). Za obstojece vedno dovoljeno.
  const zavrnjenoPaket = await zahtevajPaket(supabase, orgId, 'zaloge', 'Uvoz dobavnice v zaloge')
  if (zavrnjenoPaket) return zavrnjenoPaket

  // ── DRUGI KORAK: uporabnik je predlog potrdil ──
  if (potrdi && Array.isArray(artikli)) {
    let dodanih = 0, posodobljenih = 0
    const napake: string[] = []

    const pretvorbe: any[] = []
    for (const a of artikli) {
      if (!a?.naziv || !(Number(a.kolicina) > 0)) continue
      // PAKIRANJE (7.10.2026): kolicina in cena v ENOTI ZALOGE - sod 20 L
      // za 40 EUR je +20 L po 2,00 EUR/L, ne +1 po 40 EUR. Vsebino potrdi
      // uporabnik v predlogu (lib/pakiranje.ts).
      const vsebina = Number(a.vsebina) > 0 ? Number(a.vsebina) : 1
      const { zaloga: kolicina, cenaNaEnoto: cena } = preracunaj(Number(a.kolicina), a.neto_cena_brez_ddv, vsebina)
      const enotaZaloge = a.enota_zaloge || a.enota || 'kos'
      const kljuc = kljucPretvorbe({ sku: a.sku, naziv: a.naziv }, a.dobavitelj)
      if (kljuc && (vsebina !== 1 || a.vsebina_rocno)) {
        pretvorbe.push({ org_id: orgId, kljuc, vsebina, enota: enotaZaloge, updated_at: new Date().toISOString() })
      }

      // Ujemanje najprej po sifri, sele nato po imenu - sifra je zanesljivejsa.
      const { data: obstojeci } = a.sku
        ? await supabase.from('inventory_items').select('id, current_stock')
            .eq('org_id', orgId).eq('sku', a.sku).limit(1)
        : await supabase.from('inventory_items').select('id, current_stock')
            .eq('org_id', orgId).ilike('name', a.naziv).limit(1)

      const najden = obstojeci?.[0]

      if (najden) {
        const novo = Number(najden.current_stock || 0) + kolicina
        const posodobitev: any = { current_stock: novo }
        if (cena != null && cena > 0) posodobitev.purchase_price = cena
        const { error } = await supabase.from('inventory_items').update(posodobitev).eq('id', najden.id)
        if (error) { napake.push(`${a.naziv}: ${error.message}`); continue }
        posodobljenih++

        await supabase.from('inventory_movements').insert({
          org_id: orgId, item_id: najden.id, type: 'in',
          quantity: kolicina, unit_price: cena,
          reference: a.dokument || 'Uvoz dobavnice',
          notes: opomba(a, vsebina),
        })
      } else {
        const { data: nov, error } = await supabase.from('inventory_items').insert({
          org_id: orgId,
          name: String(a.naziv).slice(0, 200),
          sku: a.sku || null,
          unit: enotaZaloge,
          purchase_price: cena,
          vat_rate: a.ddv_stopnja ?? 22,
          current_stock: kolicina,
          is_active: true,
        }).select('id').single()

        if (error) { napake.push(`${a.naziv}: ${error.message}`); continue }
        dodanih++

        await supabase.from('inventory_movements').insert({
          org_id: orgId, item_id: nov.id, type: 'in',
          quantity: kolicina, unit_price: cena,
          reference: a.dokument || 'Uvoz dobavnice',
          notes: opomba(a, vsebina),
        })
      }
    }

    // Potrjene vsebine si zapomnimo (migracija 184). Pred migracijo tabele ni -
    // uvoz zaradi tega ne sme pasti.
    if (pretvorbe.length > 0) {
      const { error: pErr } = await supabase.from('pretvorbe_pakiranja').upsert(pretvorbe, { onConflict: 'business_id,org_id,kljuc' })
      if (pErr) console.warn('Pretvorb pakiranja ni bilo mogoce shraniti:', pErr.message)
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
      .select('id, name, sku, unit, current_stock, purchase_price').eq('org_id', orgId)
    // Shranjene pretvorbe pakiranja (migracija 184); pred migracijo jih ni.
    const { data: shranjene } = await supabase.from('pretvorbe_pakiranja')
      .select('kljuc, vsebina').eq('org_id', orgId)
    const poKljucu = new Map((shranjene || []).map((r: any) => [r.kljuc, Number(r.vsebina)]))

    const oznaceni = podatki.artikli.map((a: any) => {
      const najden = (vsi || []).find((x: any) =>
        (a.sku && x.sku && String(x.sku) === String(a.sku))
        || String(x.name).toLowerCase() === String(a.naziv || '').toLowerCase())
      // Enota zaloge: obstojeci artikel ima svojo, nov dobi enoto porabe.
      const enotaZaloge = najden?.unit || a.enota_vsebine || a.enota || 'kos'
      const kljuc = kljucPretvorbe({ sku: a.sku, naziv: a.naziv }, podatki.dobavitelj)
      const pak = predlagajVsebino({
        naziv: a.naziv,
        ai: { vsebina: a.vsebina_pakiranja, enota: a.enota_vsebine },
        shranjeno: kljuc ? poKljucu.get(kljuc) ?? null : null,
        ciljnaEnota: enotaZaloge,
      })
      return {
        ...a,
        dobavitelj: podatki.dobavitelj ?? null,
        dokument: podatki.stevilka_dokumenta ?? null,
        enota_zaloge: enotaZaloge,
        vsebina: pak.vsebina,
        vir_vsebine: pak.vir,
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

/** Opomba gibanja: dobavitelj in pakiranje, da je iz kartice razvidno, od kod kolicina. */
function opomba(a: any, vsebina: number): string | null {
  const deli = [a.dobavitelj, vsebina !== 1 ? `${a.kolicina} ${a.enota || 'kos'} × ${vsebina}` : null].filter(Boolean)
  return deli.length ? deli.join(' · ') : null
}
