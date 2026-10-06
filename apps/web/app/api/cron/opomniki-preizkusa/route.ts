import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { opomnikZaOrg, besediloOpomnika, type OrgZaOpomnik } from '@/lib/opomniki-preizkusa'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * REVIZIJA PAKETOV (migracija 182): e-postni opomnik lastniku 3 dni pred
 * iztekom preizkusa in na dan izteka. Samo preizkusi NOVIH organizacij
 * (obstojeca_pravila = false). Pred migracijo stolpcev se ni - opravilo
 * takrat ne naredi nicesar.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sb = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://xn--raunko-j2a.si'
  const zdaj = new Date()

  const { data: orgs, error } = await sb.from('organizations')
    .select('id, name, trial_ends_at, stripe_subscription_id, obstojeca_pravila, preizkus_opomnik_3d_ob, preizkus_opomnik_0d_ob')
    .eq('obstojeca_pravila', false)
    .is('stripe_subscription_id', null)
    .not('trial_ends_at', 'is', null)
    .lte('trial_ends_at', new Date(zdaj.getTime() + 3 * 86_400_000).toISOString())
    .gte('trial_ends_at', new Date(zdaj.getTime() - 86_400_000).toISOString())
  if (error) {
    // Najpogosteje: migracija 182 se ni uporabljena.
    return NextResponse.json({ poslano: 0, preskoceno: error.message })
  }

  const rezultati: { org_id: string; vrsta: string; ok: boolean; napaka?: string }[] = []
  for (const o of (orgs || []) as OrgZaOpomnik[]) {
    const vrsta = opomnikZaOrg(o, zdaj)
    if (!vrsta) continue
    try {
      const { data: lastnik } = await sb.from('org_members').select('user_id')
        .eq('org_id', o.id).eq('role', 'owner').order('created_at', { ascending: true }).limit(1)
      const uid = lastnik?.[0]?.user_id
      const email = uid ? (await sb.auth.admin.getUserById(uid)).data.user?.email : null
      if (!email) { rezultati.push({ org_id: o.id, vrsta, ok: false, napaka: 'lastnik brez e-naslova' }); continue }
      const { zadeva, besedilo } = besediloOpomnika(o, vrsta, appUrl)
      // Resend napake vrne (ne vrze) - brez tega bi bil opomnik oznacen kot poslan.
      const { error: napakaPosiljanja } = await resend.emails.send({ from: FROM_EMAIL, to: [email], subject: zadeva, text: besedilo })
      if (napakaPosiljanja) { rezultati.push({ org_id: o.id, vrsta, ok: false, napaka: napakaPosiljanja.message }); continue }
      const stolpec = vrsta === '3d' ? 'preizkus_opomnik_3d_ob' : 'preizkus_opomnik_0d_ob'
      await sb.from('organizations').update({ [stolpec]: zdaj.toISOString() }).eq('id', o.id)
      rezultati.push({ org_id: o.id, vrsta, ok: true })
    } catch (e) {
      rezultati.push({ org_id: o.id, vrsta, ok: false, napaka: e instanceof Error ? e.message : String(e) })
    }
  }
  return NextResponse.json({ poslano: rezultati.filter(r => r.ok).length, rezultati })
}
