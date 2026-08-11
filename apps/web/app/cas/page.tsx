'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'

interface TimeEntry {
  id: string
  client_name: string | null
  project: string | null
  description: string
  date: string
  hours: number
  hourly_rate: number | null
  is_billable: boolean
  invoice_id: string | null
}

const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none', background: '#fff' }

function fmt(n: number) { return `€${Number(n).toFixed(2)}` }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('sl-SI') }

export default function CasPage() {
  const router = useRouter()
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [filterClient, setFilterClient] = useState('')
  const [filterBillable, setFilterBillable] = useState<'all'|'billable'|'nonbillable'>('all')

  // Form
  const [description, setDescription] = useState('')
  const [clientName, setClientName] = useState('')
  const [project, setProject] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [hours, setHours] = useState(1)
  const [hourlyRate, setHourlyRate] = useState(0)
  const [isBillable, setIsBillable] = useState(true)

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500) }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
      if (!member) return
      setOrgId(member.org_id)
      const { data } = await supabase.from('time_entries').select('*').eq('org_id', member.org_id).order('date', { ascending: false })
      setEntries(data ?? [])
      setLoading(false)
    }
    load()
  }, [router, supabase])

  async function saveEntry() {
    if (!orgId || !description.trim()) { showToast('Opis je obvezen'); return }
    if (hours <= 0) { showToast('Ure morajo biti večje od 0'); return }
    setSaving(true)
    try {
      const { data: entry } = await supabase.from('time_entries').insert({
        org_id: orgId,
        description: description.trim(),
        client_name: clientName.trim() || null,
        project: project.trim() || null,
        date,
        hours,
        hourly_rate: hourlyRate || null,
        is_billable: isBillable,
      }).select().single()

      setEntries(prev => [entry!, ...prev])
      setShowForm(false)
      setDescription(''); setClientName(''); setProject(''); setHours(1); setHourlyRate(0)
      showToast('Vnos dodan')
    } catch (e: any) { showToast(e.message) }
    setSaving(false)
  }

  async function deleteEntry(id: string) {
    if (!confirm('Izbrišem vnos?')) return
    await supabase.from('time_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
    showToast('Vnos izbrisan')
  }

  async function convertToInvoice(entry: TimeEntry) {
    if (!orgId) return
    const amount = (entry.hours * (entry.hourly_rate ?? 0))
    if (amount <= 0) { showToast('Nastavite urno postavko za pretvorbo v račun'); return }
    const year = new Date().getFullYear()
    const { count } = await supabase.from('issued_invoices').select('*', { count: 'exact', head: true }).eq('org_id', orgId).like('invoice_number', `${year}-%`)
    const seq = String((count ?? 0) + 1).padStart(4, '0')
    const { data: inv } = await supabase.from('issued_invoices').insert({
      org_id: orgId,
      invoice_number: `${year}-${seq}`,
      invoice_type: 'invoice',
      client_name: entry.client_name ?? 'Stranka',
      issue_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0],
      line_items: [{ description: entry.description, quantity: entry.hours, unit_price: entry.hourly_rate, amount_net: amount, vat_amount: 0 }],
      amount_net: amount, vat_amount: 0, amount_total: amount,
      status: 'draft',
      notes: `Evidenca časa: ${entry.date}`,
    }).select('id').single()
    if (inv) {
      await supabase.from('time_entries').update({ invoice_id: inv.id }).eq('id', entry.id)
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, invoice_id: inv.id } : e))
      showToast(`Račun ${year}-${seq} ustvarjen`)
    }
  }

  // Filtrirane
  const filtered = entries.filter(e => {
    if (filterClient && !e.client_name?.toLowerCase().includes(filterClient.toLowerCase()) && !e.project?.toLowerCase().includes(filterClient.toLowerCase())) return false
    if (filterBillable === 'billable' && !e.is_billable) return false
    if (filterBillable === 'nonbillable' && e.is_billable) return false
    return true
  })

  // Statistike
  const totalHours = filtered.reduce((s, e) => s + e.hours, 0)
  const billableHours = filtered.filter(e => e.is_billable).reduce((s, e) => s + e.hours, 0)
  const MONTHLY_NORM = 176
  const now = new Date()
  const monthHours = entries
    .filter(e => { const d = new Date(e.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() })
    .reduce((s, e) => s + e.hours, 0)
  const regularHours = Math.min(monthHours, MONTHLY_NORM)
  const overtimeHours = Math.max(0, monthHours - MONTHLY_NORM)
  const normaPct = Math.min(100, (monthHours / MONTHLY_NORM) * 100)
  const totalValue = filtered.filter(e => e.is_billable && e.hourly_rate).reduce((s, e) => s + e.hours * (e.hourly_rate ?? 0), 0)
  const uninvoiced = filtered.filter(e => e.is_billable && !e.invoice_id && e.hourly_rate).reduce((s, e) => s + e.hours * (e.hourly_rate ?? 0), 0)

  // Grupiranje po datumu
  const grouped = filtered.reduce((acc, e) => {
    const key = e.date
    if (!acc[key]) acc[key] = []
    acc[key].push(e)
    return acc
  }, {} as Record<string, TimeEntry[]>)

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>Nalagam...</div>

  return (
    <AppLayout org={org}>
    <div style={{ minHeight: '100vh', background: '#F7F6F2' }}>
      {/* HEADER */}
      <div style={{ background: '#0D1F12', padding: '20px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#E8B547', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>RAČUNKO</div>
            <div style={{ fontSize: 20, color: '#fff', fontWeight: 500, marginTop: 4 }}>Evidenca časa</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/dashboard" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', padding: '8px 16px', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>← Nazaj</Link>
            <button onClick={() => setShowForm(!showForm)} style={{ background: '#1D9E75', color: '#fff', border: 0, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Nov vnos</button>
          </div>
        </div>
        <div style={{ maxWidth: 960, margin: '16px auto 0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Skupaj ur', value: `${totalHours.toFixed(1)}h`, color: '#fff' },
            { label: 'Zaračunljivih ur', value: `${billableHours.toFixed(1)}h`, color: '#FCD34D' },
            { label: 'Skupna vrednost', value: fmt(totalValue), color: '#6EE7B7' },
            { label: 'Nefakturirano', value: fmt(uninvoiced), color: uninvoiced > 0 ? '#F87171' : '#6EE7B7' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
        <div style={{ maxWidth: 960, margin: '12px auto 0', background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Mesečna norma ({MONTHLY_NORM}h)</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: overtimeHours > 0 ? '#FCD34D' : '#fff' }}>
              {regularHours.toFixed(1)}h redno{overtimeHours > 0 ? ` + ${overtimeHours.toFixed(1)}h nadur` : ''}
            </div>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${normaPct}%`, background: overtimeHours > 0 ? '#FCD34D' : '#1D9E75', borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>

        {/* FORM */}
        {showForm && (
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 16 }}>Nov vnos časa</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Opis dela *</label>
                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Razvoj funkcionalnosti, sestanek..." style={inp} autoFocus />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Ure *</label>
                <input type="number" step="0.25" min="0.25" value={hours} onChange={e => setHours(Number(e.target.value))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Datum</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Stranka</label>
                <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="ABC d.o.o." style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Projekt</label>
                <input value={project} onChange={e => setProject(e.target.value)} placeholder="Spletna stran, App..." style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Urna postavka (€/h)</label>
                <input type="number" step="1" min="0" value={hourlyRate} onChange={e => setHourlyRate(Number(e.target.value))} placeholder="0" style={inp} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={isBillable} onChange={e => setIsBillable(e.target.checked)} />
                Zaračunljivo
              </label>
              {hours > 0 && hourlyRate > 0 && (
                <div style={{ fontSize: 13, color: '#1D9E75', fontWeight: 600 }}>
                  = {fmt(hours * hourlyRate)}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8, padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}>Prekliči</button>
              <button onClick={saveEntry} disabled={saving} style={{ background: '#0D1F12', color: '#fff', border: 0, borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Shranjujem...' : '✓ Dodaj vnos'}
              </button>
            </div>
          </div>
        )}

        {/* FILTRI */}
        {entries.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <input value={filterClient} onChange={e => setFilterClient(e.target.value)} placeholder="Išči po stranki / projektu..." style={{ ...inp, maxWidth: 280 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              {(['all', 'billable', 'nonbillable'] as const).map(f => (
                <button key={f} onClick={() => setFilterBillable(f)} style={{
                  padding: '8px 14px', borderRadius: 8, border: 0, fontSize: 12, cursor: 'pointer',
                  background: filterBillable === f ? '#0D1F12' : '#fff',
                  color: filterBillable === f ? '#fff' : '#666',
                }}>
                  {f === 'all' ? 'Vse' : f === 'billable' ? 'Zaračunljivo' : 'Nezaračunljivo'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* VNOSI */}
        {entries.length === 0 && !showForm ? (
          <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', border: '0.5px solid rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏱️</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0D1F12', marginBottom: 8 }}>Ni vnosov časa</div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 24 }}>Beležite ure po projektih in strankah — nato pretvorite v račun</div>
            <button onClick={() => setShowForm(true)} style={{ background: '#0D1F12', color: '#fff', border: 0, borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>+ Nov vnos →</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(grouped).map(([date, dayEntries]) => (
              <div key={date}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
                  {fmtDate(date)} · {dayEntries.reduce((s, e) => s + e.hours, 0).toFixed(1)}h
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {dayEntries.map(e => (
                    <div key={e.id} style={{ background: '#fff', borderRadius: 12, border: '0.5px solid rgba(0,0,0,0.08)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 48, textAlign: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#0D1F12' }}>{e.hours}h</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#0D1F12' }}>{e.description}</div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                          {e.client_name && <span>{e.client_name}</span>}
                          {e.client_name && e.project && <span> · </span>}
                          {e.project && <span>{e.project}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        {e.is_billable && e.hourly_rate ? (
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#1D9E75' }}>{fmt(e.hours * e.hourly_rate)}</div>
                        ) : (
                          <div style={{ fontSize: 11, color: e.is_billable ? '#aaa' : '#888' }}>{e.is_billable ? 'Brez urne postavke' : 'Nezaračunljivo'}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {e.is_billable && !e.invoice_id && e.hourly_rate && (
                          <button onClick={() => convertToInvoice(e)} style={{ fontSize: 11, fontWeight: 600, color: '#1D9E75', background: '#E1F5EE', border: 0, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>→ Račun</button>
                        )}
                        {e.invoice_id && <span style={{ fontSize: 11, color: '#888' }}>✓ Fakturirano</span>}
                        <button onClick={() => deleteEntry(e.id)} style={{ background: 'none', border: 0, color: '#aaa', cursor: 'pointer', fontSize: 16 }}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#0D1F12', color: '#fff', padding: '12px 20px', borderRadius: 999, fontSize: 13, fontWeight: 500, zIndex: 3000 }}>✓ {toast}</div>
      )}
    </div>
    </AppLayout>
  )
}
