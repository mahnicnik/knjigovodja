'use client'

import { useState } from 'react'

interface Props {
  invoice: any
  orgName: string
  onClose: () => void
  onSent: () => void
}

export default function SendInvoiceModal({ invoice, orgName, onClose, onSent }: Props) {
  const [to, setTo] = useState(invoice.client_email || '')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState(`Račun ${invoice.invoice_number} — ${orgName}`)
  const [message, setMessage] = useState(
    `Pozdravljeni,\n\nV prilogi vam pošiljamo račun ${invoice.invoice_number} z dne ${new Date(invoice.issue_date).toLocaleDateString('sl-SI')}, v znesku €${Number(invoice.amount_total).toFixed(2)} z rokom plačila ${new Date(invoice.due_date).toLocaleDateString('sl-SI')}.\n\nPlačilo lahko opravite preko UPN QR kode v PDF-u.\n\nHvala in lep pozdrav,\n${orgName}`
  )
  const [sendEslog, setSendEslog] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  // eSLOG je relevanten samo za B2B (stranka ima davčno številko)
  const clientHasTaxNumber = !!(invoice.client_tax_number?.trim())

  async function handleSend() {
    if (!to.trim()) {
      setError('Prosimo vnesite email naslov prejemnika')
      return
    }

    setSending(true)
    setError('')

    try {
      const res = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          cc: cc || undefined,
          subject,
          message,
          sendEslog: clientHasTaxNumber && sendEslog,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Napaka pri pošiljanju')
      }

      onSent()
    } catch (err: any) {
      setError(err.message)
      setSending(false)
    }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
    >
      <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', border: '0.5px solid rgba(0,0,0,0.1)' }}>

        <div style={{ padding: '20px 24px', borderBottom: '0.5px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '500', color: '#0D1F12' }}>Pošlji račun po emailu</div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>#{invoice.invoice_number} · {invoice.client_name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          <div>
            <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '5px', fontWeight: '500' }}>Za *</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="stranka@firma.si"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '0.5px solid rgba(0,0,0,0.15)', fontSize: '13px', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '5px', fontWeight: '500' }}>Kopija (CC) — neobvezno</label>
            <input
              type="email"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="kopija@firma.si"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '0.5px solid rgba(0,0,0,0.15)', fontSize: '13px', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '5px', fontWeight: '500' }}>Zadeva *</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '0.5px solid rgba(0,0,0,0.15)', fontSize: '13px', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '5px', fontWeight: '500' }}>Sporočilo</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '0.5px solid rgba(0,0,0,0.15)', fontSize: '13px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
          </div>

          {/* PRIPONKE */}
          <div style={{ background: '#F7F6F2', borderRadius: '10px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#888', letterSpacing: '.04em', textTransform: 'uppercase' }}>Priponke</div>

            {/* PDF — vedno priložen */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#E1F5EE', display: 'grid', placeItems: 'center', fontSize: '14px', flexShrink: 0 }}>📄</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#0D1F12' }}>PDF z UPN QR kodo</div>
                <div style={{ fontSize: '11px', color: '#888' }}>racun-{invoice.invoice_number}.pdf · vedno priložen</div>
              </div>
              <div style={{ fontSize: '11px', color: '#1D9E75', fontWeight: '500' }}>✓ Vedno</div>
            </div>

            {/* eSLOG — samo za B2B */}
            {clientHasTaxNumber ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <div
                  onClick={() => setSendEslog(!sendEslog)}
                  style={{
                    width: '28px', height: '28px', borderRadius: '6px', flexShrink: 0,
                    background: sendEslog ? '#E1F5EE' : '#fff',
                    border: sendEslog ? '2px solid #1D9E75' : '1px solid rgba(0,0,0,0.15)',
                    display: 'grid', placeItems: 'center',
                    fontSize: '14px', cursor: 'pointer', transition: 'all .15s',
                  }}
                >
                  {sendEslog ? '✓' : ''}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: '#0D1F12' }}>
                    e-Račun XML (eSLOG 2.0)
                  </div>
                  <div style={{ fontSize: '11px', color: '#888' }}>
                    {invoice.invoice_number}.xml · za uvoz v Pantheon, Vasco, Minimax
                  </div>
                </div>
                <div style={{ fontSize: '10px', background: '#0D1F12', color: '#E8B547', padding: '2px 7px', borderRadius: '4px', fontWeight: '600', letterSpacing: '.04em', flexShrink: 0 }}>
                  B2B
                </div>
              </label>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: 0.4 }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#fff', border: '1px solid rgba(0,0,0,0.1)', display: 'grid', placeItems: 'center', fontSize: '14px', flexShrink: 0 }}>📋</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: '#0D1F12' }}>e-Račun XML (eSLOG 2.0)</div>
                  <div style={{ fontSize: '11px', color: '#888' }}>Samo za B2B — stranka nima davčne številke</div>
                </div>
              </div>
            )}
          </div>

          {sendEslog && clientHasTaxNumber && (
            <div style={{ background: '#E1F5EE', border: '0.5px solid #A6D9C3', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#0E5E3B', lineHeight: 1.5 }}>
              ✓ e-Račun XML bo priložen skupaj s PDF. Stranka ga lahko uvozi direktno v svoj računovodski program.
            </div>
          )}

          {error && (
            <div style={{ background: '#FCEBEB', border: '0.5px solid #F7C1C1', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#A32D2D' }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '0.5px solid #eee', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={sending}
            style={{ padding: '9px 18px', borderRadius: '8px', border: '0.5px solid rgba(0,0,0,0.12)', background: '#fff', fontSize: '13px', color: '#666', cursor: 'pointer' }}
          >
            Prekliči
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !to.trim()}
            style={{ padding: '9px 22px', borderRadius: '8px', border: 'none', background: (!to.trim() || sending) ? '#ccc' : '#0D1F12', color: '#fff', fontSize: '13px', fontWeight: '500', cursor: (!to.trim() || sending) ? 'not-allowed' : 'pointer' }}
          >
            {sending ? 'Pošiljam...' : `📧 Pošlji${sendEslog && clientHasTaxNumber ? ' + XML' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
