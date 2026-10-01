export const dynamic = 'force-dynamic'
/**
 * PRELET 357: povezava podjetja s Stripe Connect (od preleta 360 račun s polno
 * Stripe nadzorno ploščo - provizije plača podjetje neposredno Stripu).
 *
 * GET  → stanje povezave in pogoji za plačila s kartico (blagajna, portal,
 *        nastavitve). ?osvezi=1 prebere stanje računa iz Stripa.
 * POST { akcija: 'povezi' }    → ustvari Stripe račun (če ga še ni) in vrne
 *                                 povezavo za vpis podatkov pri Stripe
 *      { akcija: 'nadzorna' }  → povezava na Stripe nadzorno ploščo
 *      { akcija: 'prekini' }   → prekine povezavo (Računko računa ne uporablja več)
 *
 * Povezava velja za CELO podjetje (organizations) - blagajna in portal jo
 * uporabljata skupaj.
 */
import { NextResponse } from 'next/server'
import { sejaInOrganizacija, jeLastnik } from '@/lib/stripe-connect-seja'
import { supabaseShramba, zakljuciPosPlacilo, zapriSejo } from '@/lib/pos-stripe'
import { adminSupabase, preveriPogoje, stripeConnect, javniUrl, ConnectNiNastavljen, jeTestniKljuc, jeZiviKljuc, racunUstrezaNacinu } from '@/lib/stripe-connect'

/** PRELET 361: stanje računa Accounts v2 (configuration.merchant). */
function stanjeV2(acct: any) {
  const m = acct?.configuration?.merchant
  const vnosi: any[] = acct?.requirements?.entries || []
  const odUporabnika = vnosi.filter(e => e?.awaiting_action_from === 'user')
  return {
    chargesEnabled: m?.capabilities?.card_payments?.status === 'active',
    payoutsEnabled: m?.capabilities?.stripe_balance?.payouts?.status === 'active',
    detailsSubmitted: odUporabnika.length === 0,
    requirements: odUporabnika.map(e => String(e?.description || '')).filter(Boolean),
    ime: acct?.display_name || null,
    email: acct?.contact_email || null,
  }
}

async function osveziIzStripa(admin: any, orgId: string, accountId: string) {
  const stripe = stripeConnect()
  const acct = await stripe.v2.core.accounts.retrieve(accountId, { include: ['configuration.merchant', 'requirements'] } as any)
  const st = stanjeV2(acct)
  await admin.from('organizations').update({
    stripe_charges_enabled: st.chargesEnabled,
    stripe_payouts_enabled: st.payoutsEnabled,
  }).eq('id', orgId)
  return st
}

export async function GET(req: Request) {
  const s = await sejaInOrganizacija(req)
  if (!s) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
  const admin = adminSupabase()
  const url = new URL(req.url)
  let podrobnosti: any = null
  let napaka: string | null = null
  const { data: org } = await admin.from('organizations')
    .select('stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_povezano_ob, stripe_account_livemode')
    .eq('id', s.orgId).maybeSingle()
  // PRELET 363: racun iz drugega nacina (testni po prehodu na zivo) ne velja.
  const veljaven = !!org?.stripe_account_id && racunUstrezaNacinu(org?.stripe_account_livemode)
  if (veljaven && url.searchParams.get('osvezi') === '1') {
    try {
      const st = await osveziIzStripa(admin, s.orgId, org.stripe_account_id)
      podrobnosti = {
        details_submitted: st.detailsSubmitted,
        requirements: st.requirements,
        ime: st.ime,
        email: st.email,
      }
    } catch (e: any) {
      napaka = e instanceof ConnectNiNastavljen ? e.message : 'Stanja pri Stripe ni bilo mogoče prebrati: ' + (e?.message || e)
    }
  }
  const pogoji = await preveriPogoje(admin, s.orgId)
  return NextResponse.json({
    pogoji,
    povezava: {
      accountId: veljaven ? org!.stripe_account_id : null,
      chargesEnabled: pogoji.stripeAktiven,
      payoutsEnabled: veljaven && !!org?.stripe_payouts_enabled,
      povezanoOb: veljaven ? org?.stripe_povezano_ob ?? null : null,
      podrobnosti,
      testni: jeTestniKljuc(),
    },
    lahkoUreja: jeLastnik(s.role),
    napaka,
  })
}

