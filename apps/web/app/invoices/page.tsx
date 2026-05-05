'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase
        .from('org_members')
        .select('organizations(*)')
        .eq('user_id', user.id)
        .single()
      if (member) {
        const o = (member as any).organizations
        setOrg(o)
        const { data: inv } = await supabase
          .from('issued_invoices')
          .select('*')
          .eq('org_id', o.id)
          .order('created_at', { ascending: false })
        setInvoices(inv || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  async function downloadPDF(inv: any) {
    const QRCode = await import('qrcode')
    const amount = String(Math.round(inv.amount_total * 100)).padStart(11, '0')
    const dueFormatted = new Date(inv.due_date).toISOString().slice(0,10).replace(/-/g,'')
    const iban = (org.iban || '').replace(/\s/g, '')
    const reference = (inv.reference || `SI00${inv.invoice_number}`).replace(/\s/g,'')
    const upnData = ['UPNQR','','','',org.name,org.address||'',`${org.post_code||''} ${org.city||''}`,amount,dueFormatted,'OTHR',`Plačilo računa ${inv.invoice_number}`,iban,reference,inv.client_name,'',''].join('\n')
    const qrDataUrl = await QRCode.toDataURL(upnData, { width: 120, margin: 1 })

    const html = `<!DOCTYPE html>
<html lang="sl">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:Arial,sans-serif; font-size:11px; color:#111; padding:30px 40px; }
  .header { display:flex; justify-content:space-between; margin-bottom:30px; }
  .company-name { font-size:20px; font-weight:bold; margin-bottom:6px; }
  .company-info { color:#666; font-size:10px; line-height:1.8; }
  .invoice-title { text-align:right; }
  .invoice-title h1 { font-size:28px; font-weight:bold; letter-spacing:2px; }
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
  .qr-hint { font-size:9px; color:#999; margin-top:4px; text-align:center; }
  .footer { margin-top:30px; text-align:center; font-size:9px; color:#aaa; border-top:1px solid #f0f0f0; padding-top:15px; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="company-name">${org.name}</div>
    <div class="company-info">
      ${org.address || ''}<br>
      ${org.post_code || ''} ${org.city || ''}<br>
      Davčna številka: ${org.tax_number}<br>
      ${org.vat_registered ? `ID za DDV: SI${org.tax_number}<br>` : ''}
      ${org.iban ? `TRR: ${org.iban}` : ''}
    </div>
  </div>
  <div class="invoice-title">
    <h1>RAČUN</h1>
    <div class="meta">
      Številka: ${inv.invoice_number}<br>
      Datum: ${new Date(inv.issue_date).toLocaleDateString('sl-SI')}<br>
      Rok plačila: ${new Date(inv.due_date).toLocaleDateString('sl-SI')}
    </div>
  </div>
</div>
<hr>
<div class="buyer">
  <div class="buyer-label">Kupec</div>
  <div class="buyer-name">${inv.client_name}</div>
  ${inv.client_tax_number ? `<div class="buyer-sub">ID za DDV: ${inv.client_tax_number}</div>` : ''}
  ${inv.client_email ? `<div class="buyer-sub">${inv.client_email}</div>` : ''}
</div>
<table>
  <thead>
    <tr>
      <th>Storitev / Blago</th>
      <th class="r">Količina</th>
      <th class="r">Cena (€)</th>
      <th class="r">DDV</th>
      <th class="r">Skupaj (€)</th>
    </tr>
  </thead>
  <tbody>
    ${(inv.line_items || []).map((item: any) => `
      <tr>
        <td>${item.description || ''}</td>
        <td class="r">${item.quantity}</td>
        <td class="r">€${Number(item.unit_price).toFixed(2)}</td>
        <td class="r">${item.vat_rate}%</td>
        <td class="r">€${(item.quantity * item.unit_price).toFixed(2)}</td>
      </tr>
    `).join('')}
  </tbody>
</table>
<div class="totals">
  <div class="totals-box">
    <div class="total-row"><span>Osnova za DDV:</span><span>€${Number(inv.amount_net).toFixed(2)}</span></div>
    <div class="total-row"><span>DDV (22%):</span><span>€${Number(inv.vat_amount).toFixed(2)}</span></div>
    <div class="total-final"><span>SKUPAJ ZA PLAČILO:</span><span>€${Number(inv.amount_total).toFixed(2)}</span></div>
  </div>
</div>
<div class="bottom">
  <div>
    <div class="pay-title">Plačilni podatki</div>
    <div class="pay-row"><span class="pay-lbl">TRR:</span><span class="pay-val">${org.iban || ''}</span></div>
    <div class="pay-row"><span class="pay-lbl">Sklic:</span><span class="pay-val">${inv.reference || `SI00 ${inv.invoice_number}`}</span></div>
    <div class="pay-row"><span class="pay-lbl">Namen:</span><span class="pay-val">Plačilo računa ${inv.invoice_number}</span></div>
    <div class="pay-row"><span class="pay-lbl">Znesek:</span><span class="pay-val">€${Number(inv.amount_total).toFixed(2)}</span></div>
    <div style="font-size:9px;color:#999;margin-top:10px">Skenirajte QR kodo za hitro plačilo →</div>
  </div>
  <div>
    <img src="${qrDataUrl}" width="110" height="110" alt="QR">
    <div class="qr-hint">UPN QR — hitro plačilo</div>
  </div>
</div>
${inv.notes ? `<div style="margin-top:16px;padding:12px;background:#f9f9f9;border-radius:6px;font-size:10px;color:#666"><strong>Opombe:</strong> ${inv.notes}</div>` : ''}
<div class="footer">Račun je izdan elektronsko in velja brez podpisa &middot; ${org.name} &middot; ${new Date().getFullYear()}</div>
<script>window.onload=function(){window.print()}</script>
</body>
</html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Nalagam...</p>
    </div>
  )

  const totalSent = invoices.filter(i => i.status !== 'draft').reduce((s, i) => s + Number(i.amount_total), 0)
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
            {invoices.map((inv, i) => (
              <div key={inv.id} className={`flex items-center gap-4 px-6 py-4 ${i < invoices.length-1 ? 'border-b border-gray-50' : ''}`}>
                <div className="flex-1">
                  <div className="font-medium text-sm text-gray-900">{inv.client_name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    #{inv.invoice_number} · {new Date(inv.issue_date).toLocaleDateString('sl-SI')}
                  </div>
                </div>
                <div className="text-right mr-4">
                  <div className="font-semibold text-sm">€{Number(inv.amount_total).toFixed(2)}</div>
                  <div className={`text-xs mt-0.5 ${inv.status === 'paid' ? 'text-green-600' : inv.status === 'overdue' ? 'text-red-500' : 'text-orange-500'}`}>
                    {inv.status === 'paid' ? 'Plačano' : inv.status === 'overdue' ? 'Zamuda' : inv.status === 'sent' ? 'Poslano' : 'Osnutek'}
                  </div>
                </div>
                <button
                  onClick={() => downloadPDF(inv)}
                  className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  ⬇ PDF
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}