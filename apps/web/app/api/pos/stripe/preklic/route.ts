export const dynamic = 'force-dynamic'
/**
 * PRELET 357: preklic čakajočega plačila v blagajni.
 * Session pri Stripe poteče (expire) in plačilo dobi stanje 'preklicano'.
 * Če je stranka medtem že plačala, preklic NI mogoč - račun se zaključi.
 */
import { NextResponse } from 'next/server'
import { sejaInOrganizacija } from '@/lib/stripe-connect-seja'
import { adminSupabase, stripeConnect } from '@/lib/stripe-connect'
import { supabaseShramba, zakljuciPosPlacilo } from '@/lib/pos-stripe'

export async function POST(req: Request) {
  const s = await sejaInOrganizacija(req)
  if (!s) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id je obvezen' }, { status: 400 })
  const { data: vidna } = await s.supabase.from('pos_placila_stripe').select('id').eq('id', id).maybeSingle()
  if (!vidna) return NextResponse.json({ error: 'Plačilo ni najdeno' }, { status: 404 })

  const admin = adminSupabase()
  const { data: p } = await admin.from('pos_placila_stripe').select('*').eq('id', id).single()
  if (p.status !== 'cakanje') return NextResponse.json({ status: p.status })

  const { data: org } = await admin.from('organizations').select('stripe_account_id').eq('id', p.org_id).single()
  if (p.checkout_session_id && org?.stripe_account_id) {
    const stripe = stripeConnect()
    try {
      await stripe.checkout.sessions.expire(p.checkout_session_id, {}, { stripeAccount: org.stripe_account_id })
    } catch (e: any) {
      const sess = await stripe.checkout.sessions.retrieve(p.checkout_session_id, {}, { stripeAccount: org.stripe_account_id }).catch(() => null)
      if (sess?.payment_status === 'paid') {
        await zakljuciPosPlacilo(supabaseShramba(admin), p.id, String(sess.payment_intent || '') || null)
        return NextResponse.json({ status: 'placano', error: 'Stranka je že plačala — preklic ni mogoč, račun je zaključen.' }, { status: 409 })
      }
      if (sess?.status !== 'expired') {
        return NextResponse.json({ error: 'Preklic pri Stripe ni uspel: ' + (e?.message || e) }, { status: 502 })
      }
    }
  }
  await admin.from('pos_placila_stripe').update({ status: 'preklicano' }).eq('id', id).eq('status', 'cakanje')
  return NextResponse.json({ status: 'preklicano' })
}
