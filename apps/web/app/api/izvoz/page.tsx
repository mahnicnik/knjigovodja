'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getActiveMembership } from '@/lib/active-org'

const MONTHS = [
  { id: 1, name: 'Januar' }, { id: 2, name: 'Februar' }, { id: 3, name: 'Marec' },
  { id: 4, name: 'April' }, { id: 5, name: 'Maj' }, { id: 6, name: 'Junij' },
  { id: 7, name: 'Julij' }, { id: 8, name: 'Avgust' }, { id: 9, name: 'September' },
  { id: 10, name: 'Oktober' }, { id: 11, name: 'November' }, { id: 12, name: 'December' },
]

export default function IzvozPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  // Default to previous month (računovodja običajno izvaža prejšnji mesec)
  const defaultMonth = currentMonth === 1 ? 12 : currentMonth - 1
  const defaultYear = currentMonth === 1 ? currentYear - 1 : currentYear

  const [year, setYear] = useState(defaultYear)
  const [month, setMonth] = useState<number | null>(defaultMonth)
  const [wholeYear, setWholeYear] = useState(false)
  const [format, setFormat] = useState<'xlsx' | 'csv' | 'both'>('xlsx')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [accountantName, setAccountantName] = useState('')
  const [saveAccountant, setSaveAccountant] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [orgInfo, setOrgInfo] = useState<{ name: string; accountantEmail?: string; accountantName?: string } | null>(null)
  const [previewStats, setPreviewStats] = useState<{ invoices: number; receipts: number; revenue: number; expenses: number } | null>(null)

  // Load org info
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
      if (!member) return
      const { data: org } = await supabase.from('organizations').select('name, accountant_email, accountant_name').eq('id', member.org_id).single()
      if (org) {
        setOrgInfo({
          name: org.name,
          accountantEmail: org.accountant_email ?? undefined,
          accountantName: org.accountant_name ?? undefined,
        })
        if (org.accountant_email) setRecipientEmail(org.accountant_email)
        if (org.accountant_name) setAccountantName(org.accountant_name)
      }
    }
    load()
  }, [router, supabase])

  // Load preview stats when period changes
  useEffect(() => {
    async function loadPreview() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
      if (!member) return

      let periodFrom: string, periodTo: string
      if (wholeYear || month === null) {
        periodFrom = `${year}-01-01`
        periodTo = `${year}-12-31`
      } else {
        const mm = String(month).padStart(2, '0')
        const lastDay = new Date(year, month, 0).getDate()
        periodFrom = `${year}-${mm}-01`
        periodTo = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
      }

      const [invRes, recRes] = await Promise.all([
        supabase.from('issued_invoices').select('amount_net,amount_total').eq('org_id', member.org_id).gte('issue_date', periodFrom).lte('issue_date', periodTo).neq('status', 'draft').or('zoi.is.null,zoi.not.like.DEMO-%'),
        supabase.from('receipts').select('amount_net,amount_total').eq('org_id', member.org_id).gte('receipt_date', periodFrom).lte('receipt_date', periodTo),
      ])

      const invoices = invRes.data ?? []
      const receipts = recRes.data ?? []
      setPreviewStats({
        invoices: invoices.length,
        receipts: receipts.length,
        revenue: invoices.reduce((s, i: any) => s + Number(i.amount_net ?? 0), 0),
        expenses: receipts.reduce((s, r: any) => s + Number(r.amount_net ?? 0), 0),
      })
    }
    loadPreview()
  }, [year, month, wholeYear, supabase])

  async function handleAction(action: 'download' | 'email') {
    setLoading(true)
    setResult(null)

    try {
      const body: any = {
        year,
        month: wholeYear ? null : month,
        format,
        action,
      }

      if (action === 'email') {
        if (!recipientEmail.trim()) {
          setResult({ type: 'error', message: 'Vnesite email računovodje' })
          setLoading(false)
          return
        }
        body.recipientEmail = recipientEmail.trim()
        body.accountantName = accountantName.trim() || null
        body.saveAccountant = saveAccountant
      }

      const res = await fetch('/api/exports/accounting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      // Email response is JSON
      if (action === 'email') {
        const data = await res.json()
        if (!res.ok) {
          setResult({ type: 'error', message: data.error || 'Neznana napaka' })
        } else {
          setResult({ type: 'success', message: `Email poslan na ${data.recipient} (${data.stats.invoices} računov, ${data.stats.receipts} stroškov)` })
        }
        setLoading(false)
        return
      }

      // XLSX download — binary
      if (format === 'xlsx') {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: 'Napaka pri prenosu' }))
          setResult({ type: 'error', message: errData.error })
          setLoading(false)
          return
        }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const periodLabel = wholeYear || month === null ? `Leto_${year}` : `${MONTHS[month - 1].name}_${year}`
        a.download = `Racunko_${(orgInfo?.name ?? 'export').replace(/[^a-zA-Z0-9]/g, '_')}_${periodLabel}.xlsx`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        setResult({ type: 'success', message: 'XLSX prenesen — preverite Downloads folder' })
        setLoading(false)
        return
      }

      // CSV download — JSON with content
      if (format === 'csv') {
        const data = await res.json()
        if (!res.ok) {
          setResult({ type: 'error', message: data.error || 'Napaka' })
          setLoading(false)
          return
        }
        // Trigger 2 downloads
        if (data.csvKir) {
          const blob = new Blob(['\ufeff' + data.csvKir], { type: 'text/csv;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${data.fileBaseName}_izdani_racuni.csv`
          a.click()
          URL.revokeObjectURL(url)
        }
        if (data.csvKpr) {
          setTimeout(() => {
            const blob = new Blob(['\ufeff' + data.csvKpr], { type: 'text/csv;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${data.fileBaseName}_prejeti_racuni.csv`
            a.click()
            URL.revokeObjectURL(url)
          }, 500)
        }
        setResult({ type: 'success', message: 'CSV datoteke prenesene' })
        setLoading(false)
        return
      }

    } catch (e: any) {
      setResult({ type: 'error', message: e.message ?? 'Nepričakovana napaka' })
      setLoading(false)
    }
  }

  const periodLabel = wholeYear || month === null 
    ? `Leto ${year}` 
    : `${MONTHS[month - 1].name} ${year}`

  return (
    <div style={{ minHeight: '100vh', background: '#F7F6F2', padding: '32px 16px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* HEADER */}
        <div style={{ marginBottom: 24 }}>
          <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 0, color: '#888', fontSize: 13, cursor: 'pointer', marginBottom: 8 }}>← Nazaj</button>
          <h1 style={{ fontSize: 28, fontWeight: 500, color: '#0D1F12', margin: 0, lineHeight: 1.2 }}>Računovodski izvoz</h1>
          <div style={{ fontSize: 14, color: '#888', marginTop: 6 }}>
            Pripravite podatke za pošiljanje računovodji. Vsebuje knjigo izdanih in prejetih računov ter rekapitulacijo.
          </div>
        </div>

        {/* PERIOD CARD */}
        <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#888', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 }}>OBDOBJE</div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 14, background: '#fff', minWidth: 100 }}>
              {[currentYear, currentYear - 1, currentYear - 2].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            
            {!wholeYear && (
              <select value={month ?? ''} onChange={e => setMonth(Number(e.target.value))} style={{ padding: '10px 14px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 14, background: '#fff', minWidth: 140 }}>
                {MONTHS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#666', cursor: 'pointer' }}>
              <input type="checkbox" checked={wholeYear} onChange={e => setWholeYear(e.target.checked)} />
              Celo leto
            </label>
          </div>

          {previewStats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: 14, background: '#F7F6F2', borderRadius: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Izdani računi</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#0D1F12' }}>{previewStats.invoices}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Prejeti računi</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#0D1F12' }}>{previewStats.receipts}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Prihodki</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#1D9E75' }}>€{Math.round(previewStats.revenue).toLocaleString('sl-SI')}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Odhodki</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#E8B547' }}>€{Math.round(previewStats.expenses).toLocaleString('sl-SI')}</div>
              </div>
            </div>
          )}
        </div>

        {/* FORMAT CARD */}
        <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#888', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 }}>FORMAT</div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { val: 'xlsx', label: 'Excel (XLSX)', sub: '3 sheet-i — Izdani, Prejeti, Rekapitulacija · priporočeno' },
              { val: 'csv', label: 'CSV (semicolon)', sub: '2 datoteki — Vasco, Pantheon, e-racuni' },
              { val: 'both', label: 'Excel + CSV (oboje)', sub: 'Pošljite vse — računovodja izbere kar mu ustreza' },
            ].map(opt => (
              <label key={opt.val} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                border: format === opt.val ? '2px solid #1D9E75' : '0.5px solid rgba(0,0,0,0.12)',
                borderRadius: 10, cursor: 'pointer',
                background: format === opt.val ? '#E1F5EE' : '#fff',
                transition: 'all .15s',
              }}>
                <input type="radio" checked={format === opt.val} onChange={() => setFormat(opt.val as any)} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#0D1F12' }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{opt.sub}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* DOWNLOAD ACTION */}
        <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12' }}>📥 Prenesi datoteke</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Lokalni download za {periodLabel}</div>
            </div>
            <button onClick={() => handleAction('download')} disabled={loading || !previewStats || (previewStats.invoices === 0 && previewStats.receipts === 0)} style={{
              background: '#0D1F12', color: '#fff', border: 0, borderRadius: 8,
              padding: '11px 22px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              opacity: (loading || !previewStats || (previewStats.invoices === 0 && previewStats.receipts === 0)) ? 0.4 : 1,
            }}>
              {loading ? 'Pripravljam...' : 'Prenesi →'}
            </button>
          </div>
        </div>

        {/* EMAIL ACTION */}
        <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12' }}>📧 Pošlji računovodji</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Email s priponkami + povzetek za {periodLabel}</div>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Email računovodje</label>
              <input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} placeholder="racunovodja@primer.si" style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 14, outline: 'none',
              }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Ime računovodje (neobvezno)</label>
              <input type="text" value={accountantName} onChange={e => setAccountantName(e.target.value)} placeholder="npr. Janez Novak" style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 14, outline: 'none',
              }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#666', cursor: 'pointer' }}>
              <input type="checkbox" checked={saveAccountant} onChange={e => setSaveAccountant(e.target.checked)} />
              Shrani podatke računovodje za prihodnja pošiljanja
            </label>
            <button onClick={() => handleAction('email')} disabled={loading || !recipientEmail.trim() || !previewStats || (previewStats.invoices === 0 && previewStats.receipts === 0)} style={{
              background: '#1D9E75', color: '#fff', border: 0, borderRadius: 8,
              padding: '11px 22px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              marginTop: 4, alignSelf: 'flex-start',
              opacity: (loading || !recipientEmail.trim() || !previewStats || (previewStats.invoices === 0 && previewStats.receipts === 0)) ? 0.4 : 1,
            }}>
              {loading ? 'Pošiljam...' : 'Pošlji email →'}
            </button>
          </div>
        </div>

        {/* RESULT */}
        {result && (
          <div style={{
            padding: '12px 16px', borderRadius: 10, marginBottom: 16,
            background: result.type === 'success' ? '#E1F5EE' : '#FCEBEB',
            border: `0.5px solid ${result.type === 'success' ? '#A6D9C3' : '#F7C1C1'}`,
            color: result.type === 'success' ? '#0E5E3B' : '#A32D2D',
            fontSize: 13,
          }}>
            {result.type === 'success' ? '✓' : '✕'} {result.message}
          </div>
        )}

        {/* INFO */}
        <div style={{ fontSize: 12, color: '#888', textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
          Izvoz je informativen. Podatki morajo biti pregledani in potrjeni s strani 
          certificiranega računovodje. Računko ne nadomešča profesionalne računovodske storitve.
        </div>

      </div>
    </div>
  )
}
