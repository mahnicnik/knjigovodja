export const dynamic = 'force-dynamic'
/**
 * PRELET 360: preklic zahtevka. Odprt Stripe session se zapre (expire),
 * zahtevek dobi stanje 'preklican' in povezava /placaj/[zeton] ne sprejema
 * vec placil. Ce je stranka medtem ze placala, preklic NI mogoc - racun se izda.
 */
import { NextResponse } from 'next/server'
import { sejaInOrganizacija } from '@/lib/stripe-connect-seja'
import { adminSupabase, stripeConnect, javniUrl } from '@/lib/stripe-connect'
import { BREZ_PRAVIC, obdelajPlacanZahtevek } from '@/lib/zahtevki'
import { zaPortal } from '@/lib/zahtevki-streznik'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await sejaInOrganizacija(req)
  if (!s) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
  if (BREZ_PRAVIC.includes(s.role)) return NextResponse.json({ error: 'Vaša vloga tega ne dovoli.' }, { status: 403 })
  const admin = adminSupabase()
  const { data: z } = await admin.from('placilni_zahtevki').select('*').eq('id', id).eq('org_id', s.orgId).maybeSingle()
  if (!z) return NextResponse.json({ error: 'Zahtevek ni najden' }, { status: 404 })
  if (z.status !== 'poslan') return NextResponse.json({ zahtevek: zaPortal(z, javniUrl(req)) })

  if (z.checkout_session_id) {
    const { data: org } = await admin.from('organizations').select('stripe_account_id').eq('id', z.org_id).single()
    if (org?.stripe_account_id) {
      const stripe = stripeConnect()
      const racun = { stripeAccount: org.stripe_account_id }
      const sess = await stripe.checkout.sessions.retrieve(z.checkout_session_id, {}, racun).catch(() => null)
      if (sess?.payment_status === 'paid') {
        const pi = typeof sess.payment_intent === 'string' ? sess.payment_intent : sess.payment_intent?.id || null
        await obdelajPlacanZahtevek(admin, z.id, { sessionId: sess.id, paymentIntentId: pi })
        return NextResponse.json({ error: 'Stranka je že plačala — preklic ni mogoč, račun je izdan.' }, { status: 409 })
      }
      if (sess?.status === 'open') {
        try {
          await stripe.checkout.sessions.expire(sess.id, {}, racun)
        } catch (e: any) {
          const znova = await stripe.checkout.sessions.retrieve(sess.id, {}, racun).catch(() => null)
          if (znova?.payment_status === 'paid') {
            const pi = typeof znova.payment_intent === 'string' ? znova.payment_intent : znova.payment_intent?.id || null
            await obdelajPlacanZahtevek(admin, z.id, { sessionId: znova.id, paymentIntentId: pi })
            return NextResponse.json({ error: 'Stranka je že plačala — preklic ni mogoč, račun je izdan.' }, { status: 409 })
          }
          if (znova?.status !== 'expired') return NextResponse.json({ error: 'Preklic pri Stripe ni uspel: ' + (e?.message || e) }, { status: 502 })
        }
      }
    }
  }
  await admin.from('placilni_zahtevki').update({ status: 'preklican' }).eq('id', id).eq('status', 'poslan')
  const { data: sveza } = await admin.from('placilni_zahtevki').select('*').eq('id', id).single()
  return NextResponse.json({ zahtevek: zaPortal(sveza, javniUrl(req)) })
}
