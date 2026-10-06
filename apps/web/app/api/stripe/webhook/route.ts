import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { odlociONarocnini, izStripeNarocnine, type CeneStripe } from '@/lib/narocnina-stripe'
import { resend, FROM_EMAIL } from '@/lib/resend'

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
// tudi ce bi placal Pro + POS - glej `getPlanFromPriceId` spodaj.
const PRO_YEARLY_PRICE_ID = process.env.STRIPE_PRO_YEARLY_PRICE_ID || ''
const PRO_POS_YEARLY_PRICE_ID = process.env.STRIPE_PRO_POS_YEARLY_PRICE_ID || ''

/**
 * PAKET IZ CENE (prelet 212)
 * ══════════════════════════
 *
 * NAPAKA, KI JO TO ODPRAVLJA: preverjala se je ENA SAMA cena, vse ostalo pa
 * je tiho pristalo na `pro`. Z uvedbo letnih cen bi to pomenilo, da bi
 * stranka placala LETNI Pro + POS (299,90 EUR) in dobila samo Pro - brez
 * blagajne, brez napake v dnevniku, brez sledi. Opazil bi sele, ko bi
 * poklicala.
 *
 * Zdaj poznamo vse stiri cene. Neznane cene NE ugibamo: vrnemo `null`,
 * klicatelj pa zavrne obdelavo in zapise napako. Bolje je, da placilo
 * ostane neobdelano in to takoj vidimo, kot da nekomu tiho dodelimo
 * napacen paket.
 */
