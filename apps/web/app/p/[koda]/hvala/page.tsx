/** PRELET 357: stran po uspešnem plačilu v blagajni (Stripe success_url). */
export const metadata = { title: 'Plačano — Računko', robots: { index: false } }

export default function Hvala() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#F6F5F1', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 380, width: '100%', background: '#fff', borderRadius: 16, padding: '32px 24px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <h1 style={{ fontSize: 20, margin: '0 0 8px', color: '#1F6B3A' }}>Plačilo je uspelo</h1>
        <p style={{ fontSize: 14, color: '#666', lineHeight: 1.55, margin: 0 }}>
          Hvala! Davčno potrjen račun prejmete pri blagajni.
        </p>
      </div>
    </main>
  )
}
