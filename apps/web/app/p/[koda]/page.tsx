/**
 * PRELET 357: KRATKA POVEZAVA BLAGAJNE (/p/[koda]).
 *
 * Koda pripada POSLOVALNICI (ne posameznemu plačilu), zato jo lahko natisnemo
 * na NFC nalepko ob blagajni. Povezava preusmeri na trenutno aktivno plačilo
 * te blagajne; QR koda v blagajni doda ?i=<začetek id>, da ob dveh hkratnih
 * plačilih stranka pristane na pravem.
 */
import { redirect } from 'next/navigation'
import { adminSupabase } from '@/lib/stripe-connect'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Plačilo — Računko', robots: { index: false } }

export default async function KratkaPovezava({
  params, searchParams,
}: { params: Promise<{ koda: string }>; searchParams: Promise<{ i?: string }> }) {
  const { koda } = await params
  const { i } = await searchParams
  let cilj: string | null = null
  let podjetje: string | null = null

  if (/^[a-z0-9]{6,16}$/.test(koda)) {
    const admin = adminSupabase()
    const { data: kp } = await admin.from('pos_kratke_povezave').select('business_id, org_id').eq('koda', koda).maybeSingle()
    if (kp) {
      const { data: org } = await admin.from('organizations').select('name').eq('id', kp.org_id).maybeSingle()
      podjetje = org?.name ?? null
      const { data: aktivna } = await admin.from('pos_placila_stripe')
        .select('id, checkout_url, velja_do')
        .eq('business_id', kp.business_id).eq('status', 'cakanje')
        .gt('velja_do', new Date().toISOString())
        .not('checkout_url', 'is', null)
        .order('ustvarjeno', { ascending: false }).limit(10)
      const izbrano = (i && /^[0-9a-f]{8}$/.test(i) && aktivna?.find(a => a.id.startsWith(i))) || aktivna?.[0]
      cilj = izbrano?.checkout_url ?? null
    }
  }

  if (cilj) redirect(cilj)

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#F6F5F1', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 380, width: '100%', background: '#fff', borderRadius: 16, padding: '32px 24px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🧾</div>
        <h1 style={{ fontSize: 20, margin: '0 0 8px', color: '#1A1A1A' }}>Trenutno ni odprtega plačila</h1>
        <p style={{ fontSize: 14, color: '#666', lineHeight: 1.55, margin: 0 }}>
          {podjetje ? <>Pri <strong>{podjetje}</strong> ta trenutek ne čaka nobeno plačilo.</> : 'Ta povezava ta trenutek ne vodi do nobenega plačila.'}
          {' '}Prosite prodajalca, naj na blagajni izbere »Plačaj s Stripe«, nato kodo poslikajte znova.
        </p>
      </div>
    </main>
  )
}
