/**
 * PRELET 360: strezniski koraki zahtevkov, ki jih uporablja vec poti
 * (portal, javna stran /placaj, cron). Vse prek service role - klicatelj
 * mora pred tem preveriti pravice (portal) ali zeton (javna stran).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { zapriSejo } from '@/lib/pos-stripe'
import { stripeConnect, provizijaCenti, racunUstrezaNacinu, zivoNiDovoljeno, dovoljenaVZivem } from '@/lib/stripe-connect'
import { postavkeZaStripe, konecSessiona, prikazanoStanje, supabaseZahtevki, casPlacilaSessiona } from '@/lib/zahtevki'

/** Poslan zahtevek, ki je potekel pred vec kot uro (zamik: zamujen webhook placila tik pred potekom). */
export async function oznaciPotekle(admin: SupabaseClient, orgId?: string) {
  const meja = new Date(Date.now() - 3600_000).toISOString()
  let q = admin.from('placilni_zahtevki').update({ status: 'potekel' }).eq('status', 'poslan').lt('velja_do', meja)
  if (orgId) q = q.eq('org_id', orgId)
  await q
}

/**
 * PRELET 364 (H1): GET poti (zaslon s QR kodo, vsake 3 s), javna stran
 * "Hvala" in preklic SAMO BEREJO stanje pri Stripe: placan session zabelezijo
 * kot 'placan' (zapis v bazi, brez racuna in BREZ klica FURS). Racun izda in
 * davcno potrdi samo webhook, dnevni cron (z razmikom) ali gumb "Potrdi zdaj".
 * Prej je vsak klic tu sprozil ponovno davcno potrditev - ob neodzivnem FURS
 * je QR zaslon vsake 3 s porabil novo zaporedno stevilko.
 */
export async function preveriPriStripe(admin: SupabaseClient, z: any): Promise<void> {
  if (z.status !== 'poslan' || !z.checkout_session_id) return
  try {
    const { data: org } = await admin.from('organizations').select('stripe_account_id').eq('id', z.org_id).single()
    if (!org?.stripe_account_id) return
    const sess = await stripeConnect().checkout.sessions.retrieve(z.checkout_session_id, {}, { stripeAccount: org.stripe_account_id })
    if (sess.payment_status === 'paid') await zabeleziPlacilo(admin, z.id, sess)
  } catch (e: any) {
    console.warn('Zahtevek - preverba pri Stripe:', z.id, e?.message)
  }
}

/** poslan -> placan iz placanega Stripe sessiona (brez izdaje racuna). */
export async function zabeleziPlacilo(admin: SupabaseClient, zahtevekId: string, sess: any) {
  const pi = typeof sess.payment_intent === 'string' ? sess.payment_intent : sess.payment_intent?.id || null
  await supabaseZahtevki(admin).oznaciPlacan(zahtevekId, { sessionId: sess.id, paymentIntentId: pi, placanoOb: casPlacilaSessiona(sess) })
}

export class ZahtevekNeVelja extends Error {}

/**
 * Checkout Session na POVEZANEM racunu (direct charge). Odprt session z
 * dovolj veljavnosti uporabimo znova; sicer starega zapremo in ustvarimo
 * novega. Session velja najvec 24 ur (omejitev Stripe) in ne dlje od zahtevka.
 */
