'use client'

/**
 * RAČUNKO POS — Evidenca delovnega časa
 *
 * Komponente za prijavo/odmor/odjavo delavcev.
 * Ločen file da ni problem z vrstnim redom funkcij v pos/page.tsx.
 *
 * Izvozi:
 *   - WorkStatusBar    — header bar z aktivnimi delavci
 *   - ClockInModal     — prijava na delo (izbira delavca + PIN)
 *   - ClockOutModal    — odjava z dela (summary + sync v računko.si)
 */

import React from 'react'
import { createClient } from '@/lib/supabase'

// ===== TIPI =====

export interface WorkSession {
  id: string
  staff_id: string
  clock_in: string
  clock_out: string | null
  break_start: string | null
  break_end: string | null
  break_minutes: number
  total_minutes: number | null
  overtime_minutes: number
  note: string | null
  status: 'active' | 'on_break' | 'closed'
  staff?: { name: string; color: string; role: string }
}

export interface StaffMember {
  id: string
  name: string
  role: string
  pin: string | null
  color: string | null
  active: boolean
}

// ===== HELPERS =====

const BUSINESS_ID = '00000000-0000-0000-0000-000000000001'

function formatDuration(clockIn: string, breakMin = 0): string {
  const ms = Date.now() - new Date(clockIn).getTime() - breakMin * 60000
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}

function fmtMin(m: number): string {
  return `${Math.floor(m / 60)}h ${m % 60}min`
}

function fmtTime(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' })
}

function initials(name: string): string {
  return name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
}

// ===== WORK STATUS BAR =====

export function WorkStatusBar({ posData, onRequestClockIn }: {
  posData: any
  onRequestClockIn: () => void
}) {
  const [sessions, setSessions] = React.useState<WorkSession[]>([])
  const [clockOutTarget, setClockOutTarget] = React.useState<{ session: WorkSession; staff: StaffMember } | null>(null)

  React.useEffect(() => {
    loadSessions()
    const t = setInterval(loadSessions, 60000)
    return () => clearInterval(t)
  }, [])

  async function loadSessions() {
    const db = createClient()
    // Najprej work_sessions
    const { data: ws } = await db
      .from('work_sessions')
      .select('*')
      .eq('business_id', BUSINESS_ID)
      .in('status', ['active', 'on_break'])
      .order('clock_in', { ascending: true })

    if (!ws || ws.length === 0) { setSessions([]); return }

    // Potem staff podatki
    const staffIds = [...new Set(ws.map((s: any) => s.staff_id))]
    const { data: staffData } = await db
      .from('staff')
      .select('id, name, color, role')
      .in('id', staffIds)

    const staffMap = Object.fromEntries((staffData || []).map((s: any) => [s.id, s]))

    setSessions(ws.map((s: any) => ({ ...s, staff: staffMap[s.staff_id] || null })))
  }

  async function toggleBreak(session: WorkSession) {
    const db = createClient()
    if (session.status === 'on_break') {
      const breakMin = (session.break_minutes || 0) +
        Math.floor((Date.now() - new Date(session.break_start!).getTime()) / 60000)
      await db.from('work_sessions').update({
        status: 'active',
        break_end: new Date().toISOString(),
        break_minutes: breakMin,
      }).eq('id', session.id)
    } else {
      await db.from('work_sessions').update({
        status: 'on_break',
        break_start: new Date().toISOString(),
      }).eq('id', session.id)
    }
    loadSessions()
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {sessions.map(s => {
          const onBreak = s.status === 'on_break'
          const staff = s.staff as any
          return (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: onBreak ? 'rgba(245,158,11,0.18)' : 'rgba(16,185,129,0.18)',
              borderRadius: 20, padding: '3px 8px 3px 4px',
              fontSize: 11, fontWeight: 600,
              color: onBreak ? '#d97706' : '#059669',
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 999,
                background: staff?.color || '#16a34a', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700,
              }}>
                {initials(staff?.name || '?')}
              </div>
              <span>{(staff?.name || '?').split(' ')[0]}</span>
              <span style={{ opacity: 0.75 }}>{formatDuration(s.clock_in, s.break_minutes)}</span>
              <button
                onClick={() => toggleBreak(s)}
                title={onBreak ? 'Konec odmora' : 'Začni odmor'}
                style={{ marginLeft: 2, padding: '1px 5px', borderRadius: 4, border: 'none', background: 'rgba(0,0,0,0.1)', cursor: 'pointer', fontSize: 11 }}
              >
                {onBreak ? '▶' : '⏸'}
              </button>
              <button
                onClick={() => setClockOutTarget({ session: s, staff: staff })}
                title="Odjava z dela"
                style={{ padding: '1px 5px', borderRadius: 4, border: 'none', background: 'rgba(168,50,50,0.15)', color: '#dc2626', cursor: 'pointer', fontSize: 11 }}
              >
                ×
              </button>
            </div>
          )
        })}
        <button
          onClick={onRequestClockIn}
          style={{
            padding: '3px 10px', borderRadius: 20,
            border: '1px dashed rgba(255,255,255,0.35)',
            background: 'transparent', color: 'rgba(255,255,255,0.75)',
            cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}
        >
          + Prijava
        </button>
      </div>

      {clockOutTarget && (
        <ClockOutModal
          session={clockOutTarget.session}
          staffMember={clockOutTarget.staff}
          onClose={() => setClockOutTarget(null)}
          onClockedOut={() => { setClockOutTarget(null); loadSessions() }}
        />
      )}
    </>
  )
}