function getPlanFromPriceId(priceId: string | null): 'pro' | 'pro_pos' | null {
  if (!priceId) return null
  if (priceId === PRO_POS_PRICE_ID || priceId === PRO_POS_YEARLY_PRICE_ID) return 'pro_pos'
  if (priceId === PRO_PRICE_ID || priceId === PRO_YEARLY_PRICE_ID) return 'pro'
  console.error(`NEZNANA CENA "${priceId}" - paket NI bil dodeljen. Preverite STRIPE_*_PRICE_ID.`)
  return null
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

  // REVIZIJA PAKETOV (migracija 182) - DODANO pred obstojeco obdelavo:
  // 1. charge.refunded: samo zabelezimo in obvestimo platformo, dostopa ne spreminjamo.
  // 2. Dogodki NOVIH organizacij (obstojeca_pravila = false) gredo skozi novo
  //    obdelavo (lib/narocnina-stripe.ts). Obstojece organizacije in vse, kar
  //    ni mogoce prepoznati, gre skozi NESPREMENJENO obdelavo spodaj.
  if (event.type === 'charge.refunded') {
    await zabeleziVracilo(event.data.object as Stripe.Charge)
    return NextResponse.json({ received: true })
  }
  const novaOrg = await novaOrganizacijaZaDogodek(event)
  if (novaOrg) return obdelajNovoOrganizacijo(event, novaOrg)

  const orgId = (event.data.object as any)?.metadata?.org_id

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (orgId) {
        // Pridobi subscription da dobimo price_id
        let plan: 'pro' | 'pro_pos' | null = null
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string)
          const priceId = sub.items.data[0]?.price?.id || null
          plan = getPlanFromPriceId(priceId)
        }
        // PRELET 212: brez prepoznane cene ne dodelimo nicesar. Vrnemo napako,
        // da Stripe dogodek PONOVI - stranka je placala in mora dobiti dostop,
        // ceprav z zamikom, ko bo nastavitev popravljena.
        if (!plan) {
          console.error(`Placilo brez prepoznane cene za org ${orgId} - paket NI dodeljen.`)
          return NextResponse.json({ error: 'Cena ni prepoznana' }, { status: 500 })
        }
        // POPRAVLJENO (16.8.2026): prej brez preverbe napake. Webhook vrne
        // uspeh, zato Stripe dogodka NE ponovi - uporabnik bi placal narocnino,
        // dostopa pa ne bi dobil, brez sledi o vzroku.
        const { error: upErr } = await sb.from('organizations').update({
          subscription_status: plan,
          stripe_subscription_id: session.subscription as string || null,
        }).eq('id', orgId)
        if (upErr) {
          console.error(`KRITICNO: placilo je uspelo, narocnina (${plan}) za org ${orgId} pa NI bila aktivirana:`, upErr)
          return NextResponse.json({ error: 'Aktivacija naročnine ni uspela' }, { status: 500 })
        }
        console.log(`✅ Checkout complete - plan ${plan}: ${orgId}`)
      }
      break
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const priceId = sub.items.data[0]?.price?.id || null
      const plan = getPlanFromPriceId(priceId)

      // PRELET 212: enako kot zgoraj - neznane cene ne ugibamo.
      if (!plan) {
        console.error(`Narocnina ${sub.id} z neprepoznano ceno "${priceId}" - paket NI spremenjen.`)
        return NextResponse.json({ error: 'Cena ni prepoznana' }, { status: 500 })
      }

      if (orgId) {
        const { error: subErr } = await sb.from('organizations').update({
          subscription_status: plan,
          stripe_subscription_id: sub.id,
          // PRELET 212: placilo konca preizkus. Ce bi `trial_ends_at` ostal,
          // bi nocno opravilo placnika ob izteku vrnilo na brezplacni paket.
          trial_ends_at: null,
          // Stripe je `current_period_end` premaknil na raven postavke naročnine,
          // zato ga v tipu Subscription ni. Beremo obe mesti, da deluje v obeh
          // različicah API-ja.
          plan_expires_at: new Date(
            ((sub as any).current_period_end
              ?? (sub as any).items?.data?.[0]?.current_period_end
              ?? 0) * 1000
          ).toISOString(),
        }).eq('id', orgId)
        if (subErr) {
          console.error(`KRITICNO: podaljsanja narocnine (${plan}) za org ${orgId} NI bilo mogoce zabeleziti:`, subErr)
          return NextResponse.json({ error: 'Posodobitev naročnine ni uspela' }, { status: 500 })
        }
        console.log(`✅ Subscription ${plan}: ${orgId}`)
      }
      break
    }

    case 'customer.subscription.deleted': {
      if (orgId) {
        // POPRAVLJENO (16.8.2026): ce se preklic ne zabelezi, ostane organizacija
        // na placljivem planu, ceprav narocnine ne placuje vec.
        const { error: cancelErr } = await sb.from('organizations').update({
          subscription_status: 'free',
          stripe_subscription_id: null,
          plan_expires_at: null,
        }).eq('id', orgId)
        if (cancelErr) {
          console.error(`KRITICNO: preklica narocnine za org ${orgId} NI bilo mogoce zabeleziti - organizacija ostaja na placljivem planu:`, cancelErr)
          return NextResponse.json({ error: 'Preklic naročnine ni uspel' }, { status: 500 })
        }
        console.log(`⬇️ Subscription cancelled -> free: ${orgId}`)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}


// ═════════════════════════════════════════════════════════════════
// REVIZIJA PAKETOV (migracija 182) - SAMO NOVE ORGANIZACIJE
// ═════════════════════════════════════════════════════════════════

const DOGODKI_NAROCNINE = new Set([
  'checkout.session.completed',
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'customer.subscription.paused', 'customer.subscription.resumed',
])

type NovaOrg = { id: string; stripe_subscription_id: string | null }

/**
 * Organizacija dogodka, a SAMO ce je nova (obstojeca_pravila === false).
 * Brez klica Stripa: metadata.org_id ali stranka iz samega dogodka. Pred
 * migracijo (stolpca ni) ali ob kakrsnikoli napaki vrne null -> obstojeca
 * obdelava, natanko kot doslej.
 */
async function novaOrganizacijaZaDogodek(event: Stripe.Event): Promise<NovaOrg | null> {
  if (!DOGODKI_NAROCNINE.has(event.type)) return null
  try {
    const obj = event.data.object as any
    if (event.type === 'checkout.session.completed' && obj?.mode !== 'subscription') return null
    const metaOrg = obj?.metadata?.org_id || null
    const stranka = typeof obj?.customer === 'string' ? obj.customer : obj?.customer?.id
    let org: any = null
    if (metaOrg) {
      const { data } = await sb.from('organizations').select('*').eq('id', metaOrg).maybeSingle()
      org = data
    } else if (stranka) {
      const { data } = await sb.from('organizations').select('*').eq('stripe_customer_id', stranka).limit(2)
      org = data?.length === 1 ? data[0] : null
    }
    if (!org || org.obstojeca_pravila !== false) return null
    return { id: org.id, stripe_subscription_id: org.stripe_subscription_id ?? null }
  } catch {
    return null
  }
}

/**
 * Nova obdelava: narocnina se prebere SVEZA iz Stripa (vrstni red in
 * podvojeni dogodki ne vplivajo na rezultat), upostevan je `status`
 * (unpaid/canceled/incomplete_expired -> free, past_due ohrani dostop),
 * preklic stare narocnine ne prepise nove.
 */
async function obdelajNovoOrganizacijo(event: Stripe.Event, org: NovaOrg) {
  const obj = event.data.object as any
  const subId = event.type === 'checkout.session.completed'
    ? (typeof obj.subscription === 'string' ? obj.subscription : obj.subscription?.id)
    : obj.id
  if (!subId) return NextResponse.json({ received: true })

  const sub = izStripeNarocnine(await stripe.subscriptions.retrieve(subId))
  const cene: CeneStripe = { pro: [PRO_PRICE_ID, PRO_YEARLY_PRICE_ID], proPos: [PRO_POS_PRICE_ID, PRO_POS_YEARLY_PRICE_ID] }
  const odlocitev = odlociONarocnini(org, sub, cene)

  if (odlocitev.tip === 'napaka') {
    // Stripe dogodek ponovi - stranka je placala in mora dobiti dostop.
    console.error(`KRITICNO: ${odlocitev.razlog} (org ${org.id}) - paket NI dodeljen. Preverite STRIPE_*_PRICE_ID.`)
    return NextResponse.json({ error: 'Cena ni prepoznana' }, { status: 500 })
  }
  if (odlocitev.tip === 'preskoci') {
    console.log(`Stripe ${event.type}: ${odlocitev.razlog} (org ${org.id})`)
    return NextResponse.json({ received: true })
  }
  const { error } = await sb.from('organizations').update(odlocitev.polja).eq('id', org.id)
  if (error) {
    console.error(`KRITICNO: narocnine ${sub.id} (${sub.status}) za org ${org.id} NI bilo mogoce zabeleziti:`, error)
    return NextResponse.json({ error: 'Posodobitev naročnine ni uspela' }, { status: 500 })
  }
  console.log(`Stripe ${event.type}: org ${org.id} -> ${odlocitev.polja.subscription_status} (${sub.status})`)
  return NextResponse.json({ received: true })
}

/**
 * Vracilo placila narocnine: SAMO zapis v dnevnik in e-posta platformi.
 * Dostopa NE spreminjamo - ce je treba, se narocnina preklice v Stripu.
 * Napaka pri posiljanju ne sme vrniti 500 (Stripe bi dogodek ponavljal).
 */
async function zabeleziVracilo(charge: Stripe.Charge) {
  const stranka = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id ?? null
  const znesek = ((charge.amount_refunded || 0) / 100).toFixed(2).replace('.', ',')
  let org: { id: string; name: string | null } | null = null
  try {
    if (stranka) {
      const { data } = await sb.from('organizations').select('id, name').eq('stripe_customer_id', stranka).limit(1)
      org = data?.[0] ?? null
    }
  } catch {}
  console.log(`VRACILO: ${charge.id} ${znesek} ${charge.currency?.toUpperCase()} stranka ${stranka} org ${org?.id ?? '-'}`)
  try {
    const { error: napakaPosiljanja } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [process.env.PLATFORMA_OBVESTILA_EMAIL || 'support@xn--raunko-j2a.si'],
      subject: `Stripe vračilo: ${znesek} € – ${org?.name ?? stranka ?? 'neznana stranka'}`,
      text: [
        `Vrnjeno: ${znesek} ${charge.currency?.toUpperCase()} (plačilo ${charge.id})`,
        `Stripe stranka: ${stranka ?? '-'}`,
        `Organizacija: ${org ? `${org.name} (${org.id})` : 'ni najdena'}`,
        '',
        'Dostop do Računka se NI spremenil. Če je treba, naročnino prekličite v Stripe Dashboardu.',
      ].join('\n'),
    })
    if (napakaPosiljanja) console.error('Obvestila o vracilu ni bilo mogoce poslati:', napakaPosiljanja.message)
  } catch (e: any) {
    console.error('Obvestila o vracilu ni bilo mogoce poslati:', e?.message)
  }
}
