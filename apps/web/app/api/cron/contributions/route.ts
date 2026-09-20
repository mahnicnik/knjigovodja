import { NextRequest, NextResponse } from 'next/server'
import { lokalniDatum } from '@/lib/tax-constants'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// Prispevki zapadejo 20. v mesecu (glej isto stevilko v dashboard/page.tsx).
const DAN_ZAPADLOSTI = 20
// Ce cron 20. spodleti (npr. deploy, izpad), poskusamo se nekaj dni naprej -
// dokler ne obstaja samodejni zapis za TA mesec, se ne bomo podvojili.
const DOHITEVANJE_DNI = 5
const OZNAKA_DOBAVITELJA = 'Prispevki za s.p. (samodejno)'

/**
 * DODANO: samodejno dodajanje prispevkov s.p. med stroske.
 *
 * Klican preko Vercel Cron (dnevno, iz api/cron/daily). Prispevki so bili
 * prej v aplikaciji SAMO opomnik + UPN QR koda za placilo (glej /prispevki)
 * - v knjigo stroskov (receipts + kpo_entries) se NIKOLI niso samodejno
 * steli, uporabnik jih je moral po placilu rocno vnesti v Stroskih. Ker to
 * marsikdo pozabi, je zdaj to MOZNOST (privzeto izklopljena), ki jo vsaka
 * organizacija vklopi sama v Nastavitvah (organizations.auto_prispevki_strosek).
 *
 * Namerno NE vkljucuje akontacije dohodnine (contrib_akontacija) - to ni
 * prispevek za socialno varnost, ampak predplacilo davka na dobicek, ki se
 * ob letni napovedi poracuna - ni poslovni strosek s.p.-ja.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const danes = new Date()
  const dan = danes.getDate()
  // Zunaj okna zapadlosti (20. + nekaj dni dohitevanja) ni kaj delati.
  if (dan < DAN_ZAPADLOSTI || dan > DAN_ZAPADLOSTI + DOHITEVANJE_DNI) {
    return NextResponse.json({ success: true, skipped: 'izven okna zapadlosti', day: dan })
  }

  const datumZapadlosti = new Date(danes.getFullYear(), danes.getMonth(), DAN_ZAPADLOSTI)
  const datumStr = lokalniDatum(datumZapadlosti)
  // Meje TEKOCEGA meseca - za preverbo, ali je samodejni zapis ze bil ustvarjen.
  const zacetekMeseca = lokalniDatum(new Date(danes.getFullYear(), danes.getMonth(), 1))
  const koniecMeseca = lokalniDatum(new Date(danes.getFullYear(), danes.getMonth() + 1, 0))

  const { data: orgs, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name, contrib_piz, contrib_zzzs, contrib_zaposlovanje, contrib_starsevstvo')
    .eq('auto_prispevki_strosek', true)

  if (orgErr) {
    return NextResponse.json({ error: orgErr.message }, { status: 500 })
  }

  let ustvarjeno = 0
  let preskoceno = 0
  const napake: string[] = []

  for (const org of orgs || []) {
    const vsota = Number(org.contrib_piz || 0) + Number(org.contrib_zzzs || 0)
      + Number(org.contrib_zaposlovanje || 0) + Number(org.contrib_starsevstvo || 0)
    if (!(vsota > 0)) { preskoceno++; continue }

    // Varovalka pred podvajanjem - ce zapis za ta mesec ze obstaja (npr.
    // cron je ze tekel danes ali v okviru dohitevanja), ga ne ustvarimo znova.
    const { data: obstojec } = await supabase
      .from('receipts')
      .select('id')
      .eq('org_id', org.id)
      .eq('vendor', OZNAKA_DOBAVITELJA)
      .gte('receipt_date', zacetekMeseca)
      .lte('receipt_date', koniecMeseca)
      .maybeSingle()
    if (obstojec) { preskoceno++; continue }

    const { data: rcp, error: rcpErr } = await supabase.from('receipts').insert({
      org_id: org.id,
      vendor: OZNAKA_DOBAVITELJA,
      receipt_date: datumStr,
      amount_net: vsota,
      vat_rate: 0,
      vat_amount: 0,
      amount_total: vsota,
      description: 'Mesečni prispevki s.p. (PIZ, ZZZS, zaposlovanje, starševsko varstvo) — samodejno iz nastavitev',
      category: 'Prispevki',
      status: 'confirmed',
      is_deductible: true,
    }).select('id').single()

    if (rcpErr) {
      napake.push(`${org.name}: ${rcpErr.message}`)
      continue
    }

    // Enak vzorec kot pri AI-skeniranju - receipt_id na kpo_entries prepreci
    // dvojno stetje istega stroska na Dashboardu (glej prelet 294/295).
    const { error: kpoErr } = await supabase.from('kpo_entries').insert({
      org_id: org.id,
      entry_date: datumStr,
      description: `${OZNAKA_DOBAVITELJA} — Prispevki`,
      entry_type: 'expense',
      income: 0,
      expense: vsota,
      vat_in: 0,
      vat_out: 0,
      category: 'Prispevki',
      receipt_id: rcp?.id ?? null,
    })
    if (kpoErr) {
      napake.push(`${org.name}: ${kpoErr.message}`)
      continue
    }
    ustvarjeno++
  }

  return NextResponse.json({ success: true, ustvarjeno, preskoceno, napake })
}
