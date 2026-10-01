export const dynamic = 'force-dynamic'
/**
 * PRELET 357: WEBHOOK ZA STRIPE CONNECT (placila strank).
 * ═════════════════════════════════════════════════════════
 *
 * LOCEN od app/api/stripe/webhook (narocnine Racunka): svoja skrivnost
 * STRIPE_CONNECT_WEBHOOK_SECRET, dogodki prihajajo s POVEZANIH racunov
 * (event.account).
 *
 * Dogodki:
 *   checkout.session.completed → placilo v blagajni (metadata.vrsta = 'pos')
 *                                ali zahtevek na portalu (vrsta = 'zahtevek')
 *   checkout.session.expired   → poteklo
 *   charge.refunded            → vrnjeno
 *   account.updated            → stanje povezave (charges/payouts enabled)
 *
 * IDEMPOTENTNO na dveh ravneh: (1) ze obdelan event.id se preskoci,
 * (2) vsaka obdelava je atomaren prehod stanja v bazi - tudi vzporedna
 * dostava istega dogodka zakljuci racun najvec enkrat.
 */
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { adminSupabase, CONNECT_API_VERZIJA, jeZiviKljuc } from '@/lib/stripe-connect'
import { supabaseShramba, zakljuciPosPlacilo } from '@/lib/pos-stripe'
import { obdelajPlacanZahtevek, oznaciZahtevekVrnjen } from '@/lib/zahtevki'

export const maxDuration = 120

export async function POST(req: Request) {
  const skrivnost = process.env.STRIPE_CONNECT_WEBHOOK_SECRET
  if (!skrivnost) return NextResponse.json({ error: 'STRIPE_CONNECT_WEBHOOK_SECRET ni nastavljen' }, { status: 500 })
  const podpis = req.headers.get('stripe-signature')
  if (!podpis) return NextResponse.json({ error: 'Manjka podpis' }, { status: 400 })

  const telo = await req.text()
  const stripe = new Stripe(process.env.STRIPE_CONNECT_SECRET_KEY || 'sk_test_samo_za_podpis', { apiVersion: CONNECT_API_VERZIJA as any })
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(telo, podpis, skrivnost)
  } catch (e: any) {
    return NextResponse.json({ error: 'Neveljaven podpis: ' + e?.message }, { status: 400 })
  }

  // PRELET 363: zivi Connect endpoint prejema TUDI testne dogodke povezanih
  // racunov (in obratno). Obdelamo samo dogodke nacina, v katerem je kljuc.
  if (!!event.livemode !== jeZiviKljuc()) {
    return NextResponse.json({ received: true, preskoceno: event.livemode ? 'zivi dogodek, testni kljuc' : 'testni dogodek, zivi kljuc' })
  }

  const admin = adminSupabase()
  const { data: ze } = await admin.from('stripe_connect_dogodki').select('event_id').eq('event_id', event.id).maybeSingle()
  if (ze) return NextResponse.json({ received: true, podvojen: true })

  const racun = (event as any).account as string | undefined
  let izid: any = { preskoceno: true }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const sess = event.data.object as Stripe.Checkout.Session
        if (sess.payment_status !== 'paid') { izid = { caka: sess.payment_status }; break }
        const md = sess.metadata || {}
        if (!(await racunPripada(admin, md.org_id, racun))) { izid = { preskoceno: 'tuj racun' }; break }
        const pi = typeof sess.payment_intent === 'string' ? sess.payment_intent : sess.payment_intent?.id || null
        if (md.vrsta === 'pos' && md.placilo_id) {
          izid = await zakljuciPosPlacilo(supabaseShramba(admin), md.placilo_id, pi)
          if (izid.stanje === 'napaka') {
            // 500 -> Stripe dogodek ponovi (prehodna napaka baze ipd.).
            return NextResponse.json({ error: izid.napaka }, { status: 500 })
          }
        } else if (md.vrsta === 'zahtevek' && md.zahtevek_id) {
          izid = await obdelajPlacanZahtevek(admin, md.zahtevek_id, { sessionId: sess.id, paymentIntentId: pi, osnova: new URL(req.url).origin })
          if (izid.stanje === 'napaka') return NextResponse.json({ error: izid.napaka }, { status: 500 })
        }
        break
      }
      case 'checkout.session.expired': {
        const sess = event.data.object as Stripe.Checkout.Session
        const md = sess.metadata || {}
        if (md.vrsta === 'pos' && md.placilo_id) {
          await admin.from('pos_placila_stripe').update({ status: 'poteklo' })
            .eq('id', md.placilo_id).eq('checkout_session_id', sess.id).eq('status', 'cakanje')
          izid = { poteklo: md.placilo_id }
        }
        // Zahtevek s potekom posameznega sessiona NE poteče - povezava
        // /placaj/[zeton] ustvari novega, dokler zahtevek velja.
        break
      }
      case 'charge.refunded': {
        const ch = event.data.object as Stripe.Charge
        const pi = typeof ch.payment_intent === 'string' ? ch.payment_intent : ch.payment_intent?.id
        if (pi && ch.refunded) {
          const refundId = (ch as any).refunds?.data?.[0]?.id ?? null
          await admin.from('pos_placila_stripe').update({ status: 'vrnjeno', vrnjeno_ob: new Date().toISOString(), ...(refundId ? { refund_id: refundId } : {}) })
            .eq('payment_intent_id', pi).eq('status', 'placano')
          await oznaciZahtevekVrnjen(admin, pi)
          izid = { vrnjeno: pi }
        }
        break
      }
      case 'account.updated': {
        const acct = event.data.object as Stripe.Account
        await admin.from('organizations').update({
          stripe_charges_enabled: !!acct.charges_enabled,
          stripe_payouts_enabled: !!acct.payouts_enabled,
        }).eq('stripe_account_id', acct.id)
        izid = { racun: acct.id }
        break
      }
    }
  } catch (e: any) {
    console.error('Stripe Connect webhook:', event.type, e)
    return NextResponse.json({ error: e?.message || 'Napaka' }, { status: 500 })
  }

  await admin.from('stripe_connect_dogodki').insert({ event_id: event.id, tip: event.type, account_id: racun ?? null })
  return NextResponse.json({ received: true, izid })
}

/** Dogodek mora priti z racuna, ki je povezan s TO organizacijo. */
async function racunPripada(admin: any, orgId: string | undefined, racun: string | undefined) {
  if (!orgId || !racun) return false
  const { data } = await admin.from('organizations').select('stripe_account_id, stripe_account_livemode').eq('id', orgId).maybeSingle()
  return data?.stripe_account_id === racun && (data?.stripe_account_livemode ?? false) === jeZiviKljuc()
}
