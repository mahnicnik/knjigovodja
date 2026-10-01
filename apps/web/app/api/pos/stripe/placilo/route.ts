export const dynamic = 'force-dynamic'
/**
 * PRELET 357: PLACILO V BLAGAJNI PREK QR KODE (Stripe Checkout).
 *
 * POST { order_id, premise_id? }
 *   Znesek izracuna STREZNIK iz vrstic narocila (brskalnik zneska ne poslje).
 *   Ustvari Checkout Session na povezanem racunu (direct charge), potek po
 *   30 minutah. Na odprt racun najvec EN aktiven session (enolicni indeks v
 *   bazi + ponovna uporaba obstojecega, ce se znesek ni spremenil).
 *
 * GET ?id=...
 *   Stanje placila za blagajno (rezerva za Realtime). Ce se caka, preveri se
 *   pri Stripe - tako se racun zakljuci tudi, ce webhook zamudi ali ne pride.
 */
import { NextResponse } from 'next/server'
import { sejaInOrganizacija } from '@/lib/stripe-connect-seja'
import {
  adminSupabase, preveriPogoje, stripeConnect, javniUrl, ConnectNiNastavljen,
  izracunajZnesekNarocila, postavkeZaCheckout, provizijaCenti, novaKratkaKoda, NAJMANJ_CENTI,
} from '@/lib/stripe-connect'
import { supabaseShramba, zakljuciPosPlacilo } from '@/lib/pos-stripe'

export const maxDuration = 60

async function kratkaKoda(admin: any, businessId: string, orgId: string): Promise<string> {
  const { data } = await admin.from('pos_kratke_povezave').select('koda').eq('business_id', businessId).maybeSingle()
  if (data?.koda) return data.koda
  for (let i = 0; i < 5; i++) {
    const koda = novaKratkaKoda()
    const { error } = await admin.from('pos_kratke_povezave').insert({ koda, business_id: businessId, org_id: orgId })
    if (!error) return koda
    const { data: d2 } = await admin.from('pos_kratke_povezave').select('koda').eq('business_id', businessId).maybeSingle()
    if (d2?.koda) return d2.koda
  }
  throw new Error('Kratke povezave ni bilo mogoče ustvariti.')
}

function odgovor(p: any, koda: string | null, osnova: string) {
  return {
    id: p.id,
    status: p.status,
    znesekCenti: p.znesek_centi,
    veljaDo: p.velja_do,
    url: koda ? `${osnova}/p/${koda}?i=${String(p.id).slice(0, 8)}` : p.checkout_url,
    zakljuceno: !!p.zakljuceno_ob,
    rezultat: p.rezultat ?? null,
    napaka: p.napaka ?? null,
  }
}

