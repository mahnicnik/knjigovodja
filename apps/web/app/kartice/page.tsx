'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import posthog from 'posthog-js'

const PROCESSORS = [
  { value: 'sumup', label: 'SumUp', fee: 1.69 },
  { value: 'wordline', label: 'Wordline / Payten', fee: 1.5 },
  { value: 'nlb', label: 'NLB POS terminal', fee: 1.2 },
  { value: 'skb', label: 'SKB POS terminal', fee: 1.3 },
  { value: 'stripe', label: 'Stripe', fee: 1.4 },
  { value: 'drugo', label: 'Drugo', fee: 0 },
]

const MONTHS = ['Januar','Februar','Marec','April','Maj','Junij',
                'Julij','Avgust','September','Oktober','November','December']

export default function KarticeePage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [settlements, setSettlements] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [processor, setProcessor] = useState('sumup')
  const [customFee, setCustomFee] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')

  // ── Paketni uvoz vec izpiskov naenkrat (24.7.2026) ──
  const [batchMode, setBatchMode] = useState(false)
  const [batchFiles, setBatchFiles] = useState<Array<{
    file: File
    status: 'pending' | 'scanning' | 'saved' | 'error'
    error?: string
    processor?: string
    gross?: number
  }>>([])
  const [batchProcessing, setBatchProcessing] = useState(false)
  const batchFileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    period_from: '',
    period_to: '',
    gross_sales: '',
    fee_amount: '',
    fee_pct: '',
    net_payout: '',
    transactions: '',
    notes: '',
  })
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
      const stored = localStorage.getItem(`kartice_${o.id}`)
      if (stored) setSettlements(JSON.parse(stored))
    }
    setLoading(false)
  }

  function saveSettlements(s: any[]) {
    if (!org) return
    setSettlements(s)
    localStorage.setItem(`kartice_${org.id}`, JSON.stringify(s))
  }

  // Avtomatski izračun
  const gross = parseFloat(form.gross_sales) || 0
  const selectedProcessor = PROCESSORS.find(p => p.value === processor)!
  const feePct = customFee ? parseFloat(customFee) : selectedProcessor.fee
  const autoFee = Math.round(gross * (feePct / 100) * 100) / 100
  const autoNet = Math.round((gross - autoFee) * 100) / 100

  async function handleSave() {
    if (!org || !form.gross_sales || !form.period_from) return
    setSaving(true)

    const grossAmt = parseFloat(form.gross_sales)
    const feeAmt = parseFloat(form.fee_amount) || autoFee
    const netAmt = parseFloat(form.net_payout) || autoNet
    const dateFrom = form.period_from
    const dateTo = form.period_to || form.period_from

    // Knjižimo BRUTO prihodek v KPO
    await supabase.from('kpo_entries').insert({
      org_id: org.id,
      entry_date: dateTo,
      description: `Kartično poslovanje ${selectedProcessor.label} — ${dateFrom} do ${dateTo}`,
      entry_type: 'income',
      income: grossAmt,
      expense: 0,
      vat_in: 0,
      vat_out: 0,
      category: 'Kartično poslovanje',
      notes: `${form.transactions || '?'} transakcij · provizija ${feePct}%`,
    })

    // Knjižimo PROVIZIJO kot strošek
    if (feeAmt > 0) {
      await supabase.from('kpo_entries').insert({
        org_id: org.id,
        entry_date: dateTo,
        description: `Provizija ${selectedProcessor.label} — ${feePct}%`,
        entry_type: 'expense',
        income: 0,
        expense: feeAmt,
        vat_in: 0,
        vat_out: 0,
        category: 'Bančne provizije',
        notes: `Provizija od €${grossAmt} kartičnih plačil`,
      })
    }

    // Shranimo obračun
    const settlement = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      period_from: dateFrom,
      period_to: dateTo,
      processor: selectedProcessor.label,
      gross_sales: grossAmt,
      fee_pct: feePct,
      fee_amount: feeAmt,
      net_payout: netAmt,
      transactions: parseInt(form.transactions) || 0,
      notes: form.notes,
      booked: true,
    }
    saveSettlements([settlement, ...settlements])

    setForm({ period_from: '', period_to: '', gross_sales: '', fee_amount: '', fee_pct: '', net_payout: '', transactions: '', notes: '' })
    setShowForm(false)
    setSaving(false)
  }

  async function handleFileScan(file: File) {
    setScanning(true)
    setScanError('')
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = () => reject(new Error('Napaka pri branju datoteke'))
        reader.readAsDataURL(file)
      })
      const res = await fetch('/api/kartice/parse-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64: base64, mediaType: file.type }),
      })
      const data = await res.json()
      if (!res.ok) { setScanError(data.error || 'Napaka pri skeniranju'); setScanning(false); return }
      const s = data.settlement
      if (s.processor_guess && PROCESSORS.some(p => p.value === s.processor_guess)) {
        setProcessor(s.processor_guess)
      }
      if (s.fee_pct != null) setCustomFee(String(s.fee_pct))
      setForm({
        period_from: s.period_from || '',
        period_to: s.period_to || s.period_from || '',
        gross_sales: s.gross_sales != null ? String(s.gross_sales) : '',
        fee_amount: s.fee_amount != null ? String(s.fee_amount) : '',
        fee_pct: s.fee_pct != null ? String(s.fee_pct) : '',
        net_payout: s.net_payout != null ? String(s.net_payout) : '',
        transactions: s.transactions != null ? String(s.transactions) : '',
        notes: '',
      })
      setShowForm(true)
    } catch (e: any) {
      setScanError(e.message || 'Napaka pri skeniranju')
    }
    setScanning(false)
  }

  // Izbira vec datotek za paketni uvoz
  function handleBatchFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []) as File[]
    setBatchFiles(files.map(file => ({ file, status: 'pending' as const })))
  }

  // Zaporedno obdela vse izpiske v paketu: skeniraj -> ce uspesno
  // prepoznano, SAMODEJNO knjizi (oba KPO vnosa) + doda v seznam obracunov.
  async function processBatch() {
    if (!org) return
    setBatchProcessing(true)
    const newSettlements: any[] = []

    for (let i = 0; i < batchFiles.length; i++) {
      const item = batchFiles[i]
      setBatchFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'scanning' } : f))
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve((reader.result as string).split(',')[1])
          reader.onerror = () => reject(new Error('Napaka pri branju datoteke'))
          reader.readAsDataURL(item.file)
        })
        const res = await fetch('/api/kartice/parse-statement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64: base64, mediaType: item.file.type }),
        })
        const data = await res.json()
        const s = data.settlement
        if (!res.ok || !s || s.gross_sales == null || !s.period_from) {
          setBatchFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error', error: data.error || 'AI ni prepoznal podatkov na izpisku' } : f))
          continue
        }

        const proc = PROCESSORS.find(p => p.value === s.processor_guess) || PROCESSORS.find(p => p.value === 'drugo')!
        const feePct = s.fee_pct != null ? Number(s.fee_pct) : proc.fee
        const grossAmt = Number(s.gross_sales)
        const feeAmt = s.fee_amount != null ? Number(s.fee_amount) : Math.round(grossAmt * (feePct / 100) * 100) / 100
        const netAmt = s.net_payout != null ? Number(s.net_payout) : Math.round((grossAmt - feeAmt) * 100) / 100
        const dateFrom = s.period_from
        const dateTo = s.period_to || s.period_from

        await supabase.from('kpo_entries').insert({
          org_id: org.id,
          entry_date: dateTo,
          description: `Kartično poslovanje ${proc.label} — ${dateFrom} do ${dateTo}`,
          entry_type: 'income',
          income: grossAmt,
          expense: 0,
          vat_in: 0,
          vat_out: 0,
          category: 'Kartično poslovanje',
          notes: `${s.transactions ?? '?'} transakcij · provizija ${feePct}% · paketni uvoz`,
        })
        if (feeAmt > 0) {
          await supabase.from('kpo_entries').insert({
            org_id: org.id,
            entry_date: dateTo,
            description: `Provizija ${proc.label} — ${feePct}%`,
            entry_type: 'expense',
            income: 0,
            expense: feeAmt,
            vat_in: 0,
            vat_out: 0,
            category: 'Bančne provizije',
            notes: `Provizija od €${grossAmt} kartičnih plačil · paketni uvoz`,
          })
        }

        const settlement = {
          id: Date.now().toString() + '_' + i,
          date: new Date().toISOString(),
          period_from: dateFrom,
          period_to: dateTo,
          processor: proc.label,
          gross_sales: grossAmt,
          fee_pct: feePct,
          fee_amount: feeAmt,
          net_payout: netAmt,
          transactions: parseInt(s.transactions) || 0,
          notes: 'Paketni uvoz',
          booked: true,
        }
        newSettlements.push(settlement)
        posthog.capture('settlement_saved', { processor: proc.value, gross_sales: grossAmt, batch: true })
        setBatchFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'saved', processor: proc.label, gross: grossAmt } : f))
      } catch (err: any) {
        setBatchFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error', error: err.message || 'Neznana napaka' } : f))
      }
    }

    if (newSettlements.length > 0) {
      saveSettlements([...newSettlements, ...settlements])
    }
    setBatchProcessing(false)
  }
  const totalGross = settlements.reduce((s, r) => s + r.gross_sales, 0)
  const totalFees = settlements.reduce((s, r) => s + r.fee_amount, 0)
  const totalNet = settlements.reduce((s, r) => s + r.net_payout, 0)

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Nalagam...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <div>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Domov</Link>
          <h1 className="font-semibold text-gray-900 mt-0.5">Kartično poslovanje</h1>
        </div>
        <div className="flex gap-2">
          <label className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium cursor-pointer hover:border-gray-400">
            {scanning ? '⏳ Skeniram...' : '📄 Uvozi iz PDF/slike'}
            <input type="file" accept="application/pdf,image/*" className="hidden" disabled={scanning}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileScan(f); e.target.value = '' }} />
          </label>
          <button
            onClick={() => { setBatchMode(!batchMode); setBatchFiles([]) }}
            className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:border-gray-400"
          >
            📚 Naloži več naenkrat
          </button>
          <button onClick={() => setShowForm(!showForm)}
            className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
            + Nov obračun
          </button>
        </div>
      </div>

      {batchMode && (
        <div className="max-w-4xl mx-auto px-6 pt-8">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
            <h3 className="font-semibold text-gray-900 mb-2">Paketni uvoz več izpiskov</h3>
            <p className="text-gray-500 text-sm mb-4">Izberite več PDF/slik hkrati - AI bo vsako prebral in samodejno knjižil.</p>
            {batchFiles.length === 0 ? (
              <div
                onClick={() => batchFileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-gray-300"
              >
                <div className="text-4xl mb-3">📚</div>
                <div className="bg-gray-900 text-white px-6 py-2.5 rounded-xl text-sm font-medium inline-block">Izberi datoteke</div>
                <input ref={batchFileRef} type="file" accept="application/pdf,image/*" multiple onChange={handleBatchFileSelect} className="hidden" />
              </div>
            ) : (
              <div>
                <div className="space-y-2 mb-4 max-h-96 overflow-y-auto">
                  {batchFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                      <span className="truncate flex-1">{f.file.name}</span>
                      {f.status === 'pending' && <span className="text-gray-400 text-xs">čaka</span>}
                      {f.status === 'scanning' && <span className="text-blue-600 text-xs">⟳ skenira...</span>}
                      {f.status === 'saved' && <span className="text-green-600 text-xs">✓ {f.processor} · €{f.gross?.toFixed(2)}</span>}
                      {f.status === 'error' && <span className="text-red-600 text-xs" title={f.error}>✗ {f.error}</span>}
                    </div>
                  ))}
                </div>
                {!batchProcessing && batchFiles.every(f => f.status === 'pending') && (
                  <button onClick={processBatch} className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-medium">
                    Obdelaj {batchFiles.length} {batchFiles.length === 1 ? 'datoteko' : 'datotek'}
                  </button>
                )}
                {batchProcessing && <div className="text-center text-sm text-gray-500">⟳ Obdelujem...</div>}
                {!batchProcessing && batchFiles.every(f => f.status !== 'pending' && f.status !== 'scanning') && batchFiles.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm text-gray-600 text-center">
                      Shranjeno: {batchFiles.filter(f => f.status === 'saved').length} / {batchFiles.length}
                      {batchFiles.some(f => f.status === 'error') && ` · Napak: ${batchFiles.filter(f => f.status === 'error').length}`}
                    </div>
                    <button onClick={() => setBatchFiles([])} className="w-full text-gray-500 text-sm py-2">Naloži še</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Razlaga */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-6">
          <div className="font-medium text-blue-800 text-sm mb-2">💳 Kako deluje kartični obračun</div>
          <div className="text-blue-700 text-xs leading-relaxed">
            Ko prejmete nakazilo od kartičnega procesorja (SumUp, Wordline...) vnesite obračun tukaj.
            Aplikacija samodejno poknjiži <strong>bruto prodajo kot prihodek</strong> in
            <strong> provizijo kot strošek</strong> v KPO knjigo.
            Tako bo vaš KPO usklajen z bančnim izpiskom.
          </div>
        </div>

        {/* Povzetek */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Bruto prodaja</div>
            <div className="text-2xl font-semibold text-green-600">€{totalGross.toFixed(2)}</div>
            <div className="text-xs text-gray-400 mt-1">Kar so stranke plačale</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Skupne provizije</div>
            <div className="text-2xl font-semibold text-red-500">€{totalFees.toFixed(2)}</div>
            <div className="text-xs text-gray-400 mt-1">Strošek procesorja</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Neto nakazilo</div>
            <div className="text-2xl font-semibold">€{totalNet.toFixed(2)}</div>
            <div className="text-xs text-gray-400 mt-1">Prejeto na TRR</div>
          </div>
        </div>

        {/* Forma */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-900 p-6 mb-6">
            <h3 className="font-medium text-gray-900 mb-4">Vnesi kartični obračun</h3>
            {scanError && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl p-3 mb-4">
                {scanError}
              </div>
            )}

            {/* Procesor */}
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-2">Kartični procesor</label>
              <div className="grid grid-cols-3 gap-2">
                {PROCESSORS.map(p => (
                  <button key={p.value} onClick={() => setProcessor(p.value)}
                    className={`px-3 py-2 rounded-xl text-sm border transition-colors ${processor === p.value ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                    {p.label}
                    {p.fee > 0 && <span className="text-xs opacity-70 ml-1">({p.fee}%)</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Obdobje od *</label>
                <input type="date" value={form.period_from}
                  onChange={e => setForm({...form, period_from: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Obdobje do</label>
                <input type="date" value={form.period_to}
                  onChange={e => setForm({...form, period_to: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Bruto prodaja (€) *</label>
                <input type="number" value={form.gross_sales}
                  onChange={e => setForm({...form, gross_sales: e.target.value})}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Št. transakcij</label>
                <input type="number" value={form.transactions}
                  onChange={e => setForm({...form, transactions: e.target.value})}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  Provizija % <span className="text-gray-400">(privzeto {feePct}%)</span>
                </label>
                <input type="number" value={customFee}
                  onChange={e => setCustomFee(e.target.value)}
                  placeholder={feePct.toString()}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Opombe</label>
                <input value={form.notes}
                  onChange={e => setForm({...form, notes: e.target.value})}
                  placeholder="npr. tedenski obračun"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>

            {/* Avtomatski izračun */}
            {gross > 0 && (
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <div className="text-xs font-medium text-gray-500 mb-3 uppercase">Avtomatski izračun</div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Bruto prodaja</div>
                    <div className="text-lg font-semibold text-green-600">€{gross.toFixed(2)}</div>
                    <div className="text-xs text-gray-400">→ KPO prihodek</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Provizija {feePct}%</div>
                    <div className="text-lg font-semibold text-red-500">€{autoFee.toFixed(2)}</div>
                    <div className="text-xs text-gray-400">→ KPO strošek</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Neto nakazilo</div>
                    <div className="text-lg font-semibold">€{autoNet.toFixed(2)}</div>
                    <div className="text-xs text-gray-400">→ na TRR</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-blue-700 bg-blue-50 rounded-lg p-2">
                  ✓ Aplikacija bo samodejno poknjižila €{gross.toFixed(2)} kot prihodek
                  in €{autoFee.toFixed(2)} kot strošek v KPO knjigo.
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleSave}
                disabled={saving || !form.gross_sales || !form.period_from}
                className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-40">
                {saving ? 'Shranjujem...' : '✓ Poknjiži obračun v KPO'}
              </button>
              <button onClick={() => setShowForm(false)}
                className="border border-gray-200 rounded-xl px-6 py-2.5 text-sm">
                Prekliči
              </button>
            </div>
          </div>
        )}

        {/* Seznam obračunov */}
        {settlements.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-4">💳</div>
            <h3 className="font-semibold text-gray-900 mb-2">Še ni kartičnih obračunov</h3>
            <p className="text-gray-500 text-sm mb-2">
              Ko prejmete nakazilo od SumUp, Wordline ali banke,<br/>
              vnesite obračun da se KPO pravilno uskladi.
            </p>
            <button onClick={() => setShowForm(true)}
              className="bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-medium mt-4">
              + Vnesi prvi obračun
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50 border-b border-gray-100">
              <div className="col-span-3 text-xs font-medium text-gray-500">Obdobje</div>
              <div className="col-span-2 text-xs font-medium text-gray-500">Procesor</div>
              <div className="col-span-1 text-xs font-medium text-gray-500 text-center">Transakcij</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Bruto</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Provizija</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Neto TRR</div>
            </div>
            {settlements.map((s, i) => (
              <div key={s.id} className={`grid grid-cols-12 gap-2 px-6 py-3 items-center ${i < settlements.length-1 ? 'border-b border-gray-50' : ''}`}>
                <div className="col-span-3 text-xs text-gray-900">
                  {new Date(s.period_from).toLocaleDateString('sl-SI')}
                  {s.period_to !== s.period_from && ` — ${new Date(s.period_to).toLocaleDateString('sl-SI')}`}
                </div>
                <div className="col-span-2 text-xs text-gray-600">{s.processor}</div>
                <div className="col-span-1 text-xs text-center text-gray-500">{s.transactions || '—'}</div>
                <div className="col-span-2 text-xs text-right font-medium text-green-600">€{s.gross_sales.toFixed(2)}</div>
                <div className="col-span-2 text-xs text-right text-red-500">
                  −€{s.fee_amount.toFixed(2)}
                  <span className="text-gray-400 ml-1">({s.fee_pct}%)</span>
                </div>
                <div className="col-span-2 text-xs text-right font-semibold">€{s.net_payout.toFixed(2)}</div>
              </div>
            ))}
            <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50 border-t border-gray-200">
              <div className="col-span-6 text-xs font-medium text-gray-700">SKUPAJ</div>
              <div className="col-span-2 text-xs text-right font-semibold text-green-600">€{totalGross.toFixed(2)}</div>
              <div className="col-span-2 text-xs text-right font-semibold text-red-500">−€{totalFees.toFixed(2)}</div>
              <div className="col-span-2 text-xs text-right font-semibold">€{totalNet.toFixed(2)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}