import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { stripeZaOrg, uskladiOrg, KljucNeDeluje } from '@/lib/stripe-placila'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * PRELET 326: NOCNA USKLADITEV STRIPE PLACIL.
 *
 * Za vsako organizacijo s kljucem za branje gre cez vsa placila, Stripe
 * racune in vracila zadnjih 14 dni in jih pelje skozi ISTO obdelavo kot
 * webhook (lib/stripe-placila). Kar je webhook ze obdelal, se preskoci brez
 * klicev API; kar je manjkalo (izpadel dogodek, dogodek, ki ga webhook ne
 * poslusa, napacen secret ...), dobi racun oziroma dobropis zdaj.
 *
 * Tako placilo brez racuna ne more vec ostati neopazeno dlje kot en dan.
 */
export async function GET(request: NextRequest) {
  // Brez nastavljenega CRON_SECRET se NE izvede (sicer bi 'Bearer undefined' odprl vrata).
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sb = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: integracije } = await sb.from('integrations')
    .select('org_id')
    .eq('type', 'stripe').eq('is_active', true).not('api_key_enc', 'is', null)
    // Najprej tiste, ki so najdlje neusklajene - ob casovni omejitvi pridejo na vrsto naslednjic.
    .order('zadnja_uskladitev', { ascending: true, nullsFirst: true })

  const zacetek = Date.now()
  const rezultati: any[] = []
  for (const i of integracije || []) {
    const preostalo = 55_000 - (Date.now() - zacetek)
    if (preostalo < 5_000) { rezultati.push({ org_id: i.org_id, preskoceno: 'časovna omejitev' }); continue }
    try {
      const s = await stripeZaOrg(sb, i.org_id)
      const { data: org } = await sb.from('organizations').select('*').eq('id', i.org_id).single()
      if (!s || !org) continue
      const izid = await uskladiOrg(sb, org, s.stripe, 14, preostalo - 3_000)
      rezultati.push({ org_id: i.org_id, ...izid })
    } catch (e: any) {
      const razlog = e instanceof KljucNeDeluje ? `kljuc_za_branje_ne_deluje (${e.message})` : String(e?.message || e)
      console.error('stripe-uskladitev:', i.org_id, razlog)
      rezultati.push({ org_id: i.org_id, napaka: razlog })
    }
  }
  return NextResponse.json({ success: true, organizacij: rezultati.length, rezultati })
}
