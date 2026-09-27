import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { resolveActiveOrgId } from '@/lib/active-org-server'
import { skenirajPovezavo } from '@/lib/email-scan'

export const maxDuration = 300


/**
 * Preveri Gmail povezave organizacije, poisce e-maile s prilogami od
 * zadnjega skeniranja (ali izbranega obdobja) naprej, jih analizira z AI,
 * in shrani v email_scan_pending za rocno potrditev. Nic ne gre avtomatsko
 * v receipts.
 *
 * POPRAVLJENO (30.7.2026, na Nikovo prosnjo - "spusti veliko racunov"):
 * najdeni in odpravljeni STIRJE loceni vzroki izgube racunov:
 *
 * 1. PAGINACIJA: Gmail vrne max 20 zadetkov na klic, koda ni brala
 *    naslednjih strani (nextPageToken) - pri vecjem stevilu racunov v
 *    obdobju je obdelala samo prvih 20, ostalo tiho izgubila.
 *    -> Zdaj bere do 5 strani (100 sporocil), z opozorilom ce jih je se vec.
 *
 * 2. KLJUCNE BESEDE KOT OBVEZEN POGOJ: iskanje je zahtevalo eno od besed
 *    "racun/invoice/faktura/receipt" V BESEDILU e-poste. Dobavitelj, ki
 *    napise samo "V prilogi posiljamo dokument", je bil spregledan -
 *    CEPRAV ima priloz en pravi racun.
 *    -> Zdaj iscemo VSE e-poste s prilogo v obdobju; AI ze itak razvrsca
 *    is_invoice:true/false PO branju, torej dvojno filtriranje ni bilo
 *    potrebno in je le izgubljalo prave racune.
 *
 * 3. LAST_SCANNED_AT SE JE PREMAKNIL TUDI OB NAPAKI: ce je Gmail vrnil
 *    napako (potekel zeton, kvota), se je cas skeniranja vseeno posodobil
 *    -> tisto obdobje se ni NIKOLI vec skeniralo. Zdaj se cas premakne
 *    SAMO ob resnicnem uspehu.
 *
 * 4. SAMO .pdf: druge oblike (.xml e-SLOG, skenirane slike) se niso nasle.
 *    NAMENOMA NEPOPRAVLJENO v tem koraku - AI branje spodaj pricakuje PDF;
 *    razsiritev na slike/XML zahteva locen poseg v AI klic in shranjevanje.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })

    // Neobvezno: rocno izbrano casovno okno (namesto "od zadnjega skena naprej")
    let customFrom: Date | null = null
    let customTo: Date | null = null
    const body = await request.json().catch(() => ({} as any))
    if (body.from) customFrom = new Date(body.from)
    if (body.to) customTo = new Date(body.to)

    // PRELET 332: aktivna organizacija (prej .maybeSingle() na org_members -
    // uporabnik z VEC organizacijami je dobil "Org ni najdena").
    const { orgId } = await resolveActiveOrgId(supabase as any, user.id, body.orgId ?? request.headers.get('x-active-org'))
    if (!orgId || (body.orgId && orgId !== body.orgId)) return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })
    const member = { org_id: orgId }

    const { data: connections } = await supabase
      .from('email_connections')
      .select('*')
      .eq('org_id', member.org_id)
      .eq('is_active', true)

    if (!connections || connections.length === 0) {
      return NextResponse.json({ error: 'Ni povezanih e-mail racunov' }, { status: 400 })
    }

    // PRELET 334: skupna logika z nocnim skeniranjem (lib/email-scan).
    const zacetek = Date.now()
    const skupaj = { scanned: 0, found: 0, zeVneseno: 0, niRacun: 0, zaklenjenih: 0, napak: 0, nedokoncano: false, napake: [] as string[] }
    for (const conn of connections) {
      const preostalo = 240_000 - (Date.now() - zacetek)
      if (preostalo < 15_000) { skupaj.nedokoncano = true; break }
      const od = customFrom || (conn.last_scanned_at ? new Date(conn.last_scanned_at) : new Date(Date.now() - 7 * 86_400_000))
      const izid = await skenirajPovezavo(supabase, conn, { od, do: customTo, rokMs: preostalo, premakniOznako: true })
      skupaj.scanned += izid.pregledanih
      skupaj.found += izid.najdenih
      skupaj.zeVneseno += izid.zeVneseno
      skupaj.niRacun += izid.niRacun
      skupaj.zaklenjenih += izid.zaklenjenih
      skupaj.napak += izid.napak
      skupaj.nedokoncano = skupaj.nedokoncano || izid.nedokoncano
      if (izid.napaka) skupaj.napake.push(`${conn.email_address}: ${izid.napaka}`)
    }

    return NextResponse.json({
      success: true,
      ...skupaj,
      capped: skupaj.nedokoncano, // zdruzljivost s starim odjemalcem
    })
  } catch (e: any) {
    console.error('Email scan run error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
