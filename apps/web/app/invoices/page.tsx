'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionInv, setActionInv] = useState<any>(null)
  const [actionLoading, setActionLoading] = useState('')
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: member } = await supabase
      .from('org_members').select('organizations(*)')
      .eq('user_id', user.id).single()
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
    // Ustvari storno račun z negativnimi zneski
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
    // Posodobi originalni račun
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
    const nums = invoices.map(i => parseInt(i.invoice_number)).filter(n => !isNaN(n))
    const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1
    const newNum = String(nextNum).padStart(4, '0')
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
    const QRCode = await import('qrcode')
    const amount = String(Math.round(inv.amount_total * 100)).padStart(11, '0')
    const dueFormatted = new Date(inv.due_date).toISOString().slice(0,10).replace(/-/g,'')
    const iban = (org.iban || '').replace(/\s/g, '')
    const reference = (inv.reference || `SI00${inv.invoice_number}`).replace(/\s/g,'')
    const upnData = ['UPNQR','','','',org.name,org.address||'',`${org.post_code||''} ${org.city||''}`,amount,dueFormatted,'OTHR',`Plačilo računa ${inv.invoice_number}`,iban,reference,inv.client_name,'',''].join('\n')
    const qrDataUrl = await QRCode.toDataURL(upnData, { width: 120, margin: 1 })
    const isStorno = inv.amount_total < 0
    const isDobropis = inv.invoice_number?.includes('-D')
    const docType = isDobropis ? 'DOBROPIS' : isStorno ? 'STORNO' : 'RAČUN'

    const html = `<!DOCTYPE html>
<html lang="sl"><head><meta charset="UTF-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:Arial,sans-serif; font-size:11px; color:#111; padding:30px 40px; }
.header { display:flex; justify-content:space-between; margin-bottom:30px; }
.company-name { font-size:20px; font-weight:bold; margin-bottom:6px; }
.company-info { color:#666; font-size:10px; line-height:1.8; }
.invoice-title { text-align:right; }
.invoice-title h1 { font-size:28px; font-weight:bold; letter-spacing:2px; color:${isStorno || isDobropis ? '#c00' : '#111'}; }
.invoice-title .meta { color:#666; font-size:10px; margin-top:6px; line-height:1.8; }
hr { border:none; border-top:1px solid #e0e0e0; margin:20px 0; }
.buyer { margin-bottom:25px; }
.buyer-label { font-size:9px; color:#999; text-transform:uppercase; letter-spacing:1px; margin-bottom:5px; }
.buyer-name { font-size:13px; font-weight:bold; }
.buyer-sub { font-size:10px; color:#666; margin-top:3px; }
table { width:100%; border-collapse:collapse; margin-bottom:20px; }
thead tr { background:#f5f5f5; }
th { padding:8px 10px; text-align:left; font-size:9px; color:#666; text-transform:uppercase; }
th.r { text-align:right; }
td { padding:9px 10px; border-bottom:1px solid #f0f0f0; font-size:11px; }
td.r { text-align:right; }
.totals { display:flex; justify-content:flex-end; margin-bottom:24px; }
.totals-box { width:280px; }
.total-row { display:flex; justify-content:space-between; padding:5px 0; color:#666; font-size:11px; }
.total-final { display:flex; justify-content:space-between; background:#111; color:white; padding:10px 14px; border-radius:6px; font-size:13px; font-weight:bold; margin-top:10px; }
.bottom { display:flex; justify-content:space-between; align-items:flex-start; margin-top:24px; padding-top:20px; border-top:1px solid #e0e0e0; }
.pay-title { font-size:9px; color:#999; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; }
.pay-row { display:flex; gap:8px; margin-bottom:4px; font-size:10px; }
.pay-lbl { color:#999; width:55px; }
.pay-val { font-weight:bold; color:#111; }
.footer { margin-top:30px; text-align:center; font-size:9px; color:#aaa; border-top:1px solid #f0f0f0; padding-top:15px; }
.storno-badge { display:inline-block; background:#fff0f0; border:1px solid #fcc; color:#c00; padding:4px 10px; border-radius:4px; font-size:10px; font-weight:bold; margin-bottom:12px; }
</style></head><body>
<div class="header">
  <div>
    <div class="company-name">${org.name}</div>
    <div class="company-info">
      ${org.address || ''}<br>
      ${org.post_code || ''} ${org.city || ''}<br>
      Davčna številka: ${org.tax_number || ''}<br>
      ${org.vat_registered ? `ID za DDV: SI${org.tax_number || ''}<br>` : ''}
      ${org.iban ? `TRR: ${org.iban}` : ''}
    </div>
  </div>
  <div class="invoice-title">
    <h1>${docType}</h1>
    <div class="meta">
      Številka: ${inv.invoice_number}<br>
      Datum: ${new Date(inv.issue_date).toLocaleDateString('sl-SI')}<br>
      Rok plačila: ${new Date(inv.due_date).toLocaleDateString('sl-SI')}
    </div>
  </div>
</div>
${inv.notes ? `<div class="storno-badge">${inv.notes}</div>` : ''}
<hr>
<div class="buyer">
  <div class="buyer-label">Kupec</div>
  <div class="buyer-name">${inv.client_name}</div>
  ${inv.client_tax_number ? `<div class="buyer-sub">ID za DDV: ${inv.client_tax_number}</div>` : ''}
  ${inv.client_email ? `<div class="buyer-sub">${inv.client_email}</div>` : ''}
</div>
<table>
  <thead><tr>
    <th>Storitev / Blago</th><th class="r">Količina</th><th class="r">Cena (€)</th><th class="r">DDV</th><th class="r">Skupaj (€)</th>
  </tr></thead>
  <tbody>
    ${(inv.line_items || []).map((item: any) => `
      <tr>
        <td>${item.description || ''}</td>
        <td class="r">${item.quantity}</td>
        <td class="r">€${Number(item.unit_price).toFixed(2)}</td>
        <td class="r">${item.vat_rate}%</td>
        <td class="r">€${(item.quantity * item.unit_price).toFixed(2)}</td>
      </tr>`).join('')}
  </tbody>
</table>
<div class="totals">
  <div class="totals-box">
    <div class="total-row"><span>Osnova za DDV:</span><span>€${Number(inv.amount_net).toFixed(2)}</span></div>
    <div class="total-row"><span>DDV:</span><span>€${Number(inv.vat_amount).toFixed(2)}</span></div>
    <div class="total-final"><span>${isStorno || isDobropis ? 'SKUPAJ ZA VRAČILO:' : 'SKUPAJ ZA PLAČILO:'}</span><span>€${Number(inv.amount_total).toFixed(2)}</span></div>
  </div>
</div>
${!isStorno && !isDobropis ? `
<div class="bottom">
  <div>
    <div class="pay-title">Plačilni podatki</div>
    <div class="pay-row"><span class="pay-lbl">TRR:</span><span class="pay-val">${org.iban || ''}</span></div>
    <div class="pay-row"><span class="pay-lbl">Sklic:</span><span class="pay-val">${inv.reference || `SI00 ${inv.invoice_number}`}</span></div>
    <div class="pay-row"><span class="pay-lbl">Namen:</span><span class="pay-val">Plačilo računa ${inv.invoice_number}</span></div>
    <div class="pay-row"><span class="pay-lbl">Znesek:</span><span class="pay-val">€${Number(inv.amount_total).toFixed(2)}</span></div>
  </div>
  <div>
    <img src="${qrDataUrl}" width="110" height="110" alt="QR">
    <div style="font-size:9px;color:#999;text-align:center;margin-top:4px">UPN QR</div>
  </div>
