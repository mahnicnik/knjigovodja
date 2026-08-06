'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import SendInvoiceModal from '@/components/SendInvoiceModal'
import { getActiveMembership } from '@/lib/active-org'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionInv, setActionInv] = useState<any>(null)
  const [actionLoading, setActionLoading] = useState('')
  const [sendModalInv, setSendModalInv] = useState<any>(null)
  const [sendSuccess, setSendSuccess] = useState('')
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
    if (member) {
      const o = (member as any).organizations
      setOrg(o)
      const { data: inv } = await supabase
        .from('issued_invoices').select('*')
        .eq('org_id', o.id)
        .order('created_at', { ascending: false })
      setInvoices(inv || [])
    }
    setLoading(false)
  }

  async function markPaid(inv: any) {
    setActionLoading('paid_' + inv.id)
    await supabase.from('issued_invoices').update({ status: 'paid' }).eq('id', inv.id)
    await load()
    setActionLoading('')
    setActionInv(null)
  }

  async function markSent(inv: any) {
    setActionLoading('sent_' + inv.id)
    await supabase.from('issued_invoices').update({ status: 'sent' }).eq('id', inv.id)
    await load()
    setActionLoading('')
    setActionInv(null)
  }

  async function storno(inv: any) {
    setActionLoading('storno_' + inv.id)
    const stornoNumber = `${inv.invoice_number}-S`
    const lineItems = (inv.line_items || []).map((item: any) => ({
      ...item,
      unit_price: -Math.abs(item.unit_price),
    }))
    await supabase.from('issued_invoices').insert({
      org_id: inv.org_id,
      invoice_number: stornoNumber,
      client_name: inv.client_name,
      client_email: inv.client_email,
      client_tax_number: inv.client_tax_number,
      issue_date: new Date().toISOString().split('T')[0],
      due_date: new Date().toISOString().split('T')[0],
      line_items: lineItems,
      amount_net: -Math.abs(inv.amount_net),
      vat_amount: -Math.abs(inv.vat_amount),
      amount_total: -Math.abs(inv.amount_total),
      status: 'sent',
      notes: `Storno računa ${inv.invoice_number}`,
      reference: `SI00 ${stornoNumber}`,
    })
    await supabase.from('issued_invoices').update({ status: 'storno' }).eq('id', inv.id)
    await load()
    setActionLoading('')
    setActionInv(null)
  }

  async function dobropis(inv: any) {
    setActionLoading('dobropis_' + inv.id)
    const dobNumber = `${inv.invoice_number}-D`
    await supabase.from('issued_invoices').insert({
      org_id: inv.org_id,
      invoice_number: dobNumber,
      client_name: inv.client_name,
      client_email: inv.client_email,
      client_tax_number: inv.client_tax_number,
      issue_date: new Date().toISOString().split('T')[0],
      due_date: new Date().toISOString().split('T')[0],
      line_items: inv.line_items || [],
      amount_net: -Math.abs(inv.amount_net),
      vat_amount: -Math.abs(inv.vat_amount),
      amount_total: -Math.abs(inv.amount_total),
      status: 'sent',
      notes: `Dobropis za račun ${inv.invoice_number}`,
      reference: `SI00 ${dobNumber}`,
    })
    await load()
    setActionLoading('')
    setActionInv(null)
  }

  async function podvoji(inv: any) {
    setActionLoading('podvoji_' + inv.id)
    // POPRAVLJENO (30.7.2026, audit A4): prej parseInt('2026-015') -> 2026
    // (ustavi se pri pomisljaju), Math.max+1 -> podvojen racun je dobil
    // neveljavno stevilko "2027". Zdaj atomarna RPC, enaka kot /invoices/new.
    const { data: nextNumber } = await supabase.rpc('get_next_manual_invoice_number', {
      p_org_id: inv.org_id, p_year: new Date().getFullYear(),
    })
    const newNum = nextNumber || `${new Date().getFullYear()}-001`
    await supabase.from('issued_invoices').insert({
      org_id: inv.org_id,
      invoice_number: newNum,
      client_name: inv.client_name,
      client_email: inv.client_email,
      client_tax_number: inv.client_tax_number,
      issue_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
      line_items: inv.line_items || [],
      amount_net: inv.amount_net,
      vat_amount: inv.vat_amount,
      amount_total: inv.amount_total,
      status: 'draft',
      notes: inv.notes,
      reference: `SI00 ${newNum}`,
    })
    await load()
    setActionLoading('')
    setActionInv(null)
  }

  async function downloadPDF(inv: any) {
    try {
      const res = await fetch(`/api/racunovodja/invoice-pdf?id=${inv.id}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Napaka pri generiranju racuna')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${inv.invoice_number}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert('Napaka pri prenosu racuna: ' + e.message)
    }
  }

  // POPRAVLJENO (24.7.2026): "sent" v bazi pomeni samo "izdan zapis" - e-mail
  // je dejansko poslan sele, ko je last_email_sent_at izpolnjen (locen korak
  // prek SendInvoiceModal). Prikaz zdaj loci ta dva primera, da ne zavaja.
  function statusLabel(status: string, lastEmailSentAt?: string | null) {
    switch(status) {
      case 'paid': return { label: 'Plačano', color: '#27500A', bg: '#EAF3DE' }
      case 'sent':
        return lastEmailSentAt
          ? { label: 'Poslano', color: '#854F0B', bg: '#FAEEDA' }
          : { label: 'Izdano', color: '#1E4E8C', bg: '#E6EEF7' }
      case 'overdue': return { label: 'Zamuda', color: '#A32D2D', bg: '#FCEBEB' }
      case 'storno': return { label: 'Storno', color: '#555', bg: '#eee' }
      case 'draft': return { label: 'Osnutek', color: '#888', bg: '#F7F6F2' }
      default: return { label: status, color: '#888', bg: '#F7F6F2' }
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Nalagam...</p>
    </div>
  )

  const totalSent = invoices.filter(i => i.status !== 'draft' && i.status !== 'storno').reduce((s, i) => s + Number(i.amount_total), 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount_total), 0)
  const isFree = !['pro', 'pro_pos'].includes(org?.subscription_status)
  const invoiceCount = invoices.length
  const atLimit = isFree && invoiceCount >= 5
  const totalUnpaid = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + Number(i.amount_total), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <div>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Domov</Link>
          <h1 className="font-semibold text-gray-900 mt-0.5">Izdani računi</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isFree && (
            <div style={{ fontSize: 12, color: atLimit ? '#dc2626' : '#888', background: atLimit ? '#fef2f2' : '#f3f4f6', padding: '4px 10px', borderRadius: 20, fontWeight: 600 }}>
              {invoiceCount}/5 računov
            </div>
          )}
          {atLimit ? (
            <a href="/nastavitve#narocnina" style={{ background: '#1D9E75', color: '#fff', padding: '8px 16px', borderRadius: 12, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
              Nadgradi →
            </a>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/invoices/import" className="border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium">
                Uvozi iz PDF
              </Link>
              <Link href="/invoices/new" className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
                + Nov račun
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Skupaj fakturirano</div>
            <div className="text-xl font-semibold">€{totalSent.toFixed(2)}</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Plačano</div>
            <div className="text-xl font-semibold text-green-600">€{totalPaid.toFixed(2)}</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Neplačano</div>
            <div className="text-xl font-semibold text-orange-500">€{totalUnpaid.toFixed(2)}</div>
          </div>
        </div>

        {invoices.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-4">📄</div>
            <h3 className="font-semibold text-gray-900 mb-2">Še ni računov</h3>
            <p className="text-gray-500 text-sm mb-6">Ustvarite prvi račun in ga pošljite stranki</p>
            <Link href="/invoices/new" className="bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-medium">
              + Ustvari prvi račun
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {invoices.map((inv, i) => {
              const s = statusLabel(inv.status, inv.last_email_sent_at)
              return (
                <div key={inv.id} className={`flex items-center gap-4 px-6 py-4 ${i < invoices.length-1 ? 'border-b border-gray-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate">{inv.client_name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      #{inv.invoice_number} · {new Date(inv.issue_date).toLocaleDateString('sl-SI')}
                    </div>
                  </div>
                  <div className="text-right mr-2 flex-shrink-0">
                    <div className="font-semibold text-sm">€{Number(inv.amount_total).toFixed(2)}</div>
                    <div style={{ fontSize: '10px', marginTop: '2px', padding: '2px 8px', borderRadius: '20px', background: s.bg, color: s.color, display: 'inline-block', fontWeight: '500' }}>
                      {s.label}
                    </div>
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => downloadPDF(inv)}
                      className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      ⬇ PDF
                    </button>
                    {inv.status !== 'storno' && (
                      isFree ? (
                        <a href="/nastavitve#narocnina" style={{ border: '1px solid #d1d5db', background: '#f9fafb', color: '#9ca3af', borderRadius: 12, padding: '6px 12px', fontSize: 12, textDecoration: 'none', cursor: 'pointer' }} title="Nadgradi na Pro za email pošiljanje">
                          🔒 Pošlji
                        </a>
                      ) : (
                        <button
                          onClick={() => setSendModalInv(inv)}
                          className="border border-gray-900 bg-gray-900 text-white rounded-xl px-3 py-1.5 text-xs hover:bg-gray-800 transition-colors"
                        >
                          📧 Pošlji
                        </button>
                      )
                    )}
                    {/* UJP gumb ODSTRANJEN (24.7.2026): po pregledu uradne UJP
                        dokumentacije portal UJPeRacun ne sprejema nalozenih/generiranih
                        XML datotek - edina pot je rocni vnos prek spletnega obrazca na
                        eracuni.ujp.gov.si s pravim kvalificiranim potrdilom (TaxCA ni
                        veljaven za prijavo). Koda v api/invoices/[id]/ujp ostaja kot
                        referenca za morebitno kasnejso pravilno implementacijo. */}
                    <button
                      onClick={() => setActionInv(actionInv?.id === inv.id ? null : inv)}
                      className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      ··· Več
                    </button>
                  </div>

                  {actionInv?.id === inv.id && (
                    <div style={{
                      position: 'absolute', right: '24px', marginTop: '80px',
                      background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)',
                      borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                      zIndex: 100, minWidth: '180px', overflow: 'hidden',
                    }}>
                      {inv.status !== 'paid' && inv.status !== 'storno' && (
                        <button
                          onClick={() => markPaid(inv)}
                          disabled={actionLoading === 'paid_' + inv.id}
                          style={{ width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                          className="hover:bg-gray-50"
                        >
                          ✅ Označi kot plačano
                        </button>
                      )}
                      {inv.status === 'paid' && (
                        <button
                          onClick={() => markSent(inv)}
                          style={{ width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                          className="hover:bg-gray-50"
                        >
                          ↩ Razveljavi plačilo
                        </button>
                      )}
                      <button
                        onClick={() => window.location.href = '/invoices/edit/' + inv.id}
                        style={{ width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                        className="hover:bg-gray-50"
                      >
                        ✏️ Uredi račun
                      </button>
                      <button
                        onClick={() => podvoji(inv)}
                        disabled={actionLoading === 'podvoji_' + inv.id}
                        style={{ width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                        className="hover:bg-gray-50"
                      >
                        📋 Podvoji račun
                      </button>
                      {inv.status !== 'storno' && !inv.invoice_number?.includes('-S') && !inv.invoice_number?.includes('-D') && (
                        <>
                          <div style={{ height: '0.5px', background: '#eee', margin: '4px 0' }} />
                          <button
                            onClick={() => dobropis(inv)}
                            disabled={actionLoading === 'dobropis_' + inv.id}
                            style={{ width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                            className="hover:bg-gray-50"
                          >
                            📝 Izdaj dobropis
                          </button>
                          <button
                            onClick={() => storno(inv)}
                            disabled={actionLoading === 'storno_' + inv.id}
                            style={{ width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer', color: '#A32D2D', display: 'flex', alignItems: 'center', gap: '8px' }}
                            className="hover:bg-red-50"
                          >
                            🚫 Storniraj račun
                          </button>
                        </>
                      )}
                      {/* POPRAVLJENO (30.7.2026, audit): brisanje je zdaj
                          dovoljeno SAMO za osnutke. Po ZDDV-1/ZDavP-2 se
                          izdanega računa NE SME izbrisati (hramba 10 let) —
                          popravi se s STORNOM. Brisanje fiskaliziranega
                          računa bi ustvarilo neskladje s FURS evidenco. */}
                      {inv.status === 'draft' && !inv.zoi && !inv.eor ? (
                        <>
                          <div style={{ height: '0.5px', background: '#eee', margin: '4px 0' }} />
                          <button
                            onClick={async () => {
                              if (!confirm('Resnično izbrišem ta osnutek? To dejanje je nepovrnjivo.')) return
                              const { error } = await supabase.from('issued_invoices').delete().eq('id', inv.id)
                              if (!error) { setActionInv(null); load() }
                              else alert('Napaka: ' + error.message)
                            }}
                            style={{ width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer', color: '#A32D2D', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
                            className="hover:bg-red-50"
                          >
                            🗑️ Izbriši osnutek
                          </button>
                        </>
                      ) : (
                        <>
                          <div style={{ height: '0.5px', background: '#eee', margin: '4px 0' }} />
                          <div style={{ padding: '8px 16px', fontSize: '11px', color: '#888', lineHeight: 1.5 }}>
                            🔒 Izdanega računa ni dovoljeno izbrisati (zakonska hramba 10 let).
                            {inv.status !== 'storno' ? ' Za popravek uporabite Storniraj račun.' : ''}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {actionInv && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          onClick={() => setActionInv(null)}
        />
      )}

      {sendModalInv && (
        <SendInvoiceModal
          invoice={sendModalInv}
          orgName={org?.name || ''}
          onClose={() => setSendModalInv(null)}
          onSent={() => {
            setSendModalInv(null)
            setSendSuccess(`Račun #${sendModalInv.invoice_number} uspešno poslan na ${sendModalInv.client_email || 'stranko'}`)
            load()
            setTimeout(() => setSendSuccess(''), 5000)
          }}
        />
      )}

      {sendSuccess && (
        <div style={{ position: 'fixed', bottom: '20px', right: '20px', background: '#0D1F12', color: '#fff', padding: '14px 18px', borderRadius: '12px', fontSize: '13px', zIndex: 1001, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', maxWidth: '360px' }}>
          ✅ {sendSuccess}
        </div>
      )}
    </div>
  )
}