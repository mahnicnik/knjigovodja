'use client'

import { useSubscription } from '@/lib/useSubscription'

interface ProGateProps {
  children: React.ReactNode
  feature: 'pro' | 'pos'
  fallback?: React.ReactNode
}

export function ProGate({ children, feature, fallback }: ProGateProps) {
  const sub = useSubscription()

  if (sub.loading) return null

  const hasAccess = feature === 'pos' ? sub.isProPos : sub.isPro

  if (!hasAccess) {
    return fallback ? <>{fallback}</> : <UpgradePrompt feature={feature} />
  }

  return <>{children}</>
}

function UpgradePrompt({ feature }: { feature: 'pro' | 'pos' }) {
  const isPOS = feature === 'pos'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      textAlign: 'center',
      gap: 16,
    }}>
      <div style={{ fontSize: 40 }}>{isPOS ? '🖥️' : '💼'}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#0D1F12' }}>
        {isPOS ? 'Pro + POS blagajna' : 'Računko Pro'}
      </div>
      <div style={{ fontSize: 14, color: '#666', maxWidth: 320 }}>
        {isPOS
          ? 'Ta funkcija je del Pro + POS paketa (€24.99/mes). Vključuje blagajno, koledar, člane, pakete in inventar.'
          : 'Ta funkcija je del Pro paketa (€9.99/mes). Vključuje neomejene račune, email pošiljanje in FURS fiskalizacijo.'
        }
      </div>
      <a
        href="/nastavitve#narocnina"
        style={{
          background: '#1D9E75',
          color: '#fff',
          padding: '12px 24px',
          borderRadius: 10,
          fontWeight: 600,
          fontSize: 14,
          textDecoration: 'none',
          marginTop: 8,
        }}
      >
        Nadgradi paket →
      </a>
    </div>
  )
}
