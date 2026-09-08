import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { zgradiERacunXml } from '@/lib/e-racun'

/**
 * PRENOS E-RAČUNA (EN 16931 / UBL 2.1)
 *
 * Vrne datoteko XML, ki jo uporabnik naloži v svojo spletno banko ali pri
 * ponudniku e-poti. Neposredne oddaje ta pot NE opravlja - portal UJPeRacun
 * nalozenih datotek ne sprejema.
 *
 * Od 1.1.2028 bo tak zapis obvezen za vse racune med podjetji (ZIERDED).
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })

    const { data: racun } = await supabase
      .from('issued_invoices').select('*').eq('id', id).maybeSingle()
    if (!racun) return NextResponse.json({ error: 'Racun ni najden' }, { status: 404 })

    const { data: org } = await supabase
      .from('organizations').select('*').eq('id', racun.org_id).maybeSingle()
    if (!org) return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })

    // Osnutek ni racun - e-racuna zanj ne izdajamo.
    if (racun.status === 'draft') {
      return NextResponse.json({ error: 'Osnutek ni izdan racun. Najprej ga izdajte.' }, { status: 400 })
    }

    const postavke = (Array.isArray(racun.line_items) ? racun.line_items : []).map((p: any) => {
      // Popust na postavko vracunamo v ceno - norma ga sicer pozna, a ga
      // podpremo sele, ko bo potrjeno, da ga prejemniki pravilno berejo.
      const popust = Number(p.discount_pct ?? 0)
      const cena = Number(p.unit_price ?? 0) * (1 - popust / 100)
      return {
        opis: String(p.description ?? ''),
        kolicina: Number(p.quantity ?? 1),
        cenaBrezDdv: cena,
        stopnjaDdv: Number(p.vat_rate ?? 22),
      }
    })

    const xml = zgradiERacunXml({
      stevilka: racun.invoice_number,
      datumIzdaje: String(racun.issue_date),
      datumZapadlosti: racun.due_date ? String(racun.due_date) : null,
      datumStoritve: racun.service_date ? String(racun.service_date) : null,
      sklic: racun.reference || null,
      opomba: racun.notes || null,
      izdajatelj: {
        naziv: org.name,
        naslov: org.address || '',
        posta: org.post_code || null,
        kraj: org.city || null,
        davcna: String(org.tax_number || '').replace(/^SI/i, ''),
        zavezanecZaDdv: !!org.vat_registered,
        iban: org.iban || null,
        bic: org.bic || null,
      },
      prejemnik: {
        naziv: racun.client_name,
        naslov: racun.client_address || null,
        davcna: racun.client_tax_number || null,
        idZaDdv: racun.client_vat_number || null,
        email: racun.client_email || null,
      },
      postavke,
      osnova: Number(racun.amount_net || 0),
      ddv: Number(racun.vat_amount || 0),
      skupaj: Number(racun.amount_total || 0),
      klavzulaOprostitve: racun.vat_exemption_text || null,
    })

    const ime = `e-racun-${String(racun.invoice_number).replace(/[^0-9A-Za-z-]/g, '_')}.xml`
    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${ime}"`,
      },
    })
  } catch (e: any) {
    console.error('e-racun:', e)
    return NextResponse.json({ error: 'E-racuna ni bilo mogoce pripraviti.' }, { status: 500 })
  }
}
