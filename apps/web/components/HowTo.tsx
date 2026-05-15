'use client'

import { useState } from 'react'

interface Step {
  icon: string
  title: string
  desc: string
  code?: string // opcijsko — za URL-je, kode, ukaze
  copyable?: boolean // ali je code kopirljiv
}

interface HowToProps {
  title?: string
  steps: Step[]
  tip?: string // opcijsko — zeleni tip na koncu
  videoUrl?: string // opcijsko — link na video navodila
  defaultOpen?: boolean
}

export default function HowTo({
  title = 'Kako nastavim?',
  steps,
  tip,
  videoUrl,
  defaultOpen = false,
}: HowToProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [copied, setCopied] = useState<number | null>(null)

  function copyToClipboard(text: string, index: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(index)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <div style={{
      borderRadius: 12,
      border: '0.5px solid rgba(0,0,0,0.1)',
      overflow: 'hidden',
      marginTop: 12,
    }}>
      {/* HEADER — klik za odpiranje */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          background: open ? '#F7F6F2' : '#fff',
          border: 0,
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background .15s',
        }}
      >
        <span style={{ fontSize: 16 }}>❓</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#0D1F12', flex: 1 }}>{title}</span>
        <span style={{
          fontSize: 11,
          color: '#888',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform .2s',
          display: 'inline-block',
        }}>▼</span>
      </button>

      {/* VSEBINA */}
      {open && (
        <div style={{ padding: '16px 20px', background: '#FAFAF8', borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>

          {/* KORAKI */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {/* Številka + ikona */}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: '#0D1F12', color: '#E8B547',
                  display: 'grid', placeItems: 'center',
                  fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 1,
                }}>
                  {i + 1}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 15 }}>{step.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0D1F12' }}>{step.title}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>{step.desc}</div>

                  {/* Koda / URL */}
                  {step.code && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
                      background: '#fff', borderRadius: 8,
                      border: '0.5px solid rgba(0,0,0,0.12)', padding: '7px 10px',
                    }}>
                      <code style={{ fontSize: 11, color: '#0D1F12', flex: 1, wordBreak: 'break-all', fontFamily: 'monospace' }}>
                        {step.code}
                      </code>
                      {step.copyable !== false && (
                        <button
                          onClick={() => copyToClipboard(step.code!, i)}
                          style={{
                            background: copied === i ? '#1D9E75' : '#F7F6F2',
                            border: 0, borderRadius: 6, padding: '4px 8px',
                            fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            color: copied === i ? '#fff' : '#666',
                            flexShrink: 0, transition: 'all .15s',
                          }}
                        >
                          {copied === i ? '✓ Kopirano' : '📋 Kopiraj'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* TIP */}
          {tip && (
            <div style={{
              marginTop: 16, background: '#E1F5EE', borderRadius: 8,
              padding: '10px 14px', fontSize: 12, color: '#0E5E3B', lineHeight: 1.6,
            }}>
              💡 {tip}
            </div>
          )}

          {/* VIDEO LINK */}
          {videoUrl && (
            <div style={{ marginTop: 12 }}>
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, color: '#1D9E75', fontWeight: 500, textDecoration: 'none',
                }}
              >
                📹 Oglej si video navodila →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
