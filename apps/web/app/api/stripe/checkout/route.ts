export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { resolveActiveOrgId, resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia' as any,
})

const adminSupabase = () => createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

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
    // PRELET 212: izbira med mesecno in letno narocnino. Privzeto mesecno,
    // ker je manj tvegana odlocitev za stranko, ki se odloca prvic.
    const letno = body2.period === 'yearly'
    const priceId = targetPlan === 'pro_pos'
      ? (letno ? process.env.STRIPE_PRO_POS_YEARLY_PRICE_ID! : process.env.STRIPE_PRO_POS_PRICE_ID!)
      : (letno ? process.env.STRIPE_PRO_YEARLY_PRICE_ID! : process.env.STRIPE_PRO_PRICE_ID!)
    if (!priceId) {
      console.error(`Manjka cena za ${targetPlan}/${letno ? 'letno' : 'mesecno'}`)
      return NextResponse.json({ error: 'Ta paket trenutno ni na voljo. Poskusite pozneje.' }, { status: 500 })
    }

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
    }

    // Pridobi org preko org_members (ne preko owner_id)
    const member = await resolveActiveOrg(supabase, user.id, getRequestedOrgId(request), 'id, name, stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at') // vec-org podpora (30.7.2026)
    const memberErr = null

    if (memberErr || !member || !(member as any).organizations) {
      console.error('Org lookup error:', memberErr)
      return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })
    }

    const org = (member as any).organizations

    // PRELET 321: prej `subscription_status === 'pro'` -> "Že imate Pro plan".
    // subscription_status pa je 'pro'/'pro_pos' ze MED BREZPLACNIM
    // PREIZKUSOM, ko se ni nic placano - stranka na preizkusu Pro zato Pro
    // sploh ni mogla placati (prelet 319 je gumbe prikazal, ta preverba pa
    // jih je zavrnila). Merodajno je, ali obstaja PLACANA naročnina.
    // Ce obstaja, druge ne odpiramo (bila bi dvojna bremenitev) - menjava
    // paketa gre prek "Upravljaj naročnino" (Stripe portal).
    if (org.stripe_subscription_id) {
      return NextResponse.json({
        error: 'Že imate aktivno plačano naročnino. Paket spremenite v Nastavitve → Naročnina → Upravljaj naročnino.',
      }, { status: 400 })
    }

    async function novaStripeStranka(): Promise<string> {
      const customer = await stripe.customers.create({
        email: user!.email,
        name: org.name,
        metadata: { org_id: org.id, user_id: user!.id },
      })
      // Revizija paketov (migracija 182): stripe_* stolpce sme pisati samo
      // streznik (service role) - uporabnik si jih prek RLS ne more vec
      // spreminjati sam.
      const { error: shraniErr } = await adminSupabase()
        .from('organizations')
        .update({ stripe_customer_id: customer.id })
        .eq('id', org.id)
      if (shraniErr) console.error(`Stripe stranka ${customer.id} ustvarjena, shranitev k org ${org.id} ni uspela:`, shraniErr.message)
      return customer.id
    }

    /**
     * REVIZIJA PAKETOV: nakup MED preizkusom se zaracuna ob izteku preizkusa,
     * ne takoj (prej se je preostanek preizkusa izgubil). Stripe Checkout
     * zahteva trial_end vsaj 48 ur v prihodnosti - ce je do izteka manj, se
     * zaracuna takoj, kot doslej. Organizacije brez trial_ends_at (vse
     * obstojece) dobijo natanko enako sejo kot prej.
     */
    const konecPreizkusa = org.trial_ends_at ? Math.floor(new Date(org.trial_ends_at).getTime() / 1000) : 0
    const trialEnd = konecPreizkusa > Math.floor(Date.now() / 1000) + 48 * 3600 ? konecPreizkusa : null

    function ustvariSejo(customerId: string) {
      return stripe.checkout.sessions.create({
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
          ...(trialEnd ? { trial_end: trialEnd } : {}),
        },
        locale: 'sl',
      })
    }

    // Ustvari ali pridobi Stripe customer
    let customerId: string = org.stripe_customer_id || await novaStripeStranka()

    // PRELET 321: shranjena Stripe stranka lahko v Stripu ne obstaja vec -
    // 25.9.2026 se je izkazalo, da je bil STRIPE_SECRET_KEY vezan na DRUG
    // Stripe racun kot cene; po zamenjavi kljuca so vse prej ustvarjene
    // stranke (cus_...) postale neveljavne in placilo je padlo z "No such
    // customer". Enako se zgodi po prehodu iz testnega v produkcijski nacin.
    // Stranka nima placane narocnine (preverjeno zgoraj), zato je varno
    // ustvariti novo in poskusiti znova - enak vzorec kot api/stripe/portal.
    let session
    try {
      session = await ustvariSejo(customerId)
    } catch (e: any) {
      const neveljavnaStranka = e?.code === 'resource_missing' && e?.param === 'customer'
      if (!neveljavnaStranka) throw e
      console.log(`Neveljavna Stripe stranka ${customerId} za org ${org.id} - ustvarjam novo`)
      customerId = await novaStripeStranka()
      session = await ustvariSejo(customerId)
    }

    return NextResponse.json({ url: session.url })

  } catch (error: any) {
    console.error('Stripe checkout error:', error)
    // PRELET 321: stranki je bilo prikazano surovo angleško sporočilo Stripa
    // ("No such price: ...", "No such customer: ..."). Celotna napaka je v
    // strežniškem dnevniku (Vercel), stranka pa dobi razumljivo sporočilo s
    // kratko kodo, po kateri jo lahko podpora najde.
    const koda = error?.code || error?.type || 'neznano'
    return NextResponse.json({
      error: `Plačila trenutno ni bilo mogoče začeti. Poskusite znova čez nekaj minut ali nam pišite na support@računko.si (koda: ${koda}).`,
    }, { status: 500 })
  }
}