export async function POST(req: Request) {
  const s = await sejaInOrganizacija(req)
  if (!s) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
  if (!jeLastnik(s.role)) return NextResponse.json({ error: 'Povezavo s Stripe lahko ureja samo lastnik podjetja.' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const akcija = String(body.akcija || '')
  const admin = adminSupabase()
  const { data: org } = await admin.from('organizations')
    .select('id, name, email, stripe_account_id, stripe_account_livemode')
    .eq('id', s.orgId).single()
  // PRELET 363: racun iz drugega nacina se ne uporablja - ob povezavi nastane nov.
  if (org?.stripe_account_id && !racunUstrezaNacinu(org.stripe_account_livemode)) org.stripe_account_id = null
  const osnova = javniUrl(req)

  try {
    const stripe = stripeConnect()

    if (akcija === 'povezi') {
      let accountId = org?.stripe_account_id as string | null
      if (!accountId) {
        // PRELET 361: Stripe novim Connect platformam ne dovoli več ustvarjanja
        // računov prek Accounts v1 ("Create connected accounts with POST
        // /v2/core/accounts instead"). Zato Accounts v2:
        //  - configuration.merchant: podjetje je prodajalec (direct charges),
        //  - fees_collector = stripe: provizije Stripe zaračuna podjetju,
        //  - losses_collector = stripe: izgube nosi Stripe,
        //  - dashboard = full: polna Stripe nadzorna plošča.
        // Računko tako nima stroškov ne tveganja ("Stripe handles pricing").
        // Račun v2 ima običajen acct_ ID, ki deluje z Checkout Sessions
        // (Stripe-Account), vračili in webhooki kot prej.
        const email = org?.email || s.user.email || undefined
        if (!email) throw new Error('Za povezavo s Stripe potrebujemo e-poštni naslov podjetja (Nastavitve → Podjetje).')
        const acct = await stripe.v2.core.accounts.create({
          contact_email: email,
          display_name: org?.name || undefined,
          dashboard: 'full',
          identity: { country: 'si' },
          configuration: {
            merchant: { capabilities: { card_payments: { requested: true } } },
          },
          defaults: {
            currency: 'eur',
            locales: ['sl-SI'],
            responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' },
          },
          metadata: { org_id: s.orgId, vir: 'racunko' },
          include: ['configuration.merchant'],
        } as any, { idempotencyKey: `connect-v2-racun-${s.orgId}-${new Date().toISOString().slice(0, 13)}` })
        accountId = acct.id
        const st = stanjeV2(acct)
        const { error } = await admin.from('organizations').update({
          stripe_account_id: accountId,
          stripe_account_livemode: jeZiviKljuc(),
          stripe_charges_enabled: st.chargesEnabled,
          stripe_payouts_enabled: st.payoutsEnabled,
          stripe_povezano_ob: new Date().toISOString(),
        }).eq('id', s.orgId)
        if (error) throw new Error('Povezave ni bilo mogoče shraniti: ' + error.message)
      }
      const link = await stripe.v2.core.accountLinks.create({
        account: accountId,
        use_case: {
          type: 'account_onboarding',
          account_onboarding: {
            configurations: ['merchant'],
            refresh_url: `${osnova}/nastavitve?razdelek=placila&stripe=osvezi`,
            return_url: `${osnova}/nastavitve?razdelek=placila&stripe=vrnjen`,
          },
        },
      } as any)
      return NextResponse.json({ url: link.url })
    }

    if (akcija === 'nadzorna') {
      if (!org?.stripe_account_id) return NextResponse.json({ error: 'Stripe še ni povezan.' }, { status: 400 })
      // PRELET 360: računi s polno nadzorno ploščo nimajo enkratnih povezav
      // (login link je samo za Express) - uporabnik se prijavi v Stripe sam.
      return NextResponse.json({ url: 'https://dashboard.stripe.com/' })
    }

    if (akcija === 'prekini') {
      // Čakajoča plačila v blagajni prekličemo - po prekinitvi jih ne bi mogli
      // več zaključiti.
      const { data: cakajoca } = await admin.from('pos_placila_stripe')
        .select('id, checkout_session_id').eq('org_id', s.orgId).eq('status', 'cakanje')
      // PRELET 366 (H3b): preklicano SELE, ko Stripe potrdi zaprtje seje. Ce
      // je stranka ze placala, se placilo zakljuci; ce stanja ni mogoce
      // potrditi, povezave NE prekinemo (placilo bi ostalo brez racuna).
      const nepotrjene: string[] = []
      for (const c of cakajoca || []) {
        const izid = org?.stripe_account_id ? await zapriSejo(stripe, c.checkout_session_id, org.stripe_account_id) : { stanje: 'zaprta' as const }
        if (izid.stanje === 'placano') { await zakljuciPosPlacilo(supabaseShramba(admin), c.id, izid.paymentIntentId); continue }
        if (izid.stanje === 'napaka') { nepotrjene.push(c.id); continue }
        await admin.from('pos_placila_stripe').update({ status: 'preklicano' }).eq('id', c.id).eq('status', 'cakanje')
      }
      // Odprte seje zahtevkov za placilo zapremo enako.
      const { data: zahtevki } = await admin.from('placilni_zahtevki')
        .select('id, checkout_session_id').eq('org_id', s.orgId).eq('status', 'poslan').not('checkout_session_id', 'is', null)
      for (const z of zahtevki || []) {
        if (!org?.stripe_account_id) break
        const izid = await zapriSejo(stripe, z.checkout_session_id, org.stripe_account_id)
        if (izid.stanje === 'napaka') nepotrjene.push(z.id)
      }
      if (nepotrjene.length > 0) {
        return NextResponse.json({ error: `${nepotrjene.length} odprtih plačil pri Stripe ni bilo mogoče zapreti — povezave nismo prekinili. Poskusite znova čez minuto.` }, { status: 502 })
      }
      const { error } = await admin.from('organizations').update({
        stripe_account_id: null,
        stripe_account_livemode: null,
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        stripe_povezano_ob: null,
      }).eq('id', s.orgId)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Neznana akcija' }, { status: 400 })
  } catch (e: any) {
    const status = e instanceof ConnectNiNastavljen ? 503 : 500
    return NextResponse.json({ error: e?.message || 'Napaka pri povezavi s Stripe' }, { status })
  }
}
