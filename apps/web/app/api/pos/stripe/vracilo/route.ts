export const dynamic = 'force-dynamic'
/**
 * PRELET 357: vračilo plačila s Stripe ob stornu računa v blagajni.
 *
 * GET  ?order_id=  → ali je bil račun plačan s Stripe in ali je vračilo mogoče
 * POST { order_id } → celotno vračilo prek Stripe (na povezanem računu),
 *                    stanje 'vrnjeno'. Idempotentno (en ključ na plačilo).
 *
 * Storno pri FURS ostane obstoječi postopek (api/furs/void) - ta pot vrne
 * samo denar.
 */
import { NextResponse } from 'next/server'
import { sejaInOrganizacija } from '@/lib/stripe-connect-seja'
import { adminSupabase, stripeConnect } from '@/lib/stripe-connect'

async function najdi(s: any, orderId: string) {
  const { data } = await s.supabase.from('pos_placila_stripe')
    .select('id, status, znesek_centi, payment_intent_id, org_id, refund_id')
    .eq('order_id', orderId).in('status', ['placano', 'vrnjeno'])
    .order('ustvarjeno', { ascending: false }).limit(1).maybeSingle()
  return data
}

export async function GET(req: Request) {
  const s = await sejaInOrganizacija(req)
  if (!s) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
  const orderId = new URL(req.url).searchParams.get('order_id')
  if (!orderId) return NextResponse.json({ stripe: false })
  const p = await najdi(s, orderId)
  if (!p) return NextResponse.json({ stripe: false })
  return NextResponse.json({ stripe: true, id: p.id, status: p.status, znesekCenti: p.znesek_centi })
}

export async function POST(req: Request) {
  const s = await sejaInOrganizacija(req)
  if (!s) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
  const { order_id } = await req.json().catch(() => ({}))
  if (!order_id) return NextResponse.json({ error: 'order_id je obvezen' }, { status: 400 })
  const p = await najdi(s, order_id)
  if (!p) return NextResponse.json({ error: 'Račun ni bil plačan s Stripe.' }, { status: 404 })
  if (p.status === 'vrnjeno') return NextResponse.json({ status: 'vrnjeno', refundId: p.refund_id })
  if (!p.payment_intent_id) return NextResponse.json({ error: 'Plačilu manjka oznaka pri Stripe — vračilo izvedite v Stripe nadzorni plošči.' }, { status: 400 })

  const admin = adminSupabase()
  const { data: org } = await admin.from('organizations').select('stripe_account_id').eq('id', p.org_id).single()
  if (!org?.stripe_account_id) return NextResponse.json({ error: 'Stripe ni več povezan — vračilo izvedite v Stripe nadzorni plošči.' }, { status: 400 })
  try {
    const stripe = stripeConnect()
    const refund = await stripe.refunds.create(
      { payment_intent: p.payment_intent_id, reason: 'requested_by_customer', metadata: { vrsta: 'pos', placilo_id: p.id, order_id } },
      { stripeAccount: org.stripe_account_id, idempotencyKey: `pos-vracilo-${p.id}` },
    )
    await admin.from('pos_placila_stripe').update({
      status: 'vrnjeno', refund_id: refund.id, vrnjeno_ob: new Date().toISOString(),
    }).eq('id', p.id)
    return NextResponse.json({ status: 'vrnjeno', refundId: refund.id })
  } catch (e: any) {
    return NextResponse.json({ error: 'Vračilo pri Stripe ni uspelo: ' + (e?.message || e) }, { status: 502 })
  }
}
