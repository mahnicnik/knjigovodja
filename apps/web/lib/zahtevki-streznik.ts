/**
 * PRELET 360: strezniski koraki zahtevkov, ki jih uporablja vec poti
 * (portal, javna stran /placaj, cron). Vse prek service role - klicatelj
 * mora pred tem preveriti pravice (portal) ali zeton (javna stran).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { stripeConnect, provizijaCenti } from '@/lib/stripe-connect'
import { obdelajPlacanZahtevek, postavkeZaStripe, konecSessiona, prikazanoStanje } from '@/lib/zahtevki'

/** Poslan zahtevek, ki je potekel pred vec kot uro (zamik: zamujen webhook placila tik pred potekom). */
export async function oznaciPotekle(admin: SupabaseClient, orgId?: string) {
  const meja = new Date(Date.now() - 3600_000).toISOString()
  let q = admin.from('placilni_zahtevki').update({ status: 'potekel' }).eq('status', 'poslan').lt('velja_do', meja)
  if (orgId) q = q.eq('org_id', orgId)
  await q
}

/**
 * Rezerva za webhook: ce zahtevek se caka (ali je placan, a racun se ni
 * izdan), vprasaj Stripe in po potrebi zakljuci. Napake pri Stripe ne
 * podrejo klica - vrne se trenutno stanje.
 */
export async function preveriPriStripe(admin: SupabaseClient, z: any): Promise<void> {
  const nedokoncan = z.status === 'placan' && (!z.invoice_id || !z.racun_poslan_ob) &&
    (!z.izdajanje_od || new Date(z.izdajanje_od).getTime() < Date.now() - 2 * 60_000)
  if (z.status !== 'poslan' && !nedokoncan) return
  if (!z.checkout_session_id) return
  try {
    if (nedokoncan) {
      await obdelajPlacanZahtevek(admin, z.id, { sessionId: z.checkout_session_id, paymentIntentId: z.payment_intent_id })
      return
    }
    const { data: org } = await admin.from('organizations').select('stripe_account_id').eq('id', z.org_id).single()
    if (!org?.stripe_account_id) return
    const sess = await stripeConnect().checkout.sessions.retrieve(z.checkout_session_id, {}, { stripeAccount: org.stripe_account_id })
    if (sess.payment_status === 'paid') {
      const pi = typeof sess.payment_intent === 'string' ? sess.payment_intent : sess.payment_intent?.id || null
      await obdelajPlacanZahtevek(admin, z.id, { sessionId: sess.id, paymentIntentId: pi })
    }
  } catch (e: any) {
    console.warn('Zahtevek - preverba pri Stripe:', z.id, e?.message)
  }
}

export class ZahtevekNeVelja extends Error {}

/**
 * Checkout Session na POVEZANEM racunu (direct charge). Odprt session z
 * dovolj veljavnosti uporabimo znova; sicer starega zapremo in ustvarimo
 * novega. Session velja najvec 24 ur (omejitev Stripe) in ne dlje od zahtevka.
 */
export async function checkoutZaZahtevek(admin: SupabaseClient, z: any, osnova: string): Promise<string> {
  if (prikazanoStanje(z) !== 'poslan') throw new ZahtevekNeVelja(prikazanoStanje(z))
  const { data: org } = await admin.from('organizations').select('id, name, stripe_account_id, stripe_charges_enabled').eq('id', z.org_id).single()
  if (!org?.stripe_account_id || !org.stripe_charges_enabled) throw new Error('Podjetje trenutno ne sprejema plačil s kartico.')
  const stripe = stripeConnect()
  const racun = { stripeAccount: org.stripe_account_id }

  if (z.checkout_session_id) {
    const star = await stripe.checkout.sessions.retrieve(z.checkout_session_id, {}, racun).catch(() => null)
    if (star?.payment_status === 'paid') {
      const pi = typeof star.payment_intent === 'string' ? star.payment_intent : star.payment_intent?.id || null
      await obdelajPlacanZahtevek(admin, z.id, { sessionId: star.id, paymentIntentId: pi })
      throw new ZahtevekNeVelja('placan')
    }
    if (star?.status === 'open' && star.url && star.expires_at * 1000 > Date.now() + 10 * 60_000) return star.url
    if (star?.status === 'open') await stripe.checkout.sessions.expire(star.id, {}, racun).catch(() => null)
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