export async function POST(req: Request) {
  const s = await sejaInOrganizacija(req)
  if (!s) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const orderId = String(body.order_id || '')
  if (!orderId) return NextResponse.json({ error: 'order_id je obvezen' }, { status: 400 })
  const admin = adminSupabase()
  const osnova = javniUrl(req)

  const pogoji = await preveriPogoje(admin, s.orgId)
  if (!pogoji.nastavljeno) return NextResponse.json({ error: 'Plačila s kartico (Stripe) na strežniku niso nastavljena.' }, { status: 503 })
  if (!pogoji.paketPos) return NextResponse.json({ error: 'Plačilo s Stripe v blagajni je na voljo v paketu Pro + POS.' }, { status: 403 })
  if (!pogoji.stripeAktiven) return NextResponse.json({ error: 'Stripe ni povezan ali še ne sprejema plačil (Nastavitve → Plačila s kartico).' }, { status: 400 })
  if (!pogoji.fursOk) return NextResponse.json({ error: pogoji.fursRazlog || 'Davčno potrjevanje ni nastavljeno.' }, { status: 400 })

  const { data: org } = await admin.from('organizations').select('id, name, pos_business_id, stripe_account_id').eq('id', s.orgId).single()

  // Narocilo prek UPORABNIKOVE seje (RLS) - tuje narocilo ni vidno.
  const { data: order } = await s.supabase.from('orders')
    .select('id, business_id, number, status, total, discount_pct, discount_fixed, tip_amount, order_lines(name, qty, unit_price, mods, voided)')
    .eq('id', orderId).maybeSingle()
  if (!order || order.business_id !== org.pos_business_id) return NextResponse.json({ error: 'Račun ni najden.' }, { status: 404 })
  if (order.status !== 'open') return NextResponse.json({ error: 'Račun ni več odprt.' }, { status: 409 })

  const izracun = izracunajZnesekNarocila(order, order.order_lines || [])
  if (izracun.centi < NAJMANJ_CENTI) return NextResponse.json({ error: 'Najmanjši znesek za plačilo s kartico je 0,50 €.' }, { status: 400 })
  if (Math.abs(izracun.skupaj - Number(order.total)) > 0.01) {
    return NextResponse.json({ error: `Znesek postavk (${izracun.skupaj.toFixed(2)} €) se ne ujema z zneskom računa (${Number(order.total).toFixed(2)} €). Osvežite blagajno in poskusite znova.` }, { status: 409 })
  }

  const koda = await kratkaKoda(admin, order.business_id, s.orgId)

  // En aktiven session na racun: obstojecega z ISTIM zneskom uporabimo znova,
  // drugacnega (spremenjen racun) prekinemo in ustvarimo novega.
  const stripe = stripeConnect()
  const { data: obstojece } = await admin.from('pos_placila_stripe').select('*').eq('order_id', orderId).eq('status', 'cakanje').maybeSingle()
  if (obstojece) {
    const veljaven = obstojece.velja_do && new Date(obstojece.velja_do).getTime() > Date.now() + 60_000
    if (veljaven && obstojece.znesek_centi === izracun.centi && obstojece.checkout_session_id) {
      return NextResponse.json(odgovor(obstojece, koda, osnova))
    }
    try {
      if (obstojece.checkout_session_id) await stripe.checkout.sessions.expire(obstojece.checkout_session_id, {}, { stripeAccount: org.stripe_account_id })
    } catch (e: any) {
      // Ce je medtem ze placano, ga ne smemo prepisati - zakljucimo ga.
      const sess = obstojece.checkout_session_id ? await stripe.checkout.sessions.retrieve(obstojece.checkout_session_id, {}, { stripeAccount: org.stripe_account_id }).catch(() => null) : null
      if (sess?.payment_status === 'paid') {
        await zakljuciPosPlacilo(supabaseShramba(admin), obstojece.id, String(sess.payment_intent || '') || null)
        return NextResponse.json({ error: 'Račun je že plačan.' }, { status: 409 })
      }
    }
    await admin.from('pos_placila_stripe').update({ status: 'preklicano' }).eq('id', obstojece.id).eq('status', 'cakanje')
  }

  const poteceOb = Math.floor(Date.now() / 1000) + 30 * 60 + 30
  const { data: vrstica, error: insErr } = await admin.from('pos_placila_stripe').insert({
    business_id: order.business_id,
    org_id: s.orgId,
    staff_id: body.staff_id || null,
    order_id: orderId,
    premise_id: body.premise_id || null,
    znesek_centi: izracun.centi,
    valuta: 'eur',
    velja_do: new Date(poteceOb * 1000).toISOString(),
  }).select('*').single()
  if (insErr || !vrstica) {
    return NextResponse.json({ error: 'Za ta račun plačilo že poteka.' }, { status: 409 })
  }

  try {
    const metadata = {
      vrsta: 'pos',
      placilo_id: vrstica.id,
      org_id: s.orgId,
      business_id: order.business_id,
      order_id: orderId,
    }
    const provizija = provizijaCenti(izracun.centi)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: postavkeZaCheckout(izracun, `${org.name || 'Račun'} — račun ${order.number ?? ''}`.trim()),
      expires_at: poteceOb,
      locale: 'sl',
      submit_type: 'pay',
      client_reference_id: vrstica.id,
      metadata,
      payment_intent_data: {
        metadata,
        description: `Blagajna — račun ${order.number ?? ''}`.trim(),
        ...(provizija > 0 ? { application_fee_amount: provizija } : {}),
      },
      success_url: `${osnova}/p/${koda}/hvala?s={CHECKOUT_SESSION_ID}`,
      cancel_url: `${osnova}/p/${koda}`,
    }, { stripeAccount: org.stripe_account_id, idempotencyKey: `pos-placilo-${vrstica.id}` })

    const { data: posodobljena } = await admin.from('pos_placila_stripe')
      .update({ checkout_session_id: session.id, checkout_url: session.url })
      .eq('id', vrstica.id).select('*').single()
    return NextResponse.json(odgovor(posodobljena, koda, osnova))
  } catch (e: any) {
    await admin.from('pos_placila_stripe').update({ status: 'preklicano', napaka: e?.message || 'Stripe napaka' }).eq('id', vrstica.id)
    const status = e instanceof ConnectNiNastavljen ? 503 : 502
    return NextResponse.json({ error: 'Plačila pri Stripe ni bilo mogoče pripraviti: ' + (e?.message || e) }, { status })
  }
}

export async function GET(req: Request) {
  const s = await sejaInOrganizacija(req)
  if (!s) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id je obvezen' }, { status: 400 })
  const admin = adminSupabase()
  // Vidnost prek uporabnikove seje (RLS po business_id).
  const { data: vidna } = await s.supabase.from('pos_placila_stripe').select('id').eq('id', id).maybeSingle()
  if (!vidna) return NextResponse.json({ error: 'Plačilo ni najdeno' }, { status: 404 })
  let { data: p } = await admin.from('pos_placila_stripe').select('*').eq('id', id).single()

  // Rezerva za webhook: vprasaj Stripe, ce se caka (ali je placano, a
  // zakljucek se ni koncan).
  if (p.status === 'cakanje' || (p.status === 'placano' && !p.zakljuceno_ob)) {
    try {
      const { data: org } = await admin.from('organizations').select('stripe_account_id').eq('id', p.org_id).single()
      if (p.checkout_session_id && org?.stripe_account_id) {
        const stripe = stripeConnect()
        const sess = await stripe.checkout.sessions.retrieve(p.checkout_session_id, {}, { stripeAccount: org.stripe_account_id })
        if (sess.payment_status === 'paid') {
          await zakljuciPosPlacilo(supabaseShramba(admin), p.id, String(sess.payment_intent || '') || null)
        } else if (sess.status === 'expired') {
          await admin.from('pos_placila_stripe').update({ status: 'poteklo' }).eq('id', p.id).eq('status', 'cakanje')
        }
        const { data: sveza } = await admin.from('pos_placila_stripe').select('*').eq('id', id).single()
        p = sveza
      }
    } catch (e) {
      console.warn('Stripe stanje placila:', (e as any)?.message)
    }
  }
  const { data: kp } = await admin.from('pos_kratke_povezave').select('koda').eq('business_id', p.business_id).maybeSingle()
  return NextResponse.json(odgovor(p, kp?.koda ?? null, javniUrl(req)))
}