</div>` : ''}
<div class="footer">Dokument je izdan elektronsko &middot; ${org.name} &middot; ${new Date().getFullYear()}</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
  }

  function statusLabel(status: string) {
    switch(status) {
      case 'paid': return { label: 'Plačano', color: '#27500A', bg: '#EAF3DE' }
      case 'sent': return { label: 'Poslano', color: '#854F0B', bg: '#FAEEDA' }
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
  const totalUnpaid = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + Number(i.amount_total), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <div>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Domov</Link>
          <h1 className="font-semibold text-gray-900 mt-0.5">Izdani računi</h1>
        </div>
        <Link href="/invoices/new" className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
          + Nov račun
        </Link>
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
              const s = statusLabel(inv.status)
              return (
                <div key={inv.id} className={`flex items-center gap-4 px-6 py-4 ${i < invoices.length-1 ? 'border-b border-gray-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900">{inv.client_name}</div>
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

                  {/* Akcije */}
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => downloadPDF(inv)}
                      className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      ⬇ PDF
                    </button>
                    <button
                      onClick={() => setActionInv(actionInv?.id === inv.id ? null : inv)}
                      className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      ··· Več
                    </button>
                  </div>

                  {/* Dropdown akcije */}
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
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Overlay za zapiranje dropdowna */}
      {actionInv && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          onClick={() => setActionInv(null)}
        />
      )}
    </div>
  )
}
