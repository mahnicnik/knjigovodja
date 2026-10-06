'use client'
import { useState, useEffect } from 'react'

interface UpgradeModalProps {
  open: boolean
  onClose: () => void
  feature?: string
  requiredPlan?: 'pro' | 'pro_pos'
}

export default function UpgradeModal({ open, onClose, feature, requiredPlan = 'pro' }: UpgradeModalProps) {
  const [loading, setLoading] = useState<'pro' | 'pro_pos' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  async function handleUpgrade(plan: 'pro' | 'pro_pos') {
    setLoading(plan)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Napaka pri plačilu')
      if (data.url) window.location.href = data.url
    } catch (err: any) {
      setError(err.message)
      setLoading(null)
    }
  }

  const isPos = requiredPlan === 'pro_pos'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 24, width: '100%', maxWidth: 480,
          boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ background: '#0A3D2B', padding: '28px 28px 24px', position: 'relative' }}>
          <button
            onClick={onClose}
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#fff', cursor: 'pointer', fontSize: 16, display: 'grid', placeItems: 'center' }}
          >
            ✕
          </button>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⭐</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
            Nadgradite paket
          </div>
          {feature && (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
              {feature} zahteva višji paket
            </div>
          )}
        </div>

        {/* Paketi */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Pro */}
          <div
            onClick={() => !loading && handleUpgrade('pro')}
            style={{
              border: `2px solid ${requiredPlan === 'pro' ? '#1D9E75' : '#f0f0f0'}`,
              borderRadius: 16, padding: 20, cursor: 'pointer',
              background: requiredPlan === 'pro' ? '#f0fdf4' : '#fff',
              transition: 'border 0.15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F12' }}>💼 Pro</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Za aktivne s.p.</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0D1F12' }}>€9.99</div>
                <div style={{ fontSize: 11, color: '#888' }}>/mesec</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {['Neomejeni računi', 'Email pošiljanje', 'FURS fiskalizacija', 'Dobavnice'].map(f => (
                <div key={f} style={{ fontSize: 12, color: '#444', display: 'flex', gap: 8 }}>
                  <span style={{ color: '#1D9E75', fontWeight: 700 }}>✓</span> {f}
                </div>
              ))}
            </div>
            <button
              onClick={e => { e.stopPropagation(); handleUpgrade('pro') }}
              disabled={!!loading}
              style={{
                width: '100%', padding: '10px', borderRadius: 10, border: 'none',
                background: requiredPlan === 'pro' ? '#1D9E75' : '#0D1F12',
                color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading === 'pro' ? 'Preusmerjam...' : 'Izberi Pro →'}
            </button>
          </div>

          {/* Pro + POS */}
          <div
            onClick={() => !loading && handleUpgrade('pro_pos')}
            style={{
              border: `2px solid ${requiredPlan === 'pro_pos' ? '#1D9E75' : '#f0f0f0'}`,
              borderRadius: 16, padding: 20, cursor: 'pointer',
              background: requiredPlan === 'pro_pos' ? '#f0fdf4' : '#fff',
              transition: 'border 0.15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F12' }}>🖥️ Pro + POS</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Za blagajne & fitness</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0D1F12' }}>€24.99</div>
                <div style={{ fontSize: 11, color: '#888' }}>/mesec</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {['Vse iz Pro paketa', 'POS blagajna', 'Koledar & termini', 'Člani & paketi', 'Desktop & mobilna app'].map(f => (
                <div key={f} style={{ fontSize: 12, color: '#444', display: 'flex', gap: 8 }}>
                  <span style={{ color: '#1D9E75', fontWeight: 700 }}>✓</span> {f}
                </div>
              ))}
            </div>
            <button
              onClick={e => { e.stopPropagation(); handleUpgrade('pro_pos') }}
              disabled={!!loading}
              style={{
                width: '100%', padding: '10px', borderRadius: 10, border: 'none',
                background: requiredPlan === 'pro_pos' ? '#1D9E75' : '#0D1F12',
                color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading === 'pro_pos' ? 'Preusmerjam...' : 'Izberi Pro + POS →'}
            </button>
          </div>

          {error && (
            <div style={{ fontSize: 13, color: '#dc2626', background: '#fef2f2', padding: '10px 14px', borderRadius: 10 }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ textAlign: 'center', fontSize: 12, color: '#aaa', marginTop: 4 }}>
            Varno plačilo prek Stripe · Prekličete kadarkoli
          </div>
        </div>
      </div>
    </div>
  )
}
