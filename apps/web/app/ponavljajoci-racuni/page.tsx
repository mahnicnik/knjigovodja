'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'

interface RecurringInvoice {
  id: string
  client_name: string
  client_email: string | null
  line_items: any[]
  amount_total: number
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  next_issue_date: string
  end_date: string | null
  is_active: boolean
  last_issued_at: string | null
}

const FREQ = {
  weekly:    { label: 'Tedensko',    days: 7 },
  monthly:   { label: 'Mesečno',     days: 30 },
  quarterly: { label: 'Četrtletno',  days: 90 },
  yearly:    { label: 'Letno',       days: 365 },
}

const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none', background: '#fff' }
function fmt(n: number) { return `€${Number(n).toFixed(2)}` }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('sl-SI') }

export default function PonavljajoceRacunePage() {
  const router = useRouter()
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [recurring, setRecurring] = useState<RecurringInvoice[]>([])
  const [isVatRegistered, setIsVatRegistered] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [issuing, setIssuing] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Form
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [frequency, setFrequency] = useState<'weekly'|'monthly'|'quarterly'|'yearly'>('monthly')
  const [nextDate, setNextDate] = useState(new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0])
  const [endDate, setEndDate] = useState('')
  const [description, setDescription] = useState('')
  const [unitPrice, setUnitPrice] = useState(0)
  const [vatRate, setVatRate] = useState(0)

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500) }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
      if (!member) return
      setOrgId(member.org_id)
      const { data: org } = await supabase.from('organizations').select('vat_registered').eq('id', member.org_id).single()
      setIsVatRegistered(org?.vat_registered ?? false)
      if (org?.vat_registered) setVatRate(22)
      const { data } = await supabase.from('recurring_invoices').select('*').eq('org_id', member.org_id).order('created_at', { ascending: false })
      setRecurring(data ?? [])
      setLoading(false)
    }
    load()
  }, [router, supabase])

  async function saveRecurring() {
    if (!orgId || !clientName.trim() || !description.trim() || unitPrice <= 0) {
      showToast('Izpolnite vsa obvezna polja')
      return
    }
    setSaving(true)
    try {
      const amountNet = unitPrice
      const vatAmount = unitPrice * (vatRate / 100)
      const amountTotal = amountNet + vatAmount

      const lineItems = [{ description, quantity: 1, unit_price: unitPrice, vat_rate: vatRate, amount_net: amountNet, vat_amount: vatAmount }]

      const { data: rec } = await supabase.from('recurring_invoices').insert({
        org_id: orgId,
        client_name: clientName.trim(),
        client_email: clientEmail.trim() || null,
        line_items: lineItems,
        amount_net: amountNet,
        vat_amount: vatAmount,
        amount_total: amountTotal,
        frequency,
        next_issue_date: nextDate,
        end_date: endDate || null,
        is_active: true,
      }).select().single()

      setRecurring(prev => [rec!, ...prev])
      setShowForm(false)
      setClientName(''); setClientEmail(''); setDescription(''); setUnitPrice(0)
      showToast('Ponavljajoč račun nastavljen')
    } catch (e: any) { showToast(e.message) }
    setSaving(false)
  }

  async function issueNow(rec: RecurringInvoice) {
    if (!orgId) return
    setIssuing(rec.id)
    try {
      const year = new Date().getFullYear()
      const { count } = await supabase.from('issued_invoices').select('*', { count: 'exact', head: true }).eq('org_id', orgId).like('invoice_number', `${year}-%`)
      const seq = String((count ?? 0) + 1).padStart(4, '0')
      const invoiceNumber = `${year}-${seq}`
      const today = new Date().toISOString().split('T')[0]
      const due = new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0]

      await supabase.from('issued_invoices').insert({
        org_id: orgId,
        invoice_number: invoiceNumber,
        invoice_type: 'invoice',
        client_name: rec.client_name,
        client_email: rec.client_email,
        issue_date: today,
        due_date: due,
        line_items: rec.line_items,
        amount_net: rec.amount_total / (1 + (rec.line_items[0]?.vat_rate ?? 0) / 100),
        vat_amount: rec.amount_total - rec.amount_total / (1 + (rec.line_items[0]?.vat_rate ?? 0) / 100),
        amount_total: rec.amount_total,
        status: 'draft',
        notes: `Ponavljajoč račun — ${FREQ[rec.frequency].label}`,
      })

      // Nastavi naslednji datum
      const nextDays = FREQ[rec.frequency].days
      const nextDate = new Date(Date.now() + nextDays * 864e5).toISOString().split('T')[0]
      await supabase.from('recurring_invoices').update({ last_issued_at: new Date().toISOString(), next_issue_date: nextDate }).eq('id', rec.id)
      setRecurring(prev => prev.map(r => r.id === rec.id ? { ...r, last_issued_at: new Date().toISOString(), next_issue_date: nextDate } : r))
      showToast(`Račun ${invoiceNumber} izdan`)
    } catch (e: any) { showToast(e.message) }
    setIssuing(null)
  }

  async function toggleActive(id: string, is_active: boolean) {
    await supabase.from('recurring_invoices').update({ is_active: !is_active }).eq('id', id)
    setRecurring(prev => prev.map(r => r.id === id ? { ...r, is_active: !is_active } : r))
  }

  async function deleteRecurring(id: string) {
    if (!confirm('Izbrišem ponavljajoč račun?')) return
    await supabase.from('recurring_invoices').delete().eq('id', id)
    setRecurring(prev => prev.filter(r => r.id !== id))
  }

  const dueToday = recurring.filter(r => r.is_active && r.next_issue_date <= new Date().toISOString().split('T')[0])
  const monthlyTotal = recurring.filter(r => r.is_active).reduce((s, r) => {
    const multiplier = r.frequency === 'weekly' ? 4 : r.frequency === 'quarterly' ? 1/3 : r.frequency === 'yearly' ? 1/12 : 1
    return s + r.amount_total * multiplier
  }, 0)

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>Nalagam...</div>

  return (
    <AppLayout>
    <div style={{ minHeight: '100vh', background: '#F7F6F2' }}>
      <div style={{ background: '#0D1F12', padding: '20px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#E8B547', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>RAČUNKO</div>
            <div style={{ fontSize: 20, color: '#fff', fontWeight: 500, marginTop: 4 }}>Ponavljajoči računi</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/dashboard" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', padding: '8px 16px', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>← Nazaj</Link>
            <button onClick={() => setShowForm(!showForm)} style={{ background: '#1D9E75', color: '#fff', border: 0, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Nov ponavljajoč račun</button>
          </div>
        </div>

        {dueToday.length > 0 && (
          <div style={{ maxWidth: 960, margin: '12px auto 0', background: 'rgba(232,181,71,0.15)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#FCD34D' }}>
            ⏰ <strong>{dueToday.length} računov</strong> čaka na izdajo danes
          </div>
        )}

        <div style={{ maxWidth: 960, margin: '16px auto 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { label: 'Aktivnih naročnin', value: recurring.filter(r => r.is_active).length, color: '#fff' },
            { label: 'Mesečni prihodek', value: fmt(monthlyTotal), color: '#6EE7B7' },
            { label: 'Za izdati danes', value: dueToday.length, color: dueToday.length > 0 ? '#FCD34D' : '#6EE7B7' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>

        {showForm && (
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 18 }}>Nov ponavljajoč račun</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Stranka *</label>
                <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="ABC d.o.o." style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Email stranke</label>
                <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="info@abc.si" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Opis storitve *</label>
                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Mesečna naročnina, vzdrževanje..." style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Cena (€) *</label>
                <input type="number" step="0.01" min="0" value={unitPrice} onChange={e => setUnitPrice(Number(e.target.value))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Pogostost</label>
                <select value={frequency} onChange={e => setFrequency(e.target.value as any)} style={inp}>
                  <option value="weekly">Tedensko</option>
                  <option value="monthly">Mesečno</option>
                  <option value="quarterly">Četrtletno</option>
                  <option value="yearly">Letno</option>
                </select>
              </div>
              {isVatRegistered && (
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>DDV %</label>
                  <select value={vatRate} onChange={e => setVatRate(Number(e.target.value))} style={inp}>
                    <option value={0}>0%</option>
                    <option value={9.5}>9.5%</option>
                    <option value={22}>22%</option>
                  </select>
                </div>
              )}
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Naslednja izdaja</label>
                <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Datum konca (opcijsko)</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inp} />
              </div>
            </div>

            {unitPrice > 0 && (
              <div style={{ background: '#F7F6F2', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#666' }}>
                Skupaj z DDV: <strong>{fmt(unitPrice * (1 + vatRate / 100))}</strong> · {FREQ[frequency].label}
                {frequency !== 'monthly' && <span> · ≈ {fmt(unitPrice * (1 + vatRate / 100) * (frequency === 'weekly' ? 4 : frequency === 'quarterly' ? 1/3 : 1/12))}/mes</span>}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8, padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}>Prekliči</button>
              <button onClick={saveRecurring} disabled={saving} style={{ background: '#0D1F12', color: '#fff', border: 0, borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Shranjujem...' : '✓ Nastavi ponavljajoč račun'}
              </button>
            </div>
          </div>
        )}

        {recurring.length === 0 && !showForm ? (
          <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', border: '0.5px solid rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔄</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0D1F12', marginBottom: 8 }}>Ni ponavljajočih računov</div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 24 }}>Za mesečne naročnine, vzdrževanje in redno fakturiranje</div>
            <button onClick={() => setShowForm(true)} style={{ background: '#0D1F12', color: '#fff', border: 0, borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>+ Nov ponavljajoč račun →</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recurring.map(r => {
              const isDue = r.is_active && r.next_issue_date <= new Date().toISOString().split('T')[0]
              return (
                <div key={r.id} style={{ background: '#fff', borderRadius: 14, border: `0.5px solid ${isDue ? 'rgba(232,181,71,0.4)' : 'rgba(0,0,0,0.08)'}`, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', opacity: r.is_active ? 1 : 0.5 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: r.is_active ? '#E1F5EE' : '#F3F4F6', display: 'grid', placeItems: 'center', fontSize: 20, flexShrink: 0 }}>🔄</div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12' }}>{r.client_name}</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                      {r.line_items[0]?.description} · {FREQ[r.frequency].label}
                    </div>
                    <div style={{ fontSize: 11, color: isDue ? '#E8B547' : '#aaa', marginTop: 2 }}>
                      {isDue ? '⏰ Za izdati danes' : `Naslednja: ${fmtDate(r.next_issue_date)}`}
                      {r.last_issued_at && ` · Zadnja: ${fmtDate(r.last_issued_at)}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#0D1F12' }}>{fmt(r.amount_total)}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{FREQ[r.frequency].label}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {isDue && (
                      <button onClick={() => issueNow(r)} disabled={issuing === r.id} style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: '#1D9E75', border: 0, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', whiteSpace: 'nowrap', opacity: issuing === r.id ? 0.6 : 1 }}>
                        {issuing === r.id ? '...' : '→ Izdaj zdaj'}
                      </button>
                    )}
                    <button onClick={() => toggleActive(r.id, r.is_active)} style={{ fontSize: 12, color: r.is_active ? '#D97706' : '#1D9E75', background: r.is_active ? '#FEF3C7' : '#E1F5EE', border: 0, borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>
                      {r.is_active ? 'Pavziraj' : 'Aktiviraj'}
                    </button>
                    <button onClick={() => deleteRecurring(r.id)} style={{ background: 'none', border: 0, color: '#aaa', cursor: 'pointer', fontSize: 16, padding: '4px 6px' }}>🗑</button>
                  </div>
                </div>
              )
            })}
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
