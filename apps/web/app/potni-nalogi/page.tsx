'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

interface TravelOrder {
  id: string
  order_number: string
  employee_name: string
  purpose: string
  departure_date: string
  return_date: string
  destination: string
  transport_type: string
  km: number | null
  km_rate: number
  daily_allowance: number
  accommodation: number
  other_costs: number
  total: number
  status: 'draft' | 'approved' | 'paid'
}

const STATUS = {
  draft:    { label: 'Osnutek',  color: '#888',    bg: '#F3F4F6' },
  approved: { label: 'Odobren', color: '#1D9E75', bg: '#E1F5EE' },
  paid:     { label: 'Plačan',  color: '#0E5E3B', bg: '#D1FAE5' },
}

const TRANSPORT = { car: '🚗 Osebni avto', public: '🚌 Javni prevoz', plane: '✈️ Letalo', other: '📍 Drugo' }

function fmt(n: number) { return `€${Number(n).toFixed(2)}` }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('sl-SI') }

const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none', background: '#fff' }

export default function PotniNalogiPage() {
  const router = useRouter()
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [orders, setOrders] = useState<TravelOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Form
  const [employeeName, setEmployeeName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [destination, setDestination] = useState('')
  const [departureDate, setDepartureDate] = useState(new Date().toISOString().split('T')[0])
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0])
  const [transportType, setTransportType] = useState('car')
  const [km, setKm] = useState<number>(0)
  const [kmRate, setKmRate] = useState(0.43)
  const [dailyAllowance, setDailyAllowance] = useState(0)
  const [accommodation, setAccommodation] = useState(0)
  const [otherCosts, setOtherCosts] = useState(0)
  const [notes, setNotes] = useState('')

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500) }

  // Izračun skupaj
  const kmTotal = transportType === 'car' ? km * kmRate : 0
  const total = kmTotal + dailyAllowance + accommodation + otherCosts

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
      if (!member) return
      setOrgId(member.org_id)
      // Pridobi ime lastnika za default
      const { data: profile } = await supabase.from('user_profiles').select('full_name, email').eq('id', user.id).maybeSingle()
      setEmployeeName(profile?.full_name ?? profile?.email ?? '')
      const { data } = await supabase.from('travel_orders').select('*').eq('org_id', member.org_id).order('created_at', { ascending: false })
      setOrders(data ?? [])
      setLoading(false)
    }
    load()
  }, [router, supabase])

  async function saveOrder() {
    if (!orgId || !employeeName.trim() || !purpose.trim() || !destination.trim()) {
      showToast('Izpolnite vsa obvezna polja')
      return
    }
    setSaving(true)
    try {
      const year = new Date().getFullYear()
      const { count } = await supabase.from('travel_orders').select('*', { count: 'exact', head: true }).eq('org_id', orgId).like('order_number', `PN-${year}-%`)
      const seq = String((count ?? 0) + 1).padStart(3, '0')
      const orderNumber = `PN-${year}-${seq}`

      const { data: order } = await supabase.from('travel_orders').insert({
        org_id: orgId,
        order_number: orderNumber,
        employee_name: employeeName.trim(),
        purpose: purpose.trim(),
        destination: destination.trim(),
        departure_date: departureDate,
        return_date: returnDate,
        transport_type: transportType,
        km: transportType === 'car' ? km : null,
        km_rate: kmRate,
        daily_allowance: dailyAllowance,
        accommodation,
        other_costs: otherCosts,
        total: Math.round(total * 100) / 100,
        status: 'draft',
        notes: notes.trim() || null,
      }).select().single()

      setOrders(prev => [order!, ...prev])
      setShowForm(false)
      // Reset
      setPurpose(''); setDestination(''); setKm(0); setDailyAllowance(0); setAccommodation(0); setOtherCosts(0); setNotes('')
      showToast(`Potni nalog ${orderNumber} ustvarjen`)
    } catch (e: any) { showToast(`Napaka: ${e.message}`) }
    setSaving(false)
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('travel_orders').update({ status }).eq('id', id)
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: status as TravelOrder['status'] } : o))
  }

  async function deleteOrder(id: string, num: string) {
    if (!confirm(`Izbrišem potni nalog ${num}?`)) return
    await supabase.from('travel_orders').delete().eq('id', id)
    setOrders(prev => prev.filter(o => o.id !== id))
    showToast('Potni nalog izbrisan')
  }

  const totalPaid = orders.filter(o => o.status === 'paid').reduce((s, o) => s + Number(o.total), 0)
  const pending = orders.filter(o => o.status === 'approved').length

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>Nalagam...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#F7F6F2' }}>
      {/* HEADER */}
      <div style={{ background: '#0D1F12', padding: '20px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#E8B547', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>RAČUNKO</div>
            <div style={{ fontSize: 20, color: '#fff', fontWeight: 500, marginTop: 4 }}>Potni nalogi</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/dashboard" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', padding: '8px 16px', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>← Nazaj</Link>
            <button onClick={() => setShowForm(!showForm)} style={{ background: '#1D9E75', color: '#fff', border: 0, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Nov potni nalog</button>
          </div>
        </div>
        <div style={{ maxWidth: 960, margin: '16px auto 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { label: 'Skupaj nalogov', value: orders.length, color: '#fff' },
            { label: 'Plačano letos', value: fmt(totalPaid), color: '#6EE7B7' },
            { label: 'Čaka na plačilo', value: pending, color: '#FCD34D' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>

        {/* FORM */}
        {showForm && (
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 18 }}>Nov potni nalog</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Zaposleni *</label>
                <input value={employeeName} onChange={e => setEmployeeName(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Namen poti *</label>
                <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Sestanek pri stranki, konferenca..." style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Destinacija *</label>
                <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="Ljubljana, Dunaj..." style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Prevoz</label>
                <select value={transportType} onChange={e => setTransportType(e.target.value)} style={inp}>
                  <option value="car">🚗 Osebni avto</option>
                  <option value="public">🚌 Javni prevoz</option>
                  <option value="plane">✈️ Letalo</option>
                  <option value="other">📍 Drugo</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Datum odhoda</label>
                <input type="date" value={departureDate} onChange={e => setDepartureDate(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Datum vrnitve</label>
                <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} style={inp} />
              </div>
            </div>

            {/* Stroški */}
            <div style={{ background: '#F7F6F2', borderRadius: 10, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 12 }}>Stroški poti</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {transportType === 'car' && (
                  <>
                    <div>
                      <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Kilometri (km)</label>
                      <input type="number" min="0" value={km} onChange={e => setKm(Number(e.target.value))} style={inp} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>€/km (država: €0.43)</label>
                      <input type="number" step="0.01" value={kmRate} onChange={e => setKmRate(Number(e.target.value))} style={inp} />
                    </div>
                  </>
                )}
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Dnevnica (€)</label>
                  <input type="number" step="0.01" min="0" value={dailyAllowance} onChange={e => setDailyAllowance(Number(e.target.value))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Nastanitev (€)</label>
                  <input type="number" step="0.01" min="0" value={accommodation} onChange={e => setAccommodation(Number(e.target.value))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Ostali stroški (€)</label>
                  <input type="number" step="0.01" min="0" value={otherCosts} onChange={e => setOtherCosts(Number(e.target.value))} style={inp} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ background: '#0D1F12', borderRadius: 8, padding: '10px 16px', width: '100%' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>SKUPAJ</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#E8B547' }}>€{total.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Opombe</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8, padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}>Prekliči</button>
              <button onClick={saveOrder} disabled={saving} style={{ background: '#0D1F12', color: '#fff', border: 0, borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Shranjujem...' : '✓ Shrani potni nalog'}
              </button>
            </div>
          </div>
        )}

        {/* LISTA */}
        {orders.length === 0 && !showForm ? (
          <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', border: '0.5px solid rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🚗</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0D1F12', marginBottom: 8 }}>Ni potnih nalogov</div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 24 }}>€0.43/km za osebni avto · dnevnice · nastanitev</div>
            <button onClick={() => setShowForm(true)} style={{ background: '#0D1F12', color: '#fff', border: 0, borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>+ Nov potni nalog →</button>
          </div>
        ) : orders.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F7F6F2', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                  {['Številka', 'Zaposleni', 'Namen', 'Destinacija', 'Datum', 'Prevoz', 'Skupaj', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#888', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(o => {
                  const s = STATUS[o.status]
                  return (
                    <tr key={o.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                      <td style={{ padding: '12px 12px', fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: '#0D1F12' }}>{o.order_number}</td>
                      <td style={{ padding: '12px 12px', fontSize: 13, color: '#0D1F12' }}>{o.employee_name}</td>
                      <td style={{ padding: '12px 12px', fontSize: 12, color: '#666', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.purpose}</td>
                      <td style={{ padding: '12px 12px', fontSize: 13, color: '#0D1F12' }}>{o.destination}</td>
                      <td style={{ padding: '12px 12px', fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>
                        {fmtDate(o.departure_date)}
                        {o.departure_date !== o.return_date && ` – ${fmtDate(o.return_date)}`}
                      </td>
                      <td style={{ padding: '12px 12px', fontSize: 12, color: '#666' }}>
                        {TRANSPORT[o.transport_type as keyof typeof TRANSPORT]?.split(' ')[0]}
                        {o.km ? ` ${o.km}km` : ''}
                      </td>
                      <td style={{ padding: '12px 12px', fontSize: 13, fontWeight: 700, color: '#0D1F12' }}>{fmt(o.total)}</td>
                      <td style={{ padding: '12px 12px' }}>
                        <select value={o.status} onChange={e => updateStatus(o.id, e.target.value)} style={{ fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, border: 0, borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>
                          <option value="draft">Osnutek</option>
                          <option value="approved">Odobren</option>
                          <option value="paid">Plačan</option>
                        </select>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <button onClick={() => deleteOrder(o.id, o.order_number)} style={{ background: 'none', border: 0, color: '#aaa', cursor: 'pointer', fontSize: 16 }}>🗑</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#0D1F12', color: '#fff', padding: '12px 20px', borderRadius: 999, fontSize: 13, fontWeight: 500, zIndex: 3000 }}>✓ {toast}</div>
      )}
    </div>
  )
}
