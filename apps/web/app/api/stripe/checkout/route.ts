export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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
    const body2 = await request.json().catch(() => ({}))
    const targetPlan = body2.plan === 'pro_pos' ? 'pro_pos' : 'pro'
    const priceId = targetPlan === 'pro_pos'
      ? process.env.STRIPE_PRO_POS_PRICE_ID!
      : process.env.STRIPE_PRO_PRICE_ID!

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
    }

    // Pridobi org preko org_members (ne preko owner_id)
    const { data: member, error: memberErr } = await supabase
      .from('org_members')
      .select('organizations(id, name, stripe_customer_id, subscription_status)')
      .eq('user_id', user.id)
      .maybeSingle()

    if (memberErr || !member || !(member as any).organizations) {
      console.error('Org lookup error:', memberErr)
      return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })
    }

    const org = (member as any).organizations

    // Preveri da uporabnik še nima Pro
    if (org.subscription_status === 'pro') {
      return NextResponse.json({ error: 'Že imate Pro plan' }, { status: 400 })
    }

    // Ustvari ali pridobi Stripe customer
    let customerId = org.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: org.name,
        metadata: { org_id: org.id, user_id: user.id },
      })
      customerId = customer.id

      await supabase
        .from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', org.id)
    }

    // Ustvari checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/nastavitve?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/nastavitve?cancelled=true`,
      metadata: { org_id: org.id },
      subscription_data: {
        metadata: { org_id: org.id },
      },
      locale: 'sl',
    })

    return NextResponse.json({ url: session.url })

  } catch (error: any) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}