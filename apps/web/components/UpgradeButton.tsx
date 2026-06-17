'use client'
import { useState } from 'react'

interface UpgradeButtonProps {
  subscriptionStatus?: 'free' | 'pro' | 'pro_pos' | 'cancelled' | 'past_due'
  targetPlan?: 'pro' | 'pro_pos'
  className?: string
  variant?: 'primary' | 'inline'
}

export default function UpgradeButton({
  subscriptionStatus = 'free',
  targetPlan = 'pro',
  className = '',
  variant = 'primary'
}: UpgradeButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUpgrade = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: targetPlan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Napaka pri ustvarjanju plačila')
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error('Ni prejete povezave za plačilo')
      }
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  // Že ima ta plan ali višji
  if (subscriptionStatus === 'pro_pos') return null
  if (subscriptionStatus === 'pro' && targetPlan === 'pro') return null

  const label = targetPlan === 'pro_pos'
    ? subscriptionStatus === 'pro' ? 'Dodaj POS blagajno — €25/mes' : 'Nadgradi na Pro + POS — €25/mes'
    : 'Nadgradi na Pro — €9.99/mes'

  const buttonClass = variant === 'inline'
    ? 'inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors'
    : 'inline-flex items-center gap-2 bg-gray-900 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors'

  return (
    <div className={className}>
      <button onClick={handleUpgrade} disabled={loading} className={buttonClass}>
        {loading ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Preusmerjam...
          </>
        ) : label}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">⚠️ {error}</p>}
    </div>
  )
}
