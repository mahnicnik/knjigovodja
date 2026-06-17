import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia' as any,
})

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID!
const PRO_POS_PRICE_ID = process.env.STRIPE_PRO_POS_PRICE_ID!

function getPlanFromPriceId(priceId: string | null): 'pro' | 'pro_pos' {
  if (priceId === PRO_POS_PRICE_ID) return 'pro_pos'
  return 'pro'
}

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

  const orgId = (event.data.object as any)?.metadata?.org_id

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (orgId) {
        // Pridobi subscription da dobimo price_id
        let plan: 'pro' | 'pro_pos' = 'pro'
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string)
          const priceId = sub.items.data[0]?.price?.id || null
          plan = getPlanFromPriceId(priceId)
        }
        await sb.from('organizations').update({
          subscription_status: plan,
          stripe_subscription_id: session.subscription as string || null,
        }).eq('id', orgId)
        console.log(`✅ Checkout complete - plan ${plan}: ${orgId}`)
      }
      break
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const priceId = sub.items.data[0]?.price?.id || null
      const plan = getPlanFromPriceId(priceId)

      if (orgId) {
        await sb.from('organizations').update({
          subscription_status: plan,
          stripe_subscription_id: sub.id,
          plan_expires_at: new Date(sub.current_period_end * 1000).toISOString(),
        }).eq('id', orgId)
        console.log(`✅ Subscription ${plan}: ${orgId}`)
      }
      break
    }

    case 'customer.subscription.deleted': {
      if (orgId) {
        await sb.from('organizations').update({
          subscription_status: 'free',
          stripe_subscription_id: null,
          plan_expires_at: null,
        }).eq('id', orgId)
        console.log(`⬇️ Subscription cancelled -> free: ${orgId}`)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
