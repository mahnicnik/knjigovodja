'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'

interface Invoice {
  id: string
  invoice_number: string
  client_name: string
  client_email: string | null
  issue_date: string
  due_date: string
  amount_total: number
  advance_amount: number | null
  invoice_subtype: 'standard' | 'advance' | 'final'
  status: string
  line_items: any[]
}

function fmt(n: number) { return `€${Number(n).toFixed(2)}` }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('sl-SI') }
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none', background: '#fff' }

export default function AvansniRacuniPage() {
  const router = useRouter()
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [isVatRegistered, setIsVatRegistered] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'advance' | 'final' | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Form za avansni račun
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [description, setDescription] = useState('')
  const [totalAmount, setTotalAmount] = useState(0)
  const [advancePct, setAdvancePct] = useState(50)
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 15 * 864e5).toISOString().split('T')[0])

  // Za finalni račun
  const [selectedAdvance, setSelectedAdvance] = useState<Invoice | null>(null)

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
      const { data } = await supabase
        .from('issued_invoices')
        .select('*')
        .eq('org_id', member.org_id)
        .in('invoice_subtype', ['advance', 'final'])
        .order('created_at', { ascending: false })
      setInvoices(data ?? [])
      setLoading(false)
    }
    load()
  }, [router, supabase])

  async function saveAdvance() {
    if (!orgId || !clientName.trim() || totalAmount <= 0) { showToast('Izpolnite vsa polja'); return }
    setSaving(true)
    try {
      const advanceAmount = Math.round(totalAmount * (advancePct / 100) * 100) / 100
      const amountNet = isVatRegistered ? advanceAmount / 1.22 : advanceAmount
      const vatAmount = advanceAmount - amountNet

      const year = new Date().getFullYear()
      const { count } = await supabase.from('issued_invoices').select('*', { count: 'exact', head: true }).eq('org_id', orgId).like('invoice_number', `AVA-${year}-%`)
      const seq = String((count ?? 0) + 1).padStart(3, '0')

      const { data: inv, error: invErr } = await supabase.from('issued_invoices').insert({
        org_id: orgId,
        invoice_number: `AVA-${year}-${seq}`,
        invoice_type: 'invoice',
        invoice_subtype: 'advance',
        client_name: clientName.trim(),
        client_email: clientEmail.trim() || null,
        issue_date: issueDate,
        due_date: dueDate,
        line_items: [{ description: `Avans za: ${description}`, quantity: 1, unit_price: advanceAmount, amount_net: amountNet, vat_rate: isVatRegistered ? 22 : 0, vat_amount: vatAmount }],
        amount_net: Math.round(amountNet * 100) / 100,
        vat_amount: Math.round(vatAmount * 100) / 100,
        amount_total: advanceAmount,
        advance_amount: advanceAmount,
        total_contract_value: totalAmount,
        status: 'draft',
        notes: `Avansni račun ${advancePct}% od skupne vrednosti ${fmt(totalAmount)}`,
      }).select().single()
      // POPRAVLJENO (16.8.2026): prej brez preverbe - ce racun ni nastal, je
      // "inv" null, seznam pa je dobil prazen zapis, uporabnik pa potrditev.
      if (invErr || !inv) throw new Error('Avansnega računa ni bilo mogoče izdati: ' + (invErr?.message || 'neznana napaka'))

      setInvoices(prev => [inv, ...prev])
      setModal(null)
      setClientName(''); setClientEmail(''); setDescription(''); setTotalAmount(0); setAdvancePct(50)
      showToast(`Avansni račun AVA-${year}-${seq} ustvarjen`)
    } catch (e: any) { showToast(e.message) }
    setSaving(false)
  }

  async function saveFinal(advance: Invoice) {
    if (!orgId) return
    setSaving(true)
    try {
      const contractValue = (advance as any).total_contract_value ?? advance.amount_total
      const remaining = contractValue - (advance.advance_amount ?? 0)
      const amountNet = isVatRegistered ? remaining / 1.22 : remaining
      const vatAmount = remaining - amountNet

      // POPRAVLJENO (30.7.2026, audit A5): koncni racun po avansu spada v
      // GLAVNO serijo - prej 4-mestna oblika (2026-0001), neskladna.
      const year = new Date().getFullYear()
      const { data: nextNumber } = await supabase.rpc('get_next_manual_invoice_number', {
        p_org_id: orgId, p_year: year,
      })
      const finalInvoiceNumber = nextNumber || `${year}-001`
      const today = new Date().toISOString().split('T')[0]

      const { data: inv, error: invErr } = await supabase.from('issued_invoices').insert({
        org_id: orgId,
        invoice_number: finalInvoiceNumber,
        invoice_type: 'invoice',
        invoice_subtype: 'final',
        client_name: advance.client_name,
        client_email: advance.client_email,
        issue_date: today,
        due_date: new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0],
        line_items: [
          { description: advance.line_items[0]?.description?.replace('Avans za: ', '') ?? 'Storitev', quantity: 1, unit_price: contractValue, amount_net: isVatRegistered ? contractValue / 1.22 : contractValue, vat_rate: isVatRegistered ? 22 : 0, vat_amount: isVatRegistered ? contractValue - contractValue / 1.22 : 0 },
          { description: `Odbitek avansa (${advance.invoice_number})`, quantity: 1, unit_price: -(advance.advance_amount ?? 0), amount_net: isVatRegistered ? -(advance.advance_amount ?? 0) / 1.22 : -(advance.advance_amount ?? 0), vat_rate: isVatRegistered ? 22 : 0, vat_amount: isVatRegistered ? -(advance.advance_amount ?? 0) + (advance.advance_amount ?? 0) / 1.22 : 0 },
        ],
        amount_net: Math.round(amountNet * 100) / 100,
        vat_amount: Math.round(vatAmount * 100) / 100,
        amount_total: Math.round(remaining * 100) / 100,
        advance_invoice_id: advance.id,
        status: 'draft',
        notes: `Finalni račun — odbitek avansa ${advance.invoice_number} (${fmt(advance.advance_amount ?? 0)})`,
      }).select().single()
      // POPRAVLJENO (16.8.2026): prej brez preverbe - ce racun ni nastal, je
      // "inv" null, seznam pa je dobil prazen zapis, uporabnik pa potrditev.
      if (invErr || !inv) throw new Error('Finalnega računa ni bilo mogoče izdati: ' + (invErr?.message || 'neznana napaka'))

      setInvoices(prev => [inv, ...prev])
      setSelectedAdvance(null)
      setModal(null)
      showToast(`Finalni račun ${finalInvoiceNumber} ustvarjen`)
    } catch (e: any) { showToast(e.message) }
    setSaving(false)
  }

  const advanceInvoices = invoices.filter(i => i.invoice_subtype === 'advance')
  const finalInvoices = invoices.filter(i => i.invoice_subtype === 'final')
  const advanceAmount = Number(((totalAmount * advancePct) / 100).toFixed(2))

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>Nalagam...</div>

  return (
    <AppLayout>
    <div style={{ minHeight: '100vh', background: '#F7F6F2' }}>
      {/* HEADER */}
      <div style={{ background: '#0D1F12', padding: '20px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#E8B547', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>RAČUNKO</div>
            <div style={{ fontSize: 20, color: '#fff', fontWeight: 500, marginTop: 4 }}>Avansni računi</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/dashboard" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', padding: '8px 16px', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>← Domov</Link>
            <button onClick={() => setModal('advance')} style={{ background: '#1D9E75', color: '#fff', border: 0, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Nov avansni račun</button>
          </div>
        </div>
        <div style={{ maxWidth: 960, margin: '16px auto 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { label: 'Avansnih računov', value: advanceInvoices.length, color: '#fff' },
            { label: 'Finalnih računov', value: finalInvoices.length, color: '#6EE7B7' },
            { label: 'Odprtih avansov', value: advanceInvoices.filter(i => !finalInvoices.some(f => (f as any).advance_invoice_id === i.id)).length, color: '#FCD34D' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>

        {/* INFO */}
        <div style={{ background: '#E1F5EE', borderRadius: 12, padding: '14px 18px', marginBottom: 16, fontSize: 13, color: '#0E5E3B', lineHeight: 1.6 }}>
          💡 <strong>Avansni račun</strong> se izda pred opravljeno storitvijo (predplačilo). Ko je storitev opravljena, izdate <strong>finalni račun</strong> z odbitkom avansa.
        </div>

        {invoices.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', border: '0.5px solid rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💰</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0D1F12', marginBottom: 8 }}>Ni avansnih računov</div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 24 }}>Izdate avansni račun ko stranka plača predujme</div>
            <button onClick={() => setModal('advance')} style={{ background: '#0D1F12', color: '#fff', border: 0, borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>+ Nov avansni račun →</button>
          </div>
        ) : (
          <>
            {/* AVANSNI RAČUNI */}
            {advanceInvoices.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>Avansni računi</div>
                <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#F7F6F2', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                        {['Številka', 'Stranka', 'Datum', 'Avans', 'Skupaj', 'Status', ''].map(h => (
                          <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#888', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {advanceInvoices.map(inv => {
                        const hasFinal = finalInvoices.some(f => (f as any).advance_invoice_id === inv.id)
                        return (
                          <tr key={inv.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                            <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: '#E8B547' }}>{inv.invoice_number}</td>
                            <td style={{ padding: '12px 14px', fontSize: 13 }}>{inv.client_name}</td>
                            <td style={{ padding: '12px 14px', fontSize: 12, color: '#666' }}>{fmtDate(inv.issue_date)}</td>
                            <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#1D9E75' }}>{fmt(inv.advance_amount ?? inv.amount_total)}</td>
                            <td style={{ padding: '12px 14px', fontSize: 13, color: '#888' }}>{fmt(inv.amount_total)}</td>
                            <td style={{ padding: '12px 14px' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: hasFinal ? '#E1F5EE' : '#FEF3C7', color: hasFinal ? '#0E5E3B' : '#D97706' }}>
                                {hasFinal ? '✓ Finaliziran' : 'Odprt'}
                              </span>
                            </td>
                            <td style={{ padding: '12px 10px' }}>
                              {!hasFinal && (
                                <button onClick={() => { setSelectedAdvance(inv); setModal('final') }} style={{ fontSize: 11, fontWeight: 600, color: '#0D1F12', background: '#F7F6F2', border: 0, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  → Finalni račun
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* FINALNI RAČUNI */}
            {finalInvoices.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>Finalni računi</div>
                <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#F7F6F2', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                        {['Številka', 'Stranka', 'Datum', 'Preostalo', 'Status'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#888', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {finalInvoices.map(inv => (
                        <tr key={inv.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                          <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: '#1D9E75' }}>{inv.invoice_number}</td>
                          <td style={{ padding: '12px 14px', fontSize: 13 }}>{inv.client_name}</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: '#666' }}>{fmtDate(inv.issue_date)}</td>
                          <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{fmt(inv.amount_total)}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: inv.status === 'paid' ? '#E1F5EE' : '#F3F4F6', color: inv.status === 'paid' ? '#0E5E3B' : '#888' }}>
                              {inv.status === 'paid' ? '✓ Plačano' : 'Čaka plačilo'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* AVANSNI MODAL */}
      {modal === 'advance' && (
        <div onClick={e => { if (e.target === e.currentTarget) setModal(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500, padding: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>💰 Nov avansni račun</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Stranka *</label>
                <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Podjetje d.o.o." style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Email</label>
                <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="info@podjetje.si" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Opis storitve *</label>
                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Razvoj spletne strani, projekt X..." style={inp} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Skupna vrednost (€) *</label>
                  <input type="number" step="0.01" value={totalAmount || ''} onChange={e => setTotalAmount(e.target.value === '' ? 0 : Number(e.target.value))} placeholder="0.00" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Delež avansa (%)</label>
                  <select value={advancePct} onChange={e => setAdvancePct(Number(e.target.value))} style={inp}>
                    {[10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100].map(p => <option key={p} value={p}>{p}%</option>)}
                  </select>
                </div>
              </div>
              {totalAmount > 0 && (
                <div style={{ background: '#F7F6F2', borderRadius: 8, padding: '12px 14px', fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: '#666' }}>Avans ({advancePct}%)</span>
                    <strong style={{ color: '#1D9E75' }}>{fmt(advanceAmount)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#666' }}>Preostalo</span>
                    <span>{fmt(totalAmount - advanceAmount)}</span>
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Datum</label>
                  <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Rok plačila</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inp} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setModal(null)} style={{ padding: '9px 16px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.12)', fontSize: 13, cursor: 'pointer', background: '#fff' }}>Prekliči</button>
              <button onClick={saveAdvance} disabled={saving} style={{ background: '#0D1F12', color: '#fff', border: 0, borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Ustvarjam...' : 'Ustvari avansni račun'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FINALNI MODAL */}
      {modal === 'final' && selectedAdvance && (
        <div onClick={e => { if (e.target === e.currentTarget) { setModal(null); setSelectedAdvance(null) } }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460, padding: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>📄 Finalni račun</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Na podlagi avansa {selectedAdvance.invoice_number}</div>
            <div style={{ background: '#F7F6F2', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: '#666' }}>Skupna vrednost</span>
                <strong>{fmt(selectedAdvance.amount_total)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: '#666' }}>Odbitek avansa ({selectedAdvance.invoice_number})</span>
                <span style={{ color: '#DC2626' }}>−{fmt(selectedAdvance.advance_amount ?? 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, borderTop: '0.5px solid rgba(0,0,0,0.1)', paddingTop: 8 }}>
                <span>Preostalo za plačilo</span>
                <span style={{ color: '#1D9E75' }}>{fmt(selectedAdvance.amount_total - (selectedAdvance.advance_amount ?? 0))}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setModal(null); setSelectedAdvance(null) }} style={{ padding: '9px 16px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.12)', fontSize: 13, cursor: 'pointer', background: '#fff' }}>Prekliči</button>
              <button onClick={() => saveFinal(selectedAdvance)} disabled={saving} style={{ background: '#1D9E75', color: '#fff', border: 0, borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Ustvarjam...' : 'Ustvari finalni račun'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#0D1F12', color: '#fff', padding: '12px 20px', borderRadius: 999, fontSize: 13, fontWeight: 500, zIndex: 3000 }}>✓ {toast}</div>
      )}
    </div>
    </AppLayout>
  )
}
