export const dynamic = 'force-dynamic'
/**
 * PRELET 382 - ZACASNA diagnostika Stripe Connect (samo branje).
 * Zascitena z enkratnim zetonom (v kodi je le njegov SHA-256). Ne vraca
 * kljucev, samo ID-je, zastavice, zahteve in sporocila napak Stripa.
 * ODSTRANI po razresitvi povezave ŠIRM.
 */
import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { stripeConnect } from '@/lib/stripe-connect'

const HASH = '81177c4d9b8b804ce238fe76925cb3ba0f386c7b064438a6109a5fdfcdabb7c3'

function napaka(e: any) {
  return {
    type: e?.type, code: e?.code, statusCode: e?.statusCode, message: e?.message,
    requestId: e?.requestId || e?.headers?.['request-id'], raw: e?.raw,
  }
}

async function poskusi(fn: () => Promise<any>) {
  try { return { ok: true, rezultat: await fn() } } catch (e: any) { return { ok: false, napaka: napaka(e) } }
}

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get('t') || ''
  const h = createHash('sha256').update(t).digest()
  if (!timingSafeEqual(h, Buffer.from(HASH, 'hex'))) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const stripe = stripeConnect()
  const v1 = await poskusi(async () => {
    const a: any = await stripe.accounts.retrieveCurrent()
    return {
      id: a.id, country: a.country, type: a.type, business_type: a.business_type, created: a.created,
      charges_enabled: a.charges_enabled, payouts_enabled: a.payouts_enabled, details_submitted: a.details_submitted,
      controller: a.controller, dashboard: a.settings?.dashboard, capabilities: a.capabilities,
      requirements: a.requirements, future_requirements: a.future_requirements,
      email_set: !!a.email, mcc: a.business_profile?.mcc, url: a.business_profile?.url,
    }
  })
  const platformId = (v1 as any)?.rezultat?.id
  const v2seznam = await poskusi(async () => {
    const r: any = await stripe.v2.core.accounts.list({ limit: 5 } as any)
    return (r?.data || []).map((x: any) => ({ id: x.id, created: x.created, livemode: x.livemode, dashboard: x.dashboard }))
  })
  const v2platforma = platformId ? await poskusi(async () => {
    const r: any = await stripe.v2.core.accounts.retrieve(platformId, { include: ['requirements', 'identity', 'configuration.merchant', 'configuration.customer', 'defaults'] } as any)
    return { id: r.id, dashboard: r.dashboard, applied_configurations: r.applied_configurations, requirements: r.requirements, merchant: r.configuration?.merchant, defaults: r.defaults }
  }) : null
  const v1seznam = await poskusi(async () => {
    const r: any = await stripe.accounts.list({ limit: 5 })
    return (r?.data || []).map((x: any) => ({ id: x.id, type: x.type, created: x.created, charges_enabled: x.charges_enabled }))
  })
  return NextResponse.json({ cas: new Date().toISOString(), v1, v2seznam, v2platforma, v1seznam })
}
