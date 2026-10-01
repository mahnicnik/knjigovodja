export const dynamic = 'force-dynamic'
/**
 * PRELET 357: povezava podjetja s Stripe Connect (Express).
 *
 * GET  → stanje povezave in pogoji za plačila s kartico (blagajna, portal,
 *        nastavitve). ?osvezi=1 prebere stanje računa iz Stripa.
 * POST { akcija: 'povezi' }    → ustvari Express račun (če ga še ni) in vrne
 *                                 povezavo za vpis podatkov pri Stripe
 *      { akcija: 'nadzorna' }  → enkratna povezava v Stripe nadzorno ploščo
 *      { akcija: 'prekini' }   → prekine povezavo (Računko računa ne uporablja več)
 *
 * Povezava velja za CELO podjetje (organizations) - blagajna in portal jo
 * uporabljata skupaj.
 */
import { NextResponse } from 'next/server'
import { sejaInOrganizacija, jeLastnik } from '@/lib/stripe-connect-seja'
import { adminSupabase, preveriPogoje, stripeConnect, javniUrl, ConnectNiNastavljen, jeTestniKljuc } from '@/lib/stripe-connect'

async function osveziIzStripa(admin: any, orgId: string, accountId: string) {
  const stripe = stripeConnect()
  const acct = await stripe.accounts.retrieve(accountId)
  await admin.from('organizations').update({
    stripe_charges_enabled: !!acct.charges_enabled,
    stripe_payouts_enabled: !!acct.payouts_enabled,
  }).eq('id', orgId)
  return acct
}

export async function GET(req: Request) {
  const s = await sejaInOrganizacija(req)
  if (!s) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
  const admin = adminSupabase()
  const url = new URL(req.url)
  let podrobnosti: any = null
  let napaka: string | null = null
  const { data: org } = await admin.from('organizations')
    .select('stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_povezano_ob')
    .eq('id', s.orgId).maybeSingle()
  if (org?.stripe_account_id && url.searchParams.get('osvezi') === '1') {
    try {
      const acct = await osveziIzStripa(admin, s.orgId, org.stripe_account_id)
      podrobnosti = {
        details_submitted: acct.details_submitted,
        requirements: acct.requirements?.currently_due || [],
        ime: acct.business_profile?.name || acct.settings?.dashboard?.display_name || null,
        email: acct.email || null,
      }
    } catch (e: any) {
      napaka = e instanceof ConnectNiNastavljen ? e.message : 'Stanja pri Stripe ni bilo mogoče prebrati: ' + (e?.message || e)
    }
  }
  const pogoji = await preveriPogoje(admin, s.orgId)
  return NextResponse.json({
    pogoji,
    povezava: {
      accountId: org?.stripe_account_id ?? null,
      chargesEnabled: pogoji.stripeAktiven,
      payoutsEnabled: !!org?.stripe_payouts_enabled,
      povezanoOb: org?.stripe_povezano_ob ?? null,
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
    .select('id, name, email, stripe_account_id')
    .eq('id', s.orgId).single()
  const osnova = javniUrl(req)

  try {
    const stripe = stripeConnect()

    if (akcija === 'povezi') {
      let accountId = org?.stripe_account_id as string | null
      if (!accountId) {
        // "Stripe handles pricing": provizije zaračuna Stripe neposredno
        // povezanemu računu (fees.payer = account), izgube nosi Stripe,
        // uporabnik ima Express nadzorno ploščo. Računko nima stroškov.
        const acct = await stripe.accounts.create({
          country: 'SI',
          email: org?.email || s.user.email || undefined,
          controller: {
            fees: { payer: 'account' },
            losses: { payments: 'stripe' },
            stripe_dashboard: { type: 'express' },
          },
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          business_profile: { name: org?.name || undefined },
          metadata: { org_id: s.orgId, vir: 'racunko' },
        }, { idempotencyKey: `connect-racun-${s.orgId}-${org?.stripe_account_id ?? 'nov'}-${new Date().toISOString().slice(0, 13)}` })
        accountId = acct.id
        const { error } = await admin.from('organizations').update({
          stripe_account_id: accountId,
          stripe_charges_enabled: !!acct.charges_enabled,
          stripe_payouts_enabled: !!acct.payouts_enabled,
          stripe_povezano_ob: new Date().toISOString(),
        }).eq('id', s.orgId)
        if (error) throw new Error('Povezave ni bilo mogoče shraniti: ' + error.message)
      }
      const link = await stripe.accountLinks.create({
        account: accountId,
        type: 'account_onboarding',
        refresh_url: `${osnova}/nastavitve?razdelek=placila&stripe=osvezi`,
        return_url: `${osnova}/nastavitve?razdelek=placila&stripe=vrnjen`,
      })
      return NextResponse.json({ url: link.url })
    }

    if (akcija === 'nadzorna') {
      if (!org?.stripe_account_id) return NextResponse.json({ error: 'Stripe še ni povezan.' }, { status: 400 })
      const login = await stripe.accounts.createLoginLink(org.stripe_account_id)
      return NextResponse.json({ url: login.url })
    }

    if (akcija === 'prekini') {
      // Čakajoča plačila v blagajni prekličemo - po prekinitvi jih ne bi mogli
      // več zaključiti.
      const { data: cakajoca } = await admin.from('pos_placila_stripe')
        .select('id, checkout_session_id').eq('org_id', s.orgId).eq('status', 'cakanje')
      for (const c of cakajoca || []) {
        try { if (c.checkout_session_id && org?.stripe_account_id) await stripe.checkout.sessions.expire(c.checkout_session_id, {}, { stripeAccount: org.stripe_account_id }) } catch {}
        await admin.from('pos_placila_stripe').update({ status: 'preklicano' }).eq('id', c.id).eq('status', 'cakanje')
      }
      const { error } = await admin.from('organizations').update({
        stripe_account_id: null,
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
