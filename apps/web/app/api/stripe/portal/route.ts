export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveActiveOrgId, resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia' as any,
})

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
    }

    const member = await resolveActiveOrg(supabase, user.id, getRequestedOrgId(request), 'id, stripe_customer_id, subscription_status') // vec-org podpora (30.7.2026)

    const org = (member as any)?.organizations
    if (!org) {
      return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })
    }

    if (!org.stripe_customer_id) {
      return NextResponse.json({ error: 'Nimate aktivne naročnine' }, { status: 400 })
    }

    /**
     * NEVELJAVNA POVEZAVA S STRIPOM (prelet 215)
     * ══════════════════════════════════════════
     *
     * NAPAKA: uporabniku se je izpisalo surovo sporocilo Stripa v anglescini
     * - "No such customer: 'cus_...'". Stranka tega ne razume in izgleda,
     * kot da je z njenim placilom nekaj narobe.
     *
     * VZROK je obicajno preprost: `stripe_customer_id` v bazi kaze na
     * stranko, ki v Stripu ne obstaja - najpogosteje zato, ker je nastala v
     * PREIZKUSNEM nacinu, aplikacija pa dela v produkcijskem. Oznake med
     * okoljema niso prenosljive. Enako se zgodi pri paketih, dodeljenih
     * ROCNO: podjetje ima `pro_pos`, v Stripu pa ni nikoli nicesar kupilo.
     *
     * Neveljavno povezavo POCISTIMO in odgovorimo razumljivo. Paketa se NE
     * dotaknemo - dodeljen je bil zunaj Stripa in tam mora ostati.
     */
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: org.stripe_customer_id,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL}/nastavitve`,
      })
      return NextResponse.json({ url: session.url })
    } catch (e: any) {
      const neveljavna = /No such customer|resource_missing/i.test(String(e?.message || ''))
      if (!neveljavna) throw e
      await supabase.from('organizations').update({ stripe_customer_id: null }).eq('id', org.id)
      console.log(`Pociscena neveljavna povezava s Stripom za org ${org.id}`)
      return NextResponse.json({
        error: 'Naročnina ni bila sklenjena prek Stripa, zato je tu ni mogoče upravljati.',
        brezNarocnine: true,
      }, { status: 400 })
    }
  } catch (error: any) {
    console.error('Stripe portal error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
