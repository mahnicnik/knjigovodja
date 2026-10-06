import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { odlociONarocnini, izStripeNarocnine, type CeneStripe, type OrgStripe } from '@/lib/narocnina-stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia' as any,
})

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID!
const PRO_POS_PRICE_ID = process.env.STRIPE_PRO_POS_PRICE_ID!
// PRELET 212: letni ceni. Brez njiju bi letni narocnik pristal na `pro`,
// tudi ce bi placal Pro + POS.
const PRO_YEARLY_PRICE_ID = process.env.STRIPE_PRO_YEARLY_PRICE_ID || ''
const PRO_POS_YEARLY_PRICE_ID = process.env.STRIPE_PRO_POS_YEARLY_PRICE_ID || ''

const CENE: CeneStripe = {
  pro: [PRO_PRICE_ID, PRO_YEARLY_PRICE_ID],
  proPos: [PRO_POS_PRICE_ID, PRO_POS_YEARLY_PRICE_ID],
}

/**
 * PAKET IZ CENE (prelet 212)
 * ══════════════════════════
 * Neznane cene NE ugibamo - glej lib/narocnina-stripe.ts (paketIzCene).
 * Bolje je, da placilo ostane neobdelano in to takoj vidimo, kot da nekomu
 * tiho dodelimo napacen paket.
 *
 * REVIZIJA PAKETOV (6.10.2026)
 * ════════════════════════════
 * Webhook narocnine NE bere vec iz dogodka, ampak jo vedno prebere svezo
 * iz Stripa (subscriptions.retrieve). Tako so vsi dogodki ene narocnine
 * idempotentni in neodvisni od vrstnega reda - zakasnel `updated` po
 * `deleted` ne vrne vec Pro. Upostevamo `status` (unpaid, canceled,
 * incomplete_expired -> free) in organizacijo najdemo tudi brez
 * metadata.org_id (po stripe_customer_id).
 */
export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')!
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    console.error('Webhook signature error:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let subId: string | null = null
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode === 'subscription' && session.subscription) {
        subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
      }
      break
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      subId = (event.data.object as Stripe.Subscription).id
      break
  }
  if (!subId) return NextResponse.json({ received: true })

  const sveza = await stripe.subscriptions.retrieve(subId)
  const sub = izStripeNarocnine(sveza)

  // Organizacija: metadata.org_id (checkout ga nastavi na naročnini), sicer
  // po Stripe stranki - npr. naročnina, ustvarjena v Stripe Dashboardu.
  const customerId = typeof sveza.customer === 'string' ? sveza.customer : sveza.customer?.id
  const metaOrg = (sveza.metadata as any)?.org_id || (event.data.object as any)?.metadata?.org_id || null
  let org: OrgStripe | null = null
  if (metaOrg) {
    const { data } = await sb.from('organizations').select('id, stripe_subscription_id').eq('id', metaOrg).maybeSingle()
    org = data
  }
  if (!org && customerId) {
    const { data } = await sb.from('organizations').select('id, stripe_subscription_id').eq('stripe_customer_id', customerId).limit(1)
    org = data?.[0] ?? null
  }
  if (!org) {
    console.error(`Narocnina ${sub.id} (stranka ${customerId}) brez organizacije - dogodek ${event.type} preskocen.`)
    return NextResponse.json({ received: true, preskoceno: 'organizacija ni najdena' })
  }

  const odlocitev = odlociONarocnini(org, sub, CENE)
  if (odlocitev.tip === 'napaka') {
    // Stripe dogodek ponovi - stranka je placala in mora dobiti dostop,
    // ceprav z zamikom, ko bo nastavitev cen popravljena.
    console.error(`KRITICNO: ${odlocitev.razlog} (org ${org.id}) - paket NI dodeljen. Preverite STRIPE_*_PRICE_ID.`)
    return NextResponse.json({ error: 'Cena ni prepoznana' }, { status: 500 })
  }
  if (odlocitev.tip === 'preskoci') {
    console.log(`Stripe ${event.type}: ${odlocitev.razlog} (org ${org.id})`)
    return NextResponse.json({ received: true })
  }

  // POPRAVLJENO (16.8.2026): brez preverbe napake bi webhook vrnil uspeh in
  // Stripe dogodka ne bi ponovil - placilo brez dostopa ali preklic brez
  // zaklepa, brez sledi o vzroku.
  const { error: upErr } = await sb.from('organizations').update(odlocitev.polja).eq('id', org.id)
  if (upErr) {
    console.error(`KRITICNO: narocnine ${sub.id} (${sub.status}) za org ${org.id} NI bilo mogoce zabeleziti:`, upErr)
    return NextResponse.json({ error: 'Posodobitev naročnine ni uspela' }, { status: 500 })
  }
  console.log(`Stripe ${event.type}: org ${org.id} -> ${odlocitev.polja.subscription_status} (${sub.status})`)
  return NextResponse.json({ received: true })
}
