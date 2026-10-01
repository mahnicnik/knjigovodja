import { NextRequest, NextResponse } from 'next/server'
import { adminSupabase } from '@/lib/stripe-connect'
import { supabaseShramba, zakljuciPosPlacilo, zaDokoncanje } from '@/lib/pos-stripe'

export const maxDuration = 120

/**
 * PRELET 370 (M1): placila v blagajni, ki so placana pri Stripe, a niso
 * zakljucena (webhook je padel, streznik prekinjen ...). Klice cron/daily.
 * Zakljucek je idempotenten (zakljuciPosPlacilo) - ali zakljuci racun ali,
 * ce racuna ni mogoce zakljuciti, denar vrne.
 */
export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const admin = adminSupabase()
  const { data } = await admin.from('pos_placila_stripe')
    .select('id, status, zakljuceno_ob, zakljucevanje_od, payment_intent_id')
    .eq('status', 'placano').is('zakljuceno_ob', null)
    .order('placano_ob', { ascending: true }).limit(50)
  const izidi: any[] = []
  const zacetek = Date.now()
  for (const v of zaDokoncanje(data || [])) {
    if (Date.now() - zacetek > 90_000) break
    try {
      const r = await zakljuciPosPlacilo(supabaseShramba(admin), v.id, v.payment_intent_id)
      izidi.push({ id: v.id, stanje: r.stanje, napaka: (r as any).napaka ?? null })
    } catch (e: any) {
      izidi.push({ id: v.id, stanje: 'napaka', napaka: e?.message })
    }
  }
  return NextResponse.json({ obdelanih: izidi.length, izidi })
}
