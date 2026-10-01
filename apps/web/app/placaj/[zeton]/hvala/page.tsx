/**
 * PRELET 360: stran po placilu zahtevka (Stripe success_url). Hkrati je
 * rezerva za webhook: ce racun se ni izdan, preveri session pri Stripe in
 * zahtevek zakljuci (idempotentno).
 */
import { adminSupabase } from '@/lib/stripe-connect'
import { jeVeljavenZeton } from '@/lib/zahtevki'
import { preveriPriStripe } from '@/lib/zahtevki-streznik'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const metadata = { title: 'Hvala — Računko', robots: { index: false } }

export default async function Hvala({ params }: { params: Promise<{ zeton: string }> }) {
  const { zeton } = await params
  let email: string | null = null
  let podjetje: string | null = null
  if (jeVeljavenZeton(zeton)) {
    const admin = adminSupabase()
    const { data: z } = await admin.from('placilni_zahtevki').select('*').eq('zeton', zeton).maybeSingle()
    if (z) {
      email = z.stranka_email
      await preveriPriStripe(admin, z)
      const { data: org } = await admin.from('organizations').select('name').eq('id', z.org_id).maybeSingle()
      podjetje = org?.name ?? null
    }
  }
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#F6F5F1', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div data-testid="placaj-hvala" style={{ maxWidth: 400, width: '100%', background: '#fff', borderRadius: 16, padding: '32px 24px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <h1 style={{ fontSize: 20, margin: '0 0 8px', color: '#1F6B3A' }}>Hvala — račun vam pošljemo po e-pošti</h1>
        <p style={{ fontSize: 14, color: '#666', lineHeight: 1.55, margin: 0 }}>
          Plačilo je uspelo. Davčno potrjen račun prejmete{email ? <> na <strong>{email}</strong></> : ' po e-pošti'} v nekaj minutah.
        </p>
        {podjetje && <p style={{ fontSize: 12, color: '#999', marginTop: 18 }}>{podjetje}</p>}
      </div>
    </main>
  )
}
