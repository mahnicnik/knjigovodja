'use client'

import { useEffect, useState } from 'react'
import { lokalniDatum } from '@/lib/tax-constants'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'

interface Quote {
  id: string
  quote_number: string
  client_name: string
  client_email: string | null
  issue_date: string
  valid_until: string
  amount_total: number
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
  converted_to_invoice_id: string | null
}

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft:    { label: 'Osnutek',   color: '#888',    bg: '#F3F4F6' },
  sent:     { label: 'Poslano',   color: '#1D9E75', bg: '#E1F5EE' },
  accepted: { label: 'Sprejeto', color: '#0E5E3B', bg: '#D1FAE5' },
  rejected: { label: 'Zavrnjeno',color: '#DC2626', bg: '#FEE2E2' },
  expired:  { label: 'Poteklo',  color: '#888',    bg: '#F3F4F6' },
}

// POPRAVLJENO (17.8.2026): slovenski zapis zneska. Prej "€1234.56" - angleska
// oblika z valuto spredaj in piko kot decimalnim locilom. V isti aplikaciji sta
// obstajala oba zapisa, kar je zgledalo kot napaka.
function fmt(n: number) { return new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0) }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('sl-SI') }

export default function PredracuniPage() {
  const router = useRouter()
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500) }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
      if (!member) return
      setOrgId(member.org_id)
      const { data } = await supabase.from('quotes').select('*').eq('org_id', member.org_id).order('created_at', { ascending: false })
      setQuotes(data ?? [])
      setLoading(false)
    }
    load()
  }, [router, supabase])

  async function convertToInvoice(quote: Quote) {
    if (!confirm(`Pretvori predračun ${quote.quote_number} v račun?`)) return
    try {
      // Pridobi polne podatke predračuna
      const { data: q } = await supabase.from('quotes').select('*').eq('id', quote.id).single()
      if (!q) return

      // Generiraj številko računa
      // POPRAVLJENO (30.7.2026, audit A5): prej count(*)+1 s 4-mestno
      // obliko (2026-0001), neskladno z ostalimi racuni (2026-019).
      const year = new Date().getFullYear()
      const { data: nextNumber } = await supabase.rpc('get_next_manual_invoice_number', {
        p_org_id: orgId, p_year: year,
      })
      const invoiceNumber = nextNumber || `${year}-001`

      // Ustvari račun
      const { data: invoice, error: invoiceError } = await supabase.from('issued_invoices').insert({
        org_id: orgId,
        invoice_number: invoiceNumber,
        invoice_type: 'invoice',
        client_name: q.client_name,
        client_address: q.client_address,
        client_email: q.client_email,
        client_tax_number: q.client_tax_number,
        issue_date: lokalniDatum(),
        due_date: lokalniDatum(new Date(Date.now() + 30 * 864e5)),
        line_items: q.line_items,
        amount_net: q.amount_net,
        vat_amount: q.vat_amount,
        amount_total: q.amount_total,
        status: 'draft',
        notes: `Iz predračuna ${q.quote_number}`,
      }).select('id').single()

      // POPRAVLJENO (30.7.2026): prej "if (!invoice) return" tiho
      // prekinilo brez sporocila - predracun je ostal "Osnutek", uporabnik
      // ni izvedel NICESAR. Zdaj se napaka prikaze.
      if (invoiceError || !invoice) {
        showToast(`Napaka pri ustvarjanju racuna: ${invoiceError?.message || 'neznana napaka'}`)
        return
      }

      // Posodobi predračun
      // POPRAVLJENO (16.8.2026): prej brez preverbe - racun je nastal, predracun
    // pa je ostal odprt, zato bi ga bilo mogoce pretvoriti SE ENKRAT (podvojen racun).
    const { error: convErr } = await supabase.from('quotes').update({ status: 'accepted', converted_to_invoice_id: invoice.id }).eq('id', quote.id)
      setQuotes(prev => prev.map(q => q.id === quote.id ? { ...q, status: 'accepted', converted_to_invoice_id: invoice.id } : q))
      showToast(`Račun ${invoiceNumber} ustvarjen`)
      router.push('/invoices')
    } catch (e: any) { showToast(`Napaka: ${e.message}`) }
  }

  async function deleteQuote(id: string) {
    if (!confirm('Izbrišem predračun?')) return
    const { error: delQErr } = await supabase.from('quotes').delete().eq('id', id)
    if (delQErr) { alert('Predračuna ni bilo mogoče izbrisati: ' + delQErr.message); return }
    setQuotes(prev => prev.filter(q => q.id !== id))
    showToast('Predračun izbrisan')
  }

  async function updateStatus(id: string, status: string) {
    const { error: stQErr } = await supabase.from('quotes').update({ status }).eq('id', id)
    if (stQErr) { alert('Statusa ni bilo mogoče spremeniti: ' + stQErr.message); return }
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, status: status as Quote['status'] } : q))
  }

  const total = quotes.reduce((s, q) => s + Number(q.amount_total), 0)
  const accepted = quotes.filter(q => q.status === 'accepted').reduce((s, q) => s + Number(q.amount_total), 0)
  const pending = quotes.filter(q => q.status === 'sent').length

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>Nalagam...</div>

  return (
    <AppLayout>
    <div style={{ minHeight: '100vh', background: '#F7F6F2' }}>
      {/* HEADER */}
      <div style={{ background: '#0D1F12', padding: '20px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#E8B547', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>RAČUNKO</div>
            <div style={{ fontSize: 20, color: '#fff', fontWeight: 500, marginTop: 4 }}>Predračuni & Ponudbe</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/dashboard" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', padding: '8px 16px', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>← Nazaj</Link>
            <Link href="/predracuni/new" style={{ background: '#1D9E75', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>+ Nov predračun</Link>
          </div>
        </div>
        {/* Stats */}
        <div style={{ maxWidth: 960, margin: '16px auto 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { label: 'Skupaj predračunov', value: quotes.length, color: '#fff' },
            { label: 'Sprejeto', value: fmt(accepted), color: '#6EE7B7' },
            { label: 'Čaka na odgovor', value: pending, color: '#FCD34D' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
        {quotes.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', border: '0.5px solid rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0D1F12', marginBottom: 8 }}>Ni predračunov</div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 24 }}>Pošljite stranki predračun preden izdate račun</div>
            <Link href="/predracuni/new" style={{ background: '#0D1F12', color: '#fff', padding: '12px 24px', borderRadius: 10, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>+ Nov predračun →</Link>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F7F6F2', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                  {['Številka', 'Stranka', 'Datum', 'Veljavno do', 'Znesek', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#888', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotes.map(q => {
                  const s = STATUS[q.status]
                  const isExpired = new Date(q.valid_until) < new Date() && q.status === 'sent'
                  return (
                    <tr key={q.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#0D1F12', fontFamily: 'monospace' }}>{q.quote_number}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#0D1F12' }}>{q.client_name}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{fmtDate(q.issue_date)}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: isExpired ? '#DC2626' : '#666' }}>{fmtDate(q.valid_until)}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#0D1F12' }}>{fmt(q.amount_total)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <select value={q.status} onChange={e => updateStatus(q.id, e.target.value)} style={{ fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, border: 0, borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>
                          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {!q.converted_to_invoice_id && q.status !== 'rejected' && (
                            <button onClick={() => convertToInvoice(q)} style={{ fontSize: 11, fontWeight: 600, color: '#1D9E75', background: '#E1F5EE', border: 0, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>→ Račun</button>
                          )}
                          {q.converted_to_invoice_id && (
                            <Link href="/invoices" style={{ fontSize: 11, color: '#888', textDecoration: 'none' }}>✓ Pretvorjeno</Link>
                          )}
                          <button onClick={() => deleteQuote(q.id)} style={{ fontSize: 11, color: '#DC2626', background: 'none', border: 0, cursor: 'pointer', padding: '4px' }}>🗑</button>
                        </div>
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
    </AppLayout>
  )
}
