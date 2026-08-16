'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

interface Invoice {
  id: string
  invoice_number: string
  issue_date: string
  due_date: string | null
  client_name: string
  amount_net: number
  vat_amount: number
  amount_total: number
  status: string
}

interface Receipt {
  id: string
  receipt_number: string | null
  receipt_date: string | null
  vendor: string | null
  amount_net: number | null
  vat_amount: number | null
  amount_total: number | null
  category: string | null
  status: string
  attachment_base64: string | null
  attachment_type: string | null
}


function openReceiptPdf(attachmentBase64: string | null, attachmentType: string | null) {
  if (!attachmentBase64) { alert('Dokument ni na voljo za ta strosek') ; return }
  if (attachmentType === 'image') { window.open(attachmentBase64, '_blank'); return }
  const byteChars = atob(attachmentBase64)
  const byteNumbers = new Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i)
  const byteArray = new Uint8Array(byteNumbers)
  const blob = new Blob([byteArray], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}
async function openInvoicePdf(invoiceId: string) {
  try {
    const res = await fetch(`/api/racunovodja/invoice-pdf?id=${invoiceId}`)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'Napaka pri nalaganju racuna')
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  } catch (e: any) {
    alert('Napaka pri nalaganju racuna: ' + e.message)
  }
}

interface Comment {
  id: string
  document_type: string
  document_id: string | null
  comment: string
  is_resolved: boolean
  created_at: string
}

interface OrgInfo {
  id: string
  name: string
  tax_number: string | null
  tax_system: string | null
  vat_registered: boolean
  address: string | null
  city: string | null
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  sent:      { label: 'Poslano',    color: '#1D9E75', bg: '#E1F5EE' },
  paid:      { label: 'Plačano',   color: '#0E5E3B', bg: '#D1FAE5' },
  overdue:   { label: 'Zamuda',    color: '#DC2626', bg: '#FEE2E2' },
  cancelled: { label: 'Storno',    color: '#6B7280', bg: '#F3F4F6' },
  pending:   { label: 'V obdelavi',color: '#D97706', bg: '#FEF3C7' },
  confirmed: { label: 'Potrjen',   color: '#1D9E75', bg: '#E1F5EE' },
  rejected:  { label: 'Zavrnjen',  color: '#DC2626', bg: '#FEE2E2' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, color: '#888', bg: '#F3F4F6' }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, padding: '3px 8px', borderRadius: 4 }}>
      {s.label}
    </span>
  )
}

function fmt(n: number | null | undefined) {
  return n != null ? `€${Number(n).toFixed(2)}` : '—'
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('sl-SI')
}

export default function RacunovodjaClientPage() {
  const router = useRouter()
  const params = useParams()
  const orgId = params.orgId as string
  const supabase = createClient()

  const [org, setOrg] = useState<OrgInfo | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'invoices'|'receipts'|'comments'>('invoices')
  const [exporting, setExporting] = useState(false)

  // Comment form
  const [newComment, setNewComment] = useState('')
  const [commentDocType, setCommentDocType] = useState<'invoice'|'receipt'|'general'>('general')
  const [commentDocId, setCommentDocId] = useState<string | null>(null)
  const [savingComment, setSavingComment] = useState(false)

  const [toast, setToast] = useState<string | null>(null)
  const [myUserId, setMyUserId] = useState<string>('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setMyUserId(user.id)

    // Preveri da je res accountant za to org
    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle()

    if (!membership || membership.role !== 'accountant') {
      router.push('/racunovodja')
      return
    }

    // Pridobi vse podatke vzporedno
    const now = new Date()
    const yearStart = `${now.getFullYear()}-01-01`

    const [orgRes, invRes, recRes, comRes] = await Promise.all([
      supabase.from('organizations').select('id,name,tax_number,tax_system,vat_registered,address,city').eq('id', orgId).single(),
      supabase.from('issued_invoices').select('*').eq('org_id', orgId).gte('issue_date', yearStart).neq('status', 'draft').or('zoi.is.null,zoi.not.like.DEMO-%').order('issue_date', { ascending: false }),
      supabase.from('receipts').select('*').eq('org_id', orgId).gte('receipt_date', yearStart).order('receipt_date', { ascending: false }),
      supabase.from('accountant_comments').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    ])

    setOrg(orgRes.data)
    setInvoices(invRes.data ?? [])
    setReceipts(recRes.data ?? [])
    setComments(comRes.data ?? [])
    setLoading(false)
  }, [orgId, router, supabase])

  useEffect(() => { load() }, [load])

  // Export XLSX
  async function handleExport() {
    setExporting(true)
    try {
      const now = new Date()
      const res = await fetch('/api/exports/accounting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          format: 'xlsx',
          action: 'download',
        }),
      })
      if (!res.ok) throw new Error('Export napaka')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${org?.name ?? 'export'}_${now.getFullYear()}_${now.getMonth() + 1}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      showToast('XLSX prenesen')
    } catch (e: any) {
      showToast(`Napaka: ${e.message}`)
    } finally {
      setExporting(false)
    }
  }

  // Dodaj komentar
  async function addComment() {
    if (!newComment.trim()) return
    setSavingComment(true)
    try {
      const { error } = await supabase.from('accountant_comments').insert({
        org_id: orgId,
        accountant_user_id: myUserId,
        document_type: commentDocType,
        document_id: commentDocId,
        comment: newComment.trim(),
      })
      if (error) throw new Error(error.message)
      setNewComment('')
      setCommentDocId(null)
      setCommentDocType('general')
      await load()
      showToast('Komentar dodan')
    } catch (e: any) {
      showToast(`Napaka: ${e.message}`)
    } finally {
      setSavingComment(false)
    }
  }

  // Označi komentar kot rešen
  async function resolveComment(commentId: string) {
    const { error: resErr } = await supabase.from('accountant_comments').update({ is_resolved: true }).eq('id', commentId)
    if (resErr) { alert('Komentarja ni bilo mogoče označiti kot rešenega: ' + resErr.message); return }
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, is_resolved: true } : c))
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#F7F6F2', display: 'grid', placeItems: 'center', color: '#888' }}>Nalagam...</div>
  )

  const thisMonth = new Date()
  const monthInvoices = invoices.filter(i => {
    const d = new Date(i.issue_date)
    return d.getMonth() === thisMonth.getMonth() && d.getFullYear() === thisMonth.getFullYear()
  })
  const monthRevenue = monthInvoices.reduce((s, i) => s + Number(i.amount_total), 0)
  const overdueInvoices = invoices.filter(i => i.status === 'overdue' || (i.status === 'sent' && i.due_date && i.due_date < new Date().toISOString().split('T')[0]))
  const unconfirmedReceipts = receipts.filter(r => r.status === 'pending')
  const openComments = comments.filter(c => !c.is_resolved)

  return (
    <div style={{ minHeight: '100vh', background: '#F7F6F2' }}>

      {/* HEADER */}
      <div style={{ background: '#0D1F12', padding: '20px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ marginBottom: 4 }}>
            <Link href="/racunovodja" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textDecoration: 'none' }}>← Vse stranke</Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 22, color: '#fff', fontWeight: 600 }}>{org?.name}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 3, fontFamily: 'monospace' }}>
                {org?.tax_number ? `SI${org.tax_number}` : '—'}
                {org?.tax_system ? ` · ${org.tax_system}` : ''}
                {org?.vat_registered ? ' · DDV zavezanec' : ' · Ni DDV'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleExport} disabled={exporting} style={{ background: '#E8B547', color: '#0D1F12', border: 0, borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: exporting ? 0.7 : 1 }}>
                {exporting ? 'Izvažam...' : '⬇ Export XLSX'}
              </button>
            </div>
          </div>

          {/* Quick stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 18 }}>
            {[
              { label: 'Ta mesec', value: `€${Math.round(monthRevenue).toLocaleString('sl-SI')}`, color: '#E8B547' },
              { label: 'Zamudniki', value: overdueInvoices.length, color: overdueInvoices.length > 0 ? '#F87171' : '#6EE7B7' },
              { label: 'Nepotrjeni stroški', value: unconfirmedReceipts.length, color: unconfirmedReceipts.length > 0 ? '#FCD34D' : '#6EE7B7' },
              { label: 'Odprte opombe', value: openComments.length, color: openComments.length > 0 ? '#FCD34D' : '#6EE7B7' },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TABS */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex' }}>
          {([
            { id: 'invoices', label: `Izdani računi (${invoices.length})` },
            { id: 'receipts', label: `Prejeti računi (${receipts.length})${unconfirmedReceipts.length > 0 ? ` ⚠️${unconfirmedReceipts.length}` : ''}` },
            { id: 'comments', label: `Opombe (${openComments.length})` },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: 'none', border: 0, borderBottom: tab === t.id ? '2.5px solid #0D1F12' : '2.5px solid transparent',
              padding: '14px 20px', fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? '#0D1F12' : '#888', cursor: 'pointer', whiteSpace: 'nowrap',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 16px' }}>

        {/* IZDANI RAČUNI */}
        {tab === 'invoices' && (
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            {invoices.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#aaa', fontSize: 14 }}>Ni računov letos</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)', background: '#F7F6F2' }}>
                    {['Številka', 'Datum', 'Stranka', 'Zapadlost', 'Znesek', 'Status', ''].map(h => (
                      <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#888', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#0D1F12', fontFamily: 'monospace' }}>{inv.invoice_number}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{fmtDate(inv.issue_date)}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#0D1F12' }}>{inv.client_name}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: inv.due_date && inv.due_date < new Date().toISOString().split('T')[0] && inv.status === 'sent' ? '#DC2626' : '#666' }}>{fmtDate(inv.due_date)}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#0D1F12' }}>{fmt(inv.amount_total)}</td>
                      <td style={{ padding: '12px 16px' }}><StatusBadge status={inv.status} /></td>
                      <td style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
                        <button onClick={() => openInvoicePdf(inv.id)} style={{ background: 'none', border: 0, color: '#0D1F12', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                          📄 PDF
                        </button>
                        <button onClick={() => { setTab('comments'); setCommentDocType('invoice'); setCommentDocId(inv.id); setNewComment(`Račun ${inv.invoice_number}: `) }} style={{ background: 'none', border: 0, color: '#1D9E75', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                          + Opomba
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* PREJETI RAČUNI */}
        {tab === 'receipts' && (
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            {receipts.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#aaa', fontSize: 14 }}>Ni stroškov letos</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)', background: '#F7F6F2' }}>
                    {['Datum', 'Dobavitelj', 'Kategorija', 'Neto', 'DDV', 'Skupaj', 'Status', ''].map(h => (
                      <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#888', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {receipts.map(r => (
                    <tr key={r.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)', background: r.status === 'pending' ? '#FFFBEB' : '#fff' }}>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{fmtDate(r.receipt_date)}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#0D1F12', fontWeight: 500 }}>{r.vendor ?? '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#888' }}>{r.category ?? '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{fmt(r.amount_net)}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{fmt(r.vat_amount)}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#0D1F12' }}>{fmt(r.amount_total)}</td>
                      <td style={{ padding: '12px 16px' }}><StatusBadge status={r.status} /></td>
                      <td style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
                        {r.attachment_base64 && (
                          <button onClick={() => openReceiptPdf(r.attachment_base64, r.attachment_type)} style={{ background: 'none', border: 0, color: '#0D1F12', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                            📄 PDF
                          </button>
                        )}
                        <button onClick={() => { setTab('comments'); setCommentDocType('receipt'); setCommentDocId(r.id); setNewComment(`Strošek ${r.vendor ?? ''}: `) }} style={{ background: 'none', border: 0, color: '#1D9E75', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                          + Opomba
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* KOMENTARJI / OPOMBE */}
        {tab === 'comments' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Nov komentar */}
            <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 14 }}>+ Nova opomba</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['general', 'invoice', 'receipt'] as const).map(t => (
                    <button key={t} onClick={() => setCommentDocType(t)} style={{
                      padding: '6px 12px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.12)',
                      background: commentDocType === t ? '#0D1F12' : '#fff',
                      color: commentDocType === t ? '#fff' : '#666',
                      fontSize: 12, cursor: 'pointer', fontWeight: commentDocType === t ? 600 : 400,
                    }}>
                      {t === 'general' ? 'Splošno' : t === 'invoice' ? 'Račun' : 'Strošek'}
                    </button>
                  ))}
                </div>
                {commentDocType !== 'general' && (
                  <select value={commentDocId ?? ''} onChange={e => setCommentDocId(e.target.value || null)} style={{ padding: '9px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none' }}>
                    <option value="">— Izberi dokument —</option>
                    {commentDocType === 'invoice'
                      ? invoices.map(i => <option key={i.id} value={i.id}>{i.invoice_number} · {i.client_name} · {fmt(i.amount_total)}</option>)
                      : receipts.map(r => <option key={r.id} value={r.id}>{fmtDate(r.receipt_date)} · {r.vendor ?? '—'} · {fmt(r.amount_total)}</option>)
                    }
                  </select>
                )}
                <textarea
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Vnesite opombo ali vprašanje za stranko..."
                  rows={3}
                  style={{ padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                />
                <button onClick={addComment} disabled={savingComment || !newComment.trim()} style={{
                  background: '#0D1F12', color: '#fff', border: 0, borderRadius: 8,
                  padding: '10px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  alignSelf: 'flex-start', opacity: (savingComment || !newComment.trim()) ? 0.4 : 1,
                }}>
                  {savingComment ? 'Shranjujem...' : 'Dodaj opombo'}
                </button>
              </div>
            </div>

            {/* Lista komentarjev */}
            {comments.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 40, textAlign: 'center', color: '#aaa', fontSize: 14 }}>
                Ni opomb
              </div>
            ) : (
              comments.map(c => (
                <div key={c.id} style={{ background: '#fff', borderRadius: 12, border: `0.5px solid ${c.is_resolved ? 'rgba(0,0,0,0.05)' : 'rgba(232,181,71,0.4)'}`, padding: '16px 20px', opacity: c.is_resolved ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, background: '#F7F6F2', color: '#888', padding: '2px 8px', borderRadius: 4, fontWeight: 600, textTransform: 'uppercase' }}>
                          {c.document_type === 'general' ? 'Splošno' : c.document_type === 'invoice' ? 'Račun' : 'Strošek'}
                        </span>
                        <span style={{ fontSize: 11, color: '#aaa' }}>{new Date(c.created_at).toLocaleDateString('sl-SI')}</span>
                        {c.is_resolved && <span style={{ fontSize: 11, color: '#1D9E75', fontWeight: 600 }}>✓ Rešeno</span>}
                      </div>
                      <div style={{ fontSize: 14, color: '#0D1F12', lineHeight: 1.5 }}>{c.comment}</div>
                    </div>
                    {!c.is_resolved && (
                      <button onClick={() => resolveComment(c.id)} style={{ background: '#E1F5EE', border: 0, color: '#0E5E3B', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 500, flexShrink: 0 }}>
                        ✓ Reši
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#0D1F12', color: '#fff', padding: '12px 20px', borderRadius: 999, fontSize: 13, fontWeight: 500, zIndex: 3000, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
          ✓ {toast}
        </div>
      )}
    </div>
  )
}
