'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

interface LegalUpdate {
  id: string
  title: string
  summary: string
  source: string
  source_url: string
  category: string
  severity: string
  effective_date: string
  published_at?: string | null
  created_at: string
}

const CATEGORY_LABELS: Record<string, string> = {
  ddv: 'DDV',
  prispevki: 'Prispevki',
  dohodnina: 'Dohodnina',
  zaposleni: 'Zaposleni',
  splosno: 'Splošno',
}

const SEVERITY_STYLE: Record<string, { bg: string; color: string; dot: string }> = {
  urgent: { bg: '#FCEBEB', color: '#A32D2D', dot: '#E24B4A' },
  warning: { bg: '#FAEEDA', color: '#854F0B', dot: '#EF9F27' },
  info: { bg: '#EAF3DE', color: '#27500A', dot: '#3B6D11' },
}

export default function LegalUpdatesWidget() {
  const [updates, setUpdates] = useState<LegalUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('legal_updates')
      .select('*')
      // POPRAVLJENO (25.8.2026): urejeno po `created_at` (kdaj smo zapis
      // POBRALI), ne po datumu OBJAVE. Zdaj so na vrhu najnovejse objave.
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(10)
    setUpdates(data || [])
    setLoading(false)
  }

  const [odziv, setOdziv] = useState<string | null>(null)

  /**
   * POPRAVLJENO (25.8.2026): gumb je klical GET, ta pa po preletu 112 samo
   * POROCA o stanju - vsebine ne prinese vec. Klik ni naredil nicesar in ni
   * povedal, zakaj: kazalnik se je zavrtel, seznam pa ostal enak.
   */
  async function refresh() {
    setRefreshing(true)
    setOdziv(null)
    try {
      const res = await fetch('/api/legal-updates', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      await load()

      if (!res.ok) {
        setOdziv('Virov ni bilo mogoče doseči. Poskusite pozneje.')
      } else if ((d.obdrzanih ?? 0) > 0) {
        setOdziv(`Dodanih ali osveženih: ${d.obdrzanih}.`)
      } else if ((d.najdenih ?? 0) > 0) {
        // Vir dela, le nobena objava ne zadeva s.p. - to je pogosto in
        // uporabnik mora vedeti, da NI napaka.
        setOdziv(`Vir deluje (${d.najdenih} objav), nobena pa ne zadeva s.p.`)
      } else {
        setOdziv('Vir trenutno ne vrača objav.')
      }
    } catch {
      setOdziv('Povezave ni bilo mogoče vzpostaviti.')
    }
    setRefreshing(false)
  }

  const urgentCount = updates.filter(u => u.severity === 'urgent').length
  const warningCount = updates.filter(u => u.severity === 'warning').length

  if (loading) return null
  if (updates.length === 0) return (
    <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: '12px', padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '12px', fontWeight: '500', color: '#0D1F12' }}>⚖️ Zakonske novosti</div>
        <button onClick={refresh} disabled={refreshing} style={{ fontSize: '11px', color: '#888', background: 'none', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: '20px', padding: '4px 12px', cursor: 'pointer' }}>
          {refreshing ? 'Iščem...' : '↻ Preveri'}
        </button>
      </div>
      <div style={{ fontSize: '12px', color: '#aaa', marginTop: '10px', textAlign: 'center', padding: '12px 0' }}>
        {/* POPRAVLJENO (25.8.2026): gumb je obljubljal novosti iz treh virov,
            dejansko pa je vpisal sest trdo zapisanih zapisov iz leta 2025.
            Zdaj vsebina prihaja iz virov FURS, osvezuje pa jo nocno opravilo. */}
        {odziv || 'Trenutno ni objav, ki bi zadevale s.p. Seznam osvežuje nočno opravilo.'}
      </div>
    </div>
  )

  return (
    <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: '500', color: '#0D1F12' }}>⚖️ Zakonske novosti</span>
          {urgentCount > 0 && (
            <div style={{ background: '#FCEBEB', color: '#A32D2D', fontSize: '10px', fontWeight: '600', padding: '2px 7px', borderRadius: '20px' }}>
              ⚠ {urgentCount} nujnih
            </div>
          )}
          {warningCount > 0 && urgentCount === 0 && (
            <div style={{ background: '#FAEEDA', color: '#854F0B', fontSize: '10px', fontWeight: '600', padding: '2px 7px', borderRadius: '20px' }}>
              ! {warningCount} opozoril
            </div>
          )}
        </div>
        <button onClick={refresh} disabled={refreshing} style={{ fontSize: '11px', color: '#888', background: 'none', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: '20px', padding: '4px 12px', cursor: 'pointer' }}>
          {refreshing ? 'Iščem...' : '↻ Osveži'}
        </button>
      </div>

      {/* Odziv na osvezitev (25.8.2026): brez njega uporabnik ne ve, ali je
          klik kaj naredil - seznam ostane enak tudi ob uspesnem teku. */}
      {odziv && (
        <div style={{ fontSize: '11px', color: '#0E5E3B', background: '#E1F5EE', borderRadius: '8px', padding: '7px 10px', marginBottom: '10px' }}>
          {odziv}
        </div>
      )}

      {/* Updates list */}
      {updates.map((u, i) => {
        const style = SEVERITY_STYLE[u.severity] || SEVERITY_STYLE.info
        const isExpanded = expanded === u.id
        const dat = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('sl-SI', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

  return (
          <div
            key={u.id}
            style={{ borderBottom: i < updates.length - 1 ? '0.5px solid rgba(0,0,0,0.04)' : 'none', cursor: 'pointer' }}
            onClick={() => setExpanded(isExpanded ? null : u.id)}
          >
            <div style={{ padding: '11px 16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: style.dot, flexShrink: 0, marginTop: '5px' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: '500', color: '#0D1F12', marginBottom: '2px' }}>{u.title}</div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', background: style.bg, color: style.color, padding: '1px 7px', borderRadius: '20px', fontWeight: '500' }}>
                    {u.source}
                  </span>
                  {/* DATUM OBJAVE (25.8.2026): brez njega uporabnik ne loci
                      lanske objave od tokratne. */}
                  {u.published_at && (
                    <span style={{ fontSize: '10px', color: '#888', fontWeight: 500 }}>
                      {dat(u.published_at)}
                    </span>
                  )}
                  <span style={{ fontSize: '10px', color: '#aaa' }}>
                    {CATEGORY_LABELS[u.category] || u.category}
                  </span>
                  {u.effective_date && (
                    <span style={{ fontSize: '10px', color: '#aaa' }}>
                      · Velja od {new Date(u.effective_date).toLocaleDateString('sl-SI')}
                    </span>
                  )}
                </div>
                {isExpanded && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#444', lineHeight: 1.6, background: '#F7F6F2', borderRadius: '8px', padding: '10px 12px' }}>
                    {u.summary}
                    {u.source_url && (
                      <div style={{ marginTop: '8px' }}>
                        <a href={u.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: '#1D9E75', textDecoration: 'none' }}>
                          Preberi več →
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <span style={{ fontSize: '10px', color: '#ccc', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
            </div>
          </div>
        )
      })}

      <div style={{ padding: '10px 16px', borderTop: '0.5px solid rgba(0,0,0,0.04)', fontSize: '10px', color: '#aaa', textAlign: 'center' }}>
        Podatki iz FURS, ZPIZ, Uradnega lista · AI povzetek
      </div>
    </div>
  )
}