// ===== CLOCK IN MODAL =====

export function ClockInModal({ posData, onClose, onClockedIn }: {
  posData: any
  onClose: () => void
  onClockedIn: () => void
}) {
  const [step, setStep] = React.useState<'select' | 'pin' | 'confirm'>('select')
  const [selected, setSelected] = React.useState<StaffMember | null>(null)
  const [pin, setPin] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')

  const staffList: StaffMember[] = (posData.staffList || []).filter((s: StaffMember) => s.active !== false)

  async function handleClockIn() {
    if (!selected) return
    if (selected.pin && pin !== selected.pin) { setError('Napačen PIN'); return }
    setSaving(true); setError('')
    try {
      const db = createClient()
      // Preveri da ni že prijavljen
      const { data: existing } = await db
        .from('work_sessions')
        .select('id')
        .eq('staff_id', selected.id)
        .in('status', ['active', 'on_break'])
        .maybeSingle()
      if (existing) throw new Error(`${selected.name} je že prijavljen na delo`)

      await db.from('work_sessions').insert({
        business_id: BUSINESS_ID,
        staff_id: selected.id,
        clock_in: new Date().toISOString(),
        status: 'active',
      })
      onClockedIn()
      onClose()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  // Inline styles (nima dostopa do T tema iz pos/page.tsx)
  const cardStyle: React.CSSProperties = {
    padding: '20px', display: 'flex', flexDirection: 'column', gap: 14,
  }
  const btnPrimary: React.CSSProperties = {
    flex: 2, padding: '11px', borderRadius: 9, cursor: 'pointer',
    fontFamily: 'inherit', border: 'none', background: '#16a34a',
    color: '#fff', fontWeight: 700, fontSize: 13,
  }
  const btnSecondary: React.CSSProperties = {
    flex: 1, padding: '11px', borderRadius: 9, cursor: 'pointer',
    fontFamily: 'inherit', border: '1px solid #e5e7eb', background: 'transparent',
    fontWeight: 600, fontSize: 13,
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ background: '#fff', borderRadius: 14, width: 380, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Prijava na delo</div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: '#9ca3af' }}>×</button>
        </div>
        <div style={cardStyle}>
          {step === 'select' && (<>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Izberi delavca:</div>
            {staffList.map(s => (
              <button key={s.id}
                onClick={() => { setSelected(s); setPin(''); setError(''); setStep(s.pin ? 'pin' : 'confirm') }}
                style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
                <div style={{ width: 38, height: 38, borderRadius: 999, background: s.color || '#16a34a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
                  {initials(s.name)}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.role}</div>
                </div>
              </button>
            ))}
          </>)}

          {step === 'pin' && selected && (<>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: 999, background: selected.color || '#16a34a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, margin: '0 auto 8px' }}>
                {initials(selected.name)}
              </div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{selected.name}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'center', color: '#6b7280' }}>Vnesi PIN:</div>
            <input type="password" value={pin} onChange={e => setPin(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleClockIn()}
              style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid #e5e7eb', fontFamily: 'inherit', fontSize: 20, fontWeight: 700, textAlign: 'center', letterSpacing: 8, outline: 'none' }}
              autoFocus maxLength={8} />
            {error && <div style={{ color: '#dc2626', fontSize: 12, textAlign: 'center' }}>⚠️ {error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep('select')} style={btnSecondary}>Nazaj</button>
              <button onClick={handleClockIn} disabled={saving || !pin} style={btnPrimary}>
                {saving ? 'Prijavljam...' : '🟢 Prijava na delo'}
              </button>
            </div>
          </>)}

          {step === 'confirm' && selected && (<>
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🟢</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.name}</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                Prijava ob {fmtTime(new Date())}
              </div>
            </div>
            {error && <div style={{ color: '#dc2626', fontSize: 12, textAlign: 'center' }}>⚠️ {error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep('select')} style={btnSecondary}>Nazaj</button>
              <button onClick={handleClockIn} disabled={saving} style={btnPrimary}>
                {saving ? 'Prijavljam...' : '✅ Potrdi prijavo'}
              </button>
            </div>
          </>)}
        </div>
      </div>
    </div>
  )
}

// ===== CLOCK OUT MODAL =====

export function ClockOutModal({ session, staffMember, onClose, onClockedOut }: {
  session: WorkSession
  staffMember: StaffMember
  onClose: () => void
  onClockedOut: () => void
}) {
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')

  const now = new Date()
  const clockInRaw = session?.clock_in || new Date().toISOString()
  const clockIn = new Date(clockInRaw)
  const totalMs = now.getTime() - clockIn.getTime()
  const breakMs = (session.break_minutes || 0) * 60000
  const workMin = Math.floor((totalMs - breakMs) / 60000)
  const overtimeMin = Math.max(0, workMin - 480)

  async function handleClockOut() {
    setSaving(true); setError('')
    try {
      const db = createClient()
      await db.from('work_sessions').update({
        clock_out: now.toISOString(),
        total_minutes: workMin,
        overtime_minutes: overtimeMin,
        note: note || null,
        status: 'closed',
      }).eq('id', session.id)

      // Sync v Računko.si (time_entries)
      try {
        const { data: { user } } = await db.auth.getUser()
        if (user) {
          const { data: member } = await db.from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
          if (member) {
            await db.from('time_entries').insert({
              org_id: member.org_id,
              user_id: user.id,
              client_name: staffMember?.name || 'Delavec',
              project: 'Delo v ŠIRM',
              description: note || `${clockIn.toLocaleDateString('sl-SI')} ${fmtTime(clockIn)}–${fmtTime(now)}`,
              date: clockIn.toISOString().slice(0, 10),
              hours: parseFloat((workMin / 60).toFixed(2)),
              is_billable: false,
            })
          }
        }
      } catch (e) { console.warn('Sync v računko.si ni uspel:', e) }

      onClockedOut()
      onClose()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }
  const cell: React.CSSProperties = { background: '#f3f4f6', borderRadius: 8, padding: '8px 12px' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: 400, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>Odjava z dela</div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: '#9ca3af' }}>×</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: '#f9fafb', borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: '#111' }}>{staffMember?.name}</div>
            <div style={grid}>
              {[
                ['Prihod', fmtTime(clockIn)],
                ['Odhod', fmtTime(now)],
                ['Odmori', fmtMin(session.break_minutes || 0)],
                ['Skupaj', fmtMin(workMin)],
              ].map(([label, val]) => (
                <div key={label} style={cell}>
                  <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, color: '#111' }}>{val}</div>
                </div>
              ))}
            </div>
            {overtimeMin > 0 && (
              <div style={{ marginTop: 10, background: 'rgba(37,99,235,0.08)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#2563eb', fontWeight: 600 }}>
                ⏰ Nadure: {fmtMin(overtimeMin)}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "#111" }}>Opomba (opcijsko)</div>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="npr. zaključil zgodaj, bolniška..."
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontFamily: 'inherit', fontSize: 12, outline: 'none', color: '#111', background: '#fff' }} />
          </div>

          {error && <div style={{ color: '#dc2626', fontSize: 12 }}>⚠️ {error}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid #e5e7eb', background: 'transparent', fontWeight: 600, color: '#111' }}>Prekliči</button>
            <button onClick={handleClockOut} disabled={saving} style={{ flex: 2, padding: '11px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700 }}>
              {saving ? 'Odjavljam...' : '🔴 Potrdi odjavo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}