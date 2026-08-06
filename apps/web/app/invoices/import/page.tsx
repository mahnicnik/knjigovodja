'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'

type ExtractedInvoice = {
  invoice_number: string
  client_name: string
  client_tax_number: string
  client_address: string
  issue_date: string
  due_date: string
  amount_net: number
  vat_amount: number
  amount_total: number
  line_items: any[]
  _fileName: string
  _status: 'pending' | 'ok' | 'error'
  _error?: string
  _selected: boolean
}

export default function ImportInvoicesPage() {
  const [files, setFiles] = useState<File[]>([])
  const [extracted, setExtracted] = useState<ExtractedInvoice[]>([])
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const router = useRouter()
  const supabase = createClient()

  // POPRAVLJENO (30.7.2026): accept="application/pdf" je samo NAMIG za
  // dialog izbire datoteke - ne dejanska validacija (drag-and-drop ali
  // "Vse datoteke" jo obide). Zdaj se preveri DEJANSKI tip datoteke.
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    const validPdfs = selected.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    const rejected = selected.filter(f => !(f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')))
    if (rejected.length > 0) {
      alert(`Naslednje datoteke niso PDF in ne bodo uvožene: ${rejected.map(f => f.name).join(', ')}`)
    }
    setFiles(validPdfs)
    setExtracted([])
  }

  // DODANO (30.7.2026): prevede znane backend/API napake v prijazna
  // sporocila - prej je uporabnik videl surov API odziv (npr. razkrite
  // notranje podrobnosti Anthropic API klica).
  function friendlyImportError(rawError: string): string {
    if (!rawError) return 'Neznana napaka pri obdelavi datoteke.'
    if (rawError.includes('PDF specified was not valid') || rawError.includes('not valid')) {
      return 'Datoteka ni veljaven PDF ali je poškodovana.'
    }
    if (rawError.includes('too large') || rawError.includes('size')) {
      return 'Datoteka je prevelika.'
    }
    if (rawError.startsWith('40') || rawError.startsWith('50')) {
      return 'Napaka pri obdelavi datoteke - poskusite znova.'
    }
    return rawError
  }

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function processFiles() {
    if (files.length === 0) return
    setProcessing(true)
    setProgress({ done: 0, total: files.length })
    const results: ExtractedInvoice[] = []

    for (const file of files) {
      try {
        const base64 = await fileToBase64(file)
        const res = await fetch('/api/invoices/import-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: base64 }),
        })
        const data = await res.json()
        if (!res.ok) {
          results.push({
            invoice_number: '', client_name: '', client_tax_number: '', client_address: '',
            issue_date: '', due_date: '', amount_net: 0, vat_amount: 0, amount_total: 0,
            line_items: [], _fileName: file.name, _status: 'error', _error: friendlyImportError(data.error), _selected: false,
          })
        } else {
          results.push({ ...data.invoice, _fileName: file.name, _status: 'ok', _selected: true })
        }
      } catch (e: any) {
        results.push({
          invoice_number: '', client_name: '', client_tax_number: '', client_address: '',
          issue_date: '', due_date: '', amount_net: 0, vat_amount: 0, amount_total: 0,
          line_items: [], _fileName: file.name, _status: 'error', _error: e.message, _selected: false,
        })
      }
      setProgress(p => ({ ...p, done: p.done + 1 }))
      setExtracted([...results])
    }
    setProcessing(false)
  }

  function updateField(idx: number, field: string, value: any) {
    setExtracted(prev => prev.map((inv, i) => i === idx ? { ...inv, [field]: value } : inv))
  }

  function toggleSelected(idx: number) {
    setExtracted(prev => prev.map((inv, i) => i === idx ? { ...inv, _selected: !inv._selected } : inv))
  }

  async function confirmImport() {
    const toImport = extracted.filter(inv => inv._status === 'ok' && inv._selected)
    if (toImport.length === 0) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Niste prijavljeni')
      const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
      if (!member) throw new Error('Organizacija ni najdena')

      const rows = toImport.map(inv => ({
        org_id: member.org_id,
        invoice_type: 'invoice',
        invoice_number: inv.invoice_number || `IMPORT-${Date.now()}`,
        client_name: inv.client_name || 'Neznana stranka',
        client_tax_number: inv.client_tax_number || null,
        client_address: inv.client_address || null,
        issue_date: inv.issue_date || new Date().toISOString().split('T')[0],
        due_date: inv.due_date || inv.issue_date || new Date().toISOString().split('T')[0],
        line_items: inv.line_items || [],
        amount_net: inv.amount_net || 0,
        vat_amount: inv.vat_amount || 0,
        amount_total: inv.amount_total || 0,
        status: 'sent',
        source: 'imported',
        notes: 'Uvoženo iz PDF-ja (zunanji sistem)',
      }))

      const { error } = await supabase.from('issued_invoices').insert(rows)
      if (error) throw error

      alert(`Uspešno uvoženih ${rows.length} računov.`)
      router.push('/invoices')
    } catch (e: any) {
      alert('Napaka pri uvozu: ' + e.message)
    }
    setSaving(false)
  }

  const okCount = extracted.filter(i => i._status === 'ok').length
  const selectedCount = extracted.filter(i => i._status === 'ok' && i._selected).length
  const errorCount = extracted.filter(i => i._status === 'error').length

  return (
    <div style={{ minHeight: '100vh', background: '#f7f6f3', padding: '24px 32px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Link href="/invoices" style={{ fontSize: 13, color: '#888', textDecoration: 'none' }}>← Nazaj na Izdane račune</Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 8, marginBottom: 4 }}>Uvoz računov iz PDF</h1>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
          Naložite PDF datoteke izdanih računov iz drugega sistema (npr. Čebelica). Računi se uvozijo v vašo evidenco brez ponovnega FURS potrjevanja — namenjeno je sledenju fiskalnega leta pri prehodu med sistemi.
        </p>

        {extracted.length === 0 && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 32, textAlign: 'center' }}>
            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={handleFileSelect}
              style={{ marginBottom: 16 }}
            />
            {files.length > 0 && (
              <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
                Izbranih {files.length} datotek
              </div>
            )}
            <div>
              <button
                onClick={processFiles}
                disabled={files.length === 0 || processing}
                style={{
                  padding: '12px 24px', borderRadius: 10, border: 'none',
                  background: files.length === 0 ? '#ccc' : '#0D1F12', color: '#fff',
                  fontWeight: 600, fontSize: 14, cursor: files.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {processing ? `Analiziram... (${progress.done}/${progress.total})` : `Analiziraj ${files.length || ''} datotek`}
              </button>
            </div>
          </div>
        )}

        {extracted.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, fontSize: 13 }}>
              <div style={{ background: '#f0fdf4', color: '#166534', padding: '6px 12px', borderRadius: 8, fontWeight: 600 }}>
                {okCount} uspešno prebranih
              </div>
              {errorCount > 0 && (
                <div style={{ background: '#fef2f2', color: '#991b1b', padding: '6px 12px', borderRadius: 8, fontWeight: 600 }}>
                  {errorCount} napak
                </div>
              )}
              <div style={{ background: '#eff6ff', color: '#1e40af', padding: '6px 12px', borderRadius: 8, fontWeight: 600 }}>
                {selectedCount} izbranih za uvoz
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {extracted.map((inv, idx) => (
                <div key={idx} style={{
                  background: '#fff', borderRadius: 12, border: `1px solid ${inv._status === 'error' ? '#fca5a5' : '#f0f0f0'}`,
                  padding: 16, opacity: inv._status === 'ok' && !inv._selected ? 0.5 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: inv._status === 'ok' ? 12 : 0 }}>
                    {inv._status === 'ok' && (
                      <input type="checkbox" checked={inv._selected} onChange={() => toggleSelected(idx)} />
                    )}
                    <div style={{ fontSize: 12, color: '#888', flex: 1 }}>{inv._fileName}</div>
                    {inv._status === 'error' && (
                      <div style={{ fontSize: 12, color: '#dc2626' }}>⚠ {inv._error}</div>
                    )}
                  </div>
                  {inv._status === 'ok' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 10, color: '#999' }}>Št. računa</label>
                        <input value={inv.invoice_number} onChange={e => updateField(idx, 'invoice_number', e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13 }} />
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: 10, color: '#999' }}>Stranka</label>
                        <input value={inv.client_name} onChange={e => updateField(idx, 'client_name', e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, color: '#999' }}>Datum izdaje</label>
                        <input type="date" value={inv.issue_date} onChange={e => updateField(idx, 'issue_date', e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, color: '#999' }}>Osnova</label>
                        <input type="number" step="0.01" value={inv.amount_net} onChange={e => updateField(idx, 'amount_net', parseFloat(e.target.value) || 0)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, color: '#999' }}>DDV</label>
                        <input type="number" step="0.01" value={inv.vat_amount} onChange={e => updateField(idx, 'vat_amount', parseFloat(e.target.value) || 0)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, color: '#999' }}>Skupaj</label>
                        <input type="number" step="0.01" value={inv.amount_total} onChange={e => updateField(idx, 'amount_total', parseFloat(e.target.value) || 0)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13, fontWeight: 700 }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, position: 'sticky', bottom: 20 }}>
              <button onClick={() => { setExtracted([]); setFiles([]) }}
                style={{ padding: '12px 20px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                Prekliči
              </button>
              <button onClick={confirmImport} disabled={selectedCount === 0 || saving}
                style={{
                  flex: 1, padding: '12px 20px', borderRadius: 10, border: 'none',
                  background: selectedCount === 0 ? '#ccc' : '#0D1F12', color: '#fff',
                  fontWeight: 700, fontSize: 14, cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
                }}>
                {saving ? 'Uvažam...' : `Uvozi ${selectedCount} računov`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
