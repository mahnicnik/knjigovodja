'use client'

import type { PeriodMode } from '@/lib/period-filter'

const OPTIONS: { value: PeriodMode; label: string }[] = [
  { value: 'today', label: 'Danes' },
  { value: 'week', label: 'Ta teden' },
  { value: 'month', label: 'Ta mesec' },
  { value: 'year', label: 'To leto' },
  { value: 'all', label: 'Vse' },
  { value: 'custom', label: 'Po meri' },
]

/**
 * Skupna komponenta izbirnika obdobja (Prelet 17, 17.8.2026).
 * Glej lib/period-filter.ts za logiko izracuna datumov.
 */
export default function PeriodFilter({
  mode,
  onModeChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
}: {
  mode: PeriodMode
  onModeChange: (m: PeriodMode) => void
  customFrom: string
  customTo: string
  onCustomFromChange: (v: string) => void
  onCustomToChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => onModeChange(opt.value)}
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 13,
            cursor: 'pointer',
            border: mode === opt.value ? '1px solid #111' : '1px solid rgba(0,0,0,0.12)',
            background: mode === opt.value ? '#111' : '#fff',
            color: mode === opt.value ? '#fff' : '#333',
          }}
        >
          {opt.label}
        </button>
      ))}
      {mode === 'custom' && (
        <>
          <input
            type="date"
            value={customFrom}
            onChange={e => onCustomFromChange(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', fontSize: 13 }}
          />
          <span style={{ color: '#999' }}>–</span>
          <input
            type="date"
            value={customTo}
            onChange={e => onCustomToChange(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', fontSize: 13 }}
          />
        </>
      )}
    </div>
  )
}
