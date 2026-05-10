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
    case 'checkout.session.completed':
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.type === 'checkout.session.completed'
        ? null
        : event.data.object as Stripe.Subscription

      if (orgId) {
        await sb.from('organizations').update({
          subscription_status: 'pro',
          stripe_subscription_id: sub?.id || null,
          plan_expires_at: sub ? new Date((sub as any).current_period_end * 1000).toISOString() : null,
        }).eq('id', orgId)
        console.log(`✅ Subscription PRO: ${orgId}`)
      }
      break
    }

    case 'customer.subscription.deleted': {
      if (orgId) {
        await sb.from('organizations').update({
          subscription_status: 'cancelled',
          stripe_subscription_id: null,
          plan_expires_at: null,
        }).eq('id', orgId)
        console.log(`⬇️ Subscription CANCELLED: ${orgId}`)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}