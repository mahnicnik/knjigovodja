import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import {
  stripeZaOrg, referencaIzDogodka, normalizirajPrekoApi, normalizirajIzDogodka,
  jePreskok, obdelajPlacilo, zabeleziNeobdelano, KljucNeDeluje,
} from '@/lib/stripe-placila'

export const maxDuration = 60

/**
 * Stripe Webhook Handler — za uporabnikove lastne Stripe plačila
 *
 * PRELET 326: webhook je zdaj samo SPROZILEC. Vsa logika (kljuc placila,
 * knjiga placil, racun natanko enkrat, vracila -> dobropisi) je v
 * lib/stripe-placila.ts in je ista kot pri nocni uskladitvi.
 *  - S kljucem za branje (Integracije -> Stripe) Racunko placilo prebere
 *    iz Stripe API - neodvisno od API verzije in izbranih dogodkov.
 *  - Brez kljuca se placilo razbere iz vsebine dogodka (kot doslej).
 *
 * Nastavitev v Stripe dashboardu uporabnika:
 * Stripe → Developers → Webhooks → Add endpoint
 * - URL: https://xn--raunko-j2a.si/api/webhooks/stripe?org_id=VAŠ_ORG_ID
 * - Events: checkout.session.completed, invoice.paid, payment_intent.succeeded, charge.refunded
 * - Signing secret: (vnesi v Računko nastavitve → Integracije → Stripe)
 *
 * POMEMBNO: To je webhook za UPORABNIKOV lasten Stripe account (npr. za
 * njegovo aplikacijo ki pobira plačila), NE za Računko subscription Stripe.
 */

const OBRAVNAVANI_DOGODKI = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'invoice.paid',
  'invoice.payment_succeeded',
  'payment_intent.succeeded',
  'charge.succeeded',
  'charge.refunded',
  'charge.refund.updated',
  'refund.created',
  'refund.updated',
  'charge.dispute.created',
  'charge.dispute.closed',
])

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set() {}, remove() {},
      },
    }
  )
}

/**
 * Preveri Stripe webhook podpis (HMAC-SHA256 po Stripe specifikaciji).
 * Stripe pošlje header: t=timestamp,v1=signature[,v1=signature2]
 *
 * PRELET 325:
 *  - sprejmemo KATERIKOLI v1 podpis (med zamenjavo secreta Stripe poslje
 *    dva - prej je veljal samo zadnji, pravilno podpisan dogodek je lahko
 *    padel);
 *  - casovna toleranca 5 minut (kot uradna Stripe knjiznica), da prestrezen
 *    star dogodek ni mogoce poslati znova.
 */
const STRIPE_TOLERANCA_SEK = 300

function verifyStripeSignature(payload: string, sigHeader: string, secret: string): boolean {
  try {
    let timestamp = ''
    const podpisi: string[] = []
    for (const del of sigHeader.split(',')) {
      const i = del.indexOf('=')
      if (i < 0) continue
      const k = del.slice(0, i).trim()
      const v = del.slice(i + 1).trim()
      if (k === 't') timestamp = v
      else if (k === 'v1') podpisi.push(v)
    }
    if (!timestamp || podpisi.length === 0) return false
    const t = Number(timestamp)
    if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > STRIPE_TOLERANCA_SEK) return false

    const signedPayload = `${timestamp}.${payload}`
    const computed = Buffer.from(crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex'))
    return podpisi.some(p => {
      const b = Buffer.from(p)
      return b.length === computed.length && crypto.timingSafeEqual(computed, b)
    })
  } catch {
    return false
  }
}

/**
 * PRELET 320: zapis v integration_logs, ki napake NE pogoltne tiho.
 *
 * Prej so bili VSI zapisi s statusom 'failed'/'skipped' zavrnjeni zaradi
 * omejitve integration_logs_status_check (dovoljevala je samo
 * success/error/pending), napaka pa se je zavrgla z `.then(() => {}, () => {})`.
 * Posledica: od 30.7.2026 ni bil zabelezen NOBEN neuspeh ali preskok - ko
 * racun ni nastal (primer Domen Kocjan, 20.9.2026), v /integracije ni bilo
 * nobene sledi. Omejitev je razsirjena v migraciji 159, tu pa vsak neuspel
 * zapis vsaj izpisemo v streznisko dnevnik, da se tiha izguba ne ponovi.
 */
async function zapisiLog(supabase: any, vrstica: Record<string, any>): Promise<void> {
  try {
    const { error } = await supabase.from('integration_logs').insert({ integration_type: 'stripe', ...vrstica })
    if (error) console.error('Stripe webhook: zapis v integration_logs ni uspel:', error.message, vrstica)
  } catch (e: any) {
    console.error('Stripe webhook: zapis v integration_logs je vrgel napako:', e?.message, vrstica)
  }
}

export async function POST(req: NextRequest) {
  let orgId: string | null = null
  let supabase: any = null
  try {
    supabase = await getSupabase()
    orgId = new URL(req.url).searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id parameter manjka' }, { status: 400 })
    }

    const rawBody = await req.text()
    const signature = req.headers.get('stripe-signature') ?? ''

    const { data: integration } = await supabase
      .from('integrations')
      .select('webhook_secret, settings')
      .eq('org_id', orgId)
      .eq('type', 'stripe')
      .eq('is_active', true)
      .maybeSingle()

    if (!integration) {
      // DODANO (prelet 296): izklopljena integracija se zabelezi.
      await zapisiLog(supabase, { org_id: orgId, status: 'failed', payload: { reason: 'integration_not_active_or_missing' } })
      return NextResponse.json({ error: 'Stripe integracija ni nastavljena' }, { status: 404 })
    }

    // PRELET 325 (VARNOST): brez veljavnega podpisa ni obdelave.
    if (!integration.webhook_secret || !signature) {
      await zapisiLog(supabase, {
        org_id: orgId, status: 'failed',
        payload: { error: !integration.webhook_secret ? 'missing_webhook_secret' : 'missing_signature' },
      })
      return NextResponse.json({ error: 'Manjka podpis ali Signing secret' }, { status: 401 })
    }
    if (!verifyStripeSignature(rawBody, signature, integration.webhook_secret)) {
      await zapisiLog(supabase, { org_id: orgId, status: 'failed', payload: { error: 'invalid_signature' } })
      return NextResponse.json({ error: 'Neveljaven podpis' }, { status: 401 })
    }

    const event = JSON.parse(rawBody)
    const obj = event.data?.object || {}

    if (!OBRAVNAVANI_DOGODKI.has(event.type)) {
      await zapisiLog(supabase, {
        org_id: orgId, external_id: obj.id ?? null, status: 'skipped',
        payload: { reason: 'event_type_not_handled', event_type: event.type, event_id: event.id },
      })
      return NextResponse.json({ message: `Event ${event.type} ignoriran` }, { status: 200 })
    }

    const { data: org } = await supabase.from('organizations').select('*').eq('id', orgId).single()
    if (!org) {
      await zapisiLog(supabase, { org_id: orgId, external_id: obj.id ?? null, status: 'failed', payload: { reason: 'org_not_found', event_type: event.type, event_id: event.id } })
      return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })
    }

    // S kljucem za branje: placilo preberemo iz Stripa; sicer iz dogodka.
    // Pregled 326 (B5): organizacija S kljucem nikoli tiho ne preide na
    // obdelavo iz vsebine dogodka - ce kljuc ne deluje, gre placilo v knjigo
    // kot 'napaka' (vidno v Integracijah in na nadzorni plosci), nocna
    // uskladitev ali "Poskusi znova" ga obdelata, ko je kljuc popravljen.
    const neobdelano = async (razlog: string, sporocilo?: string) => {
      await zabeleziNeobdelano(supabase, orgId!, event, 'napaka', razlog)
      await zapisiLog(supabase, { org_id: orgId, external_id: obj.id ?? null, status: 'failed', payload: { reason: razlog, message: sporocilo, event_type: event.type, event_id: event.id } })
      return NextResponse.json({ message: `Zabeleženo za ponovno obdelavo: ${razlog}` }, { status: 200 })
    }

    let s: { stripe: any; live: boolean } | null
    try {
      s = await stripeZaOrg(supabase, orgId)
    } catch (e: any) {
      if (e instanceof KljucNeDeluje) return neobdelano('kljuc_za_branje_ne_deluje', e.message)
      throw e
    }

    let placilo
    if (s) {
      // Dogodek iz testnega nacina ne sme izdati racuna prek live kljuca (in obratno).
      if (Boolean(event.livemode) !== s.live) {
        await zapisiLog(supabase, { org_id: orgId, external_id: obj.id ?? null, status: 'skipped', payload: { reason: 'nacin_dogodka_ni_enak_kljucu', livemode: event.livemode, event_type: event.type, event_id: event.id } })
        return NextResponse.json({ message: 'Dogodek iz drugega načina (test/live) kot ključ - preskočeno' }, { status: 200 })
      }
      const ref = referencaIzDogodka(event)
      if (!ref || (!ref.paymentIntentId && !ref.stripeInvoiceId && !ref.checkoutSessionId && !ref.chargeId)) {
        await zapisiLog(supabase, { org_id: orgId, external_id: obj.id ?? null, status: 'skipped', payload: { reason: 'dogodek_brez_placila', event_type: event.type, event_id: event.id } })
        return NextResponse.json({ message: 'Dogodek ne zadeva placila' }, { status: 200 })
      }
      try {
        placilo = await normalizirajPrekoApi(s.stripe, ref)
      } catch (e: any) {
        if (e?.statusCode === 401 || e?.statusCode === 403) return neobdelano('kljuc_za_branje_ne_deluje', e?.message)
        // 404: objekt ne obstaja za ta kljuc (kljuc drugega Stripe racuna).
        if (e?.statusCode === 404) return neobdelano('kljuc_drugega_stripe_racuna', e?.message)
        throw e
      }
    } else {
      placilo = normalizirajIzDogodka(event)
    }

    if (jePreskok(placilo)) {
      await zapisiLog(supabase, {
        org_id: orgId, external_id: obj.id ?? null, status: 'skipped',
        payload: { reason: placilo.preskok, event_type: event.type, event_id: event.id, ...(placilo.podrobnosti || {}) },
      })
      return NextResponse.json({ message: `Preskočeno: ${placilo.preskok}` }, { status: 200 })
    }

    const izid = await obdelajPlacilo(supabase, org, placilo, event.type)

    await zapisiLog(supabase, {
      org_id: orgId,
      external_id: placilo.kljuc,
      invoice_id: izid.racunId ?? null,
      status: izid.stanje === 'izdan' ? 'success' : izid.stanje === 'preskoceno' ? 'skipped' : 'failed',
      payload: {
        reason: izid.razlog ?? (izid.novRacun ? undefined : izid.stanje === 'izdan' ? 'invoice_already_exists' : undefined),
        event_type: event.type, event_id: event.id,
        amount_total: placilo.znesekCenti / 100, dobropisov: izid.dobropisov || 0,
      },
    })

    if (izid.ponovi) {
      return NextResponse.json({ error: izid.razlog || 'Obdelava ni uspela - poskusite znova' }, { status: 500 })
    }
    return NextResponse.json({ success: true, stanje: izid.stanje, invoiceId: izid.racunId ?? null, razlog: izid.razlog })

  } catch (e: any) {
    console.error('Stripe integration webhook error:', e)
    if (orgId && supabase) {
      await zapisiLog(supabase, { org_id: orgId, status: 'failed', payload: { error: String(e?.message || e) } })
    }
    // 500 -> Stripe dogodek ponovi; nocna uskladitev ga ujame v vsakem primeru.
    return NextResponse.json({ error: e?.message || 'Napaka' }, { status: 500 })
  }
}
