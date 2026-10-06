import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { zgradiESlogXml } from '@/lib/e-slog'

/**
 * PRENOS E-RAČUNA (e-SLOG 2.0)
 *
 * Vrne datoteko XML, ki jo uporabnik nalozi v spletno banko ali pri
 * ponudniku e-poti. Neposredne oddaje na UJP ta pot NE opravlja - portal
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
    if (!racun) return NextResponse.json({ error: 'Račun ni najden' }, { status: 404 })

    if (racun.status === 'draft') {
      return NextResponse.json({ error: 'Osnutek ni izdan račun. Najprej ga izdajte.' }, { status: 400 })
    }

    const { data: org } = await supabase
      .from('organizations').select('*').eq('id', racun.org_id).maybeSingle()
    if (!org) return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })

    const postavke = (Array.isArray(racun.line_items) ? racun.line_items : []).map((p: any) => ({
      opis: String(p.description ?? ''),
      kolicina: Number(p.quantity ?? 1),
      cenaBrezDdv: Number(p.unit_price ?? 0),
      stopnjaDdv: Number(p.vat_rate ?? 22),
      popustOdstotek: Number(p.discount_pct ?? 0),
    }))

    const davcnaBrez = String(org.tax_number || '').replace(/^SI/i, '')

    const xml = zgradiESlogXml({
      stevilka: racun.invoice_number,
      datumIzdaje: String(racun.issue_date),
      datumZapadlosti: racun.due_date ? String(racun.due_date) : null,
      datumDobave: racun.service_date ? String(racun.service_date) : null,
      sklic: racun.reference || null,
      opomba: racun.notes || null,
      izdajatelj: {
        naziv: org.name,
        naslov: org.address || null,
        posta: org.post_code || null,
        kraj: org.city || null,
        davcna: davcnaBrez,
        // ID za DDV se navede SAMO pri zavezancu - sicer prejemnik pricakuje
        // odbitek DDV, ki ga na racunu ni.
        idZaDdv: org.vat_registered ? `SI${davcnaBrez}` : null,
        iban: org.iban || null,
        bic: org.bic || null,
      },
      kupec: {
        naziv: racun.client_name,
        naslov: racun.client_address || null,
        davcna: racun.client_tax_number || null,
        idZaDdv: racun.client_vat_number || null,
      },
      postavke,
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
    return NextResponse.json({ error: 'E-računa ni bilo mogoče pripraviti.' }, { status: 500 })
  }
}
