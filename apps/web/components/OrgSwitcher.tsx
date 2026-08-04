'use client'

import { useEffect, useState } from 'react'
import { getMemberships, getStoredOrgId, setStoredOrgId, type Membership } from '@/lib/active-org'

/**
 * Preklopnik med organizacijami (audit 30.7.2026).
 *
 * Prikaže se SAMO, če uporabnik pripada več kot eni organizaciji —
 * pri običajnem uporabniku z eno organizacijo je popolnoma neviden.
 *
 * Ob preklopu se stran ponovno naloži, da vse komponente preberejo
 * novo aktivno organizacijo.
 */
export default function OrgSwitcher() {
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    getMemberships().then(ms => {
      setMemberships(ms)
      const stored = getStoredOrgId()
      const valid = stored && ms.some(m => m.org_id === stored)
      setActiveId(valid ? stored : (ms[0]?.org_id ?? null))
    })
  }, [])

  // Ena organizacija (ali nobena) → preklopnik ni potreben
  if (memberships.length <= 1) return null

  const active = memberships.find(m => m.org_id === activeId)

  function switchTo(orgId: string) {
    if (orgId === activeId) { setOpen(false); return }
    setStoredOrgId(orgId)
    // Poln ponoven zagon, da vse strani preberejo novo organizacijo
    window.location.reload()
  }

  const ROLE_LABELS: Record<string, string> = {
    owner: 'Lastnik',
    admin: 'Skrbnik',
    accountant: 'Računovodja',
    cashier: 'Blagajnik',
    viewer: 'Vpogled',
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 10,
          border: '1px solid rgba(0,0,0,0.1)', background: '#fff',
          fontSize: 13, fontWeight: 600, color: '#0D1F12',
          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}
        title="Preklopi organizacijo"
      >
        <span>🏢</span>
        <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {active?.organizations?.name ?? 'Organizacija'}
        </span>
        <span style={{ fontSize: 10, opacity: 0.5 }}>▼</span>
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
          />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
            minWidth: 260, background: '#fff', borderRadius: 12,
            border: '1px solid rgba(0,0,0,0.08)',
            boxShadow: '0 8px 28px rgba(0,0,0,0.12)', overflow: 'hidden',
          }}>
            <div style={{
              padding: '10px 14px', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: '#888', borderBottom: '1px solid #f0f0f0',
            }}>
              Preklopi organizacijo
            </div>
            {memberships.map(m => (
              <button
                key={m.org_id}
                onClick={() => switchTo(m.org_id)}
                style={{
                  width: '100%', padding: '11px 14px', textAlign: 'left',
                  background: m.org_id === activeId ? 'rgba(31,107,58,0.06)' : 'none',
                  border: 0, cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: '#0D1F12',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {m.organizations?.name ?? '—'}
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
                    {ROLE_LABELS[m.role] ?? m.role}
                  </div>
                </div>
                {m.org_id === activeId && (
                  <span style={{ color: '#1D9E75', fontSize: 14, flexShrink: 0 }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
