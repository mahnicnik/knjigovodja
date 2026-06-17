'use client'
import { useState } from 'react'

export default function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePortal() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Napaka')
      if (data.url) window.location.href = data.url
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={handlePortal}
        disabled={loading}
        style={{
          background: '#f3f4f6', color: '#0D1F12', border: '1px solid #e5e7eb',
          padding: '10px 18px', borderRadius: 10, fontWeight: 600, fontSize: 13,
          cursor: 'pointer', opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Preusmerjam...' : '⚙️ Upravljaj naročnino'}
      </button>
      {error && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>⚠️ {error}</p>}
      <p style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
        Preklic, zamenjava plana, download računov
      </p>
    </div>
  )
}