export async function checkoutZaZahtevek(admin: SupabaseClient, z: any, osnova: string): Promise<string> {
  if (prikazanoStanje(z) !== 'poslan') throw new ZahtevekNeVelja(prikazanoStanje(z))
  const { data: org } = await admin.from('organizations')
    .select('id, name, stripe_account_id, stripe_charges_enabled, stripe_account_livemode, furs_demo_mode, furs_test_mode').eq('id', z.org_id).single()
  if (!org?.stripe_account_id || !org.stripe_charges_enabled || !racunUstrezaNacinu(org.stripe_account_livemode) || zivoNiDovoljeno(org) || !dovoljenaVZivem(org.id)) {
    throw new Error('Podjetje trenutno ne sprejema plačil s kartico.')
  }
  const stripe = stripeConnect()
  const racun = { stripeAccount: org.stripe_account_id }

  if (z.checkout_session_id) {
    const star = await stripe.checkout.sessions.retrieve(z.checkout_session_id, {}, racun).catch(() => null)
    // PRELET 368 (M2): nove seje ne ustvarimo, dokler stara ni POTRJENO
    // zaprta - webhook sprejme samo placilo zadnje seje zahtevka.
    if (!star) throw new Error('Stanja prejšnjega plačila pri Stripe ni bilo mogoče preveriti.')
    if (star.payment_status === 'paid') {
      await zabeleziPlacilo(admin, z.id, star)
      throw new ZahtevekNeVelja('placan')
    }
    if (star.status === 'open' && star.url && star.expires_at * 1000 > Date.now() + 10 * 60_000) return star.url
    if (star.status === 'open') {
      const izid = await zapriSejo(stripe, star.id, org.stripe_account_id)
      if (izid.stanje === 'placano') { await zabeleziPlacilo(admin, z.id, star); throw new ZahtevekNeVelja('placan') }
      if (izid.stanje === 'napaka') throw new Error('Prejšnjega plačila pri Stripe ni bilo mogoče zapreti.')
    }
  }

  const { expiresAt, podaljsajZahtevek } = konecSessiona(z.velja_do)
  if (podaljsajZahtevek) {
    // Session mora veljati vsaj 30 min (Stripe) - zahtevek podaljsamo, da
    // placilo v tem casu ne pride na ze potekel zahtevek.
    await admin.from('placilni_zahtevki').update({ velja_do: new Date(expiresAt * 1000).toISOString() }).eq('id', z.id).eq('status', 'poslan')
  }
  const metadata = { vrsta: 'zahtevek', zahtevek_id: z.id, org_id: z.org_id }
  const centi = Math.round(Number(z.znesek) * 100)
  const provizija = provizijaCenti(centi)
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: postavkeZaStripe(z, org.name),
    expires_at: expiresAt,
    locale: 'sl',
    submit_type: 'pay',
    customer_email: z.stranka_email || undefined,
    client_reference_id: z.id,
    metadata,
    payment_intent_data: {
      metadata,
      description: `Zahtevek ${z.stevilka || ''} — ${z.stranka_ime}`.trim(),
      ...(provizija > 0 ? { application_fee_amount: provizija } : {}),
    },
    success_url: `${osnova}/placaj/${z.zeton}/hvala?s={CHECKOUT_SESSION_ID}`,
    cancel_url: `${osnova}/placaj/${z.zeton}`,
  }, { ...racun, idempotencyKey: `zahtevek-${z.id}-${expiresAt}` })

  await admin.from('placilni_zahtevki').update({ checkout_session_id: session.id }).eq('id', z.id).eq('status', 'poslan')
  return session.url!
}

/** Zahtevek za odgovor portalu (brez zetona v seznamu ni potrebe skrivati - portal ga rabi za QR). */
export function zaPortal(z: any, osnova: string, racun?: any) {
  return {
    id: z.id,
    stevilka: z.stevilka,
    stranka_ime: z.stranka_ime,
    stranka_email: z.stranka_email,
    postavke: z.postavke,
    znesek: Number(z.znesek),
    status: prikazanoStanje(z),
    velja_do: z.velja_do,
    ustvarjeno: z.ustvarjeno,
    poslano_ob: z.poslano_ob,
    opomnik_ob: z.opomnik_ob,
    placano_ob: z.placano_ob,
    vrnjeno_ob: z.vrnjeno_ob,
    racun_poslan_ob: z.racun_poslan_ob,
    napaka: z.napaka,
    url: `${osnova}/placaj/${z.zeton}`,
    racun: racun ? { id: racun.id, invoice_number: racun.invoice_number, eor: racun.eor, zoi: racun.zoi, status: racun.status } : null,
  }
}
