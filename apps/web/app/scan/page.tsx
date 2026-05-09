'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import posthog from 'posthog-js'

export default function ScanPage() {
  const [org, setOrg] = useState<any>(null)
  const [image, setImage] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    vendor: '',
    receipt_date: new Date().toISOString().split('T')[0],
    amount_net: '',
    vat_rate: '22',
    category: 'Pisarniški material',
    description: '',
  })
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const categories = [
    'Pisarniški material', 'Komunikacije', 'Programska oprema',
    'Transport', 'Prehrana', 'Izobraževanje', 'Marketing',
    'Oprema', 'Storitve', 'Drugo'
  ]

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase
        .from('org_members')
        .select('organizations(*)')
        .eq('user_id', user.id)
        .single()
      if (member) setOrg((member as any).organizations)
    }
    load()
  }, [])

  async function compressImage(dataUrl: string): Promise<string> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()
      img.onload = () => {
        const maxSize = 1200
        let { width, height } = img
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize
            width = maxSize
          } else {
            width = (width / height) * maxSize
            height = maxSize
          }
        }
        canvas.width = width
        canvas.height = height
        ctx?.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = dataUrl
    })
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setProcessing(true)
    setResult(null)
  
    try {
      // PDF — pošljemo direktno na API kot dokument
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const arrayBuffer = await file.arrayBuffer()
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
        // Shranimo PDF base64 za API klic
        ;(window as any).__pdfBase64 = base64
        // Pokažemo placeholder
        setImage('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y5ZmFmYiIvPjx0ZXh0IHg9IjIwMCIgeT0iOTAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIzMiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzZiNzI4MCI+8J+ThDwvdGV4dD48dGV4dCB4PSIyMDAiIHk9IjEzMCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjNmI3MjgwIj5QREYgbmFsb8W+ZW48L3RleHQ+PC9zdmc+')
        setProcessing(false)
        return
      }
  
      // HEIC
      if (file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic')) {
        const heic2any = (await import('heic2any')).default
        const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 }) as Blob
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = (ev) => resolve(ev.target?.result as string)
          reader.readAsDataURL(blob)
        })
        const compressed = await compressImage(dataUrl)
        ;(window as any).__pdfBase64 = null
        setImage(compressed)
        setProcessing(false)
        return
      }
  
      // JPG/PNG
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = (ev) => resolve(ev.target?.result as string)
        reader.readAsDataURL(file)
      })
      const compressed = await compressImage(dataUrl)
      ;(window as any).__pdfBase64 = null
      setImage(compressed)
  
    } catch (err: any) {
      alert('Napaka pri nalaganju: ' + err.message)
    }
    setProcessing(false)
  }

  async function scanReceipt() {
    if (!image) return
    setScanning(true)
    try {
      const pdfBase64 = (window as any).__pdfBase64
      
      const body = pdfBase64
        ? { pdfBase64 }
        : { image: image.split(',')[1], mediaType: 'image/jpeg' }
  
      const response = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (data.error) {
        alert('Napaka pri skeniranju: ' + data.error)
        setScanning(false)
        return
      }
      posthog.capture('receipt_scanned', {
        vendor: data.vendor,
        amount_net: data.amount_net,
        vat_rate: data.vat_rate,
        category: data.category,
      })
      setResult(data)
      setForm({
        vendor: data.vendor || '',
        receipt_date: data.date || new Date().toISOString().split('T')[0],
        amount_net: data.amount_net?.toString() || '',
        vat_rate: data.vat_rate?.toString() || '0',
        category: data.category || 'Marketing',
        description: data.description || '',
      })
    } catch (err) {
      alert('Napaka pri skeniranju')
    }
    setScanning(false)
  }

  async function handleSave() {
    if (!org || !form.vendor || !form.amount_net) return
    setSaving(true)
    const amountNet = parseFloat(form.amount_net)
    const vatRate = parseFloat(form.vat_rate)
    const vatAmount = amountNet * (vatRate / 100)
    const amountTotal = amountNet + vatAmount

    await supabase.from('receipts').insert({
      org_id: org.id,
      vendor: form.vendor,
      receipt_date: form.receipt_date,
      amount_net: amountNet,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      amount_total: amountTotal,
      description: form.description,
      category: form.category,
      status: 'confirmed',
      is_deductible: true,
    })

    await supabase.from('kpo_entries').insert({
      org_id: org.id,
      entry_date: form.receipt_date,
      description: `${form.vendor} — ${form.category}`,
      entry_type: 'expense',
      income: 0,
      expense: amountNet,
      vat_in: vatAmount,
      vat_out: 0,
      category: form.category,
    })

    posthog.capture('receipt_saved', {
      category: form.category,
      amount_net: amountNet,
      amount_total: amountTotal,
      vat_rate: vatRate,
      ai_scanned: !!result,
    })
    setSaving(false)
    router.push('/expenses')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <div>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Domov</Link>
          <h1 className="font-semibold text-gray-900 mt-0.5">Skeniraj račun</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {!image ? (
          <div
            onClick={() => !processing && fileRef.current?.click()}
            className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-16 text-center cursor-pointer hover:border-gray-400 transition-colors mb-6"
          >
            {processing ? (
              <>
                <div className="text-5xl mb-4 animate-spin inline-block">⟳</div>
                <h3 className="font-semibold text-gray-900 mb-2">Pretvarjam datoteko...</h3>
                <p className="text-gray-500 text-sm">Prosimo počakajte</p>
              </>
            ) : (
              <>
                <div className="text-5xl mb-4">📸</div>
                <h3 className="font-semibold text-gray-900 mb-2">Fotografirajte ali naložite račun</h3>
                <p className="text-gray-500 text-sm mb-2">Podprto: JPG, PNG, PDF, HEIC (iPhone)</p>
                <div className="flex gap-2 justify-center mb-4">
                  <span className="text-xs bg-gray-100 px-2 py-1 rounded">📄 PDF</span>
                  <span className="text-xs bg-gray-100 px-2 py-1 rounded">🖼 JPG/PNG</span>
                  <span className="text-xs bg-gray-100 px-2 py-1 rounded">📱 HEIC</span>
                </div>
                <div className="bg-gray-900 text-white px-6 py-2.5 rounded-xl text-sm font-medium inline-block">
                  Izberi datoteko
                </div>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf,.heic,.heif"
              onChange={handleFile}
              className="hidden"
            />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium text-gray-900">Naložena datoteka</span>
              <button onClick={() => { setImage(null); setResult(null) }} className="text-xs text-gray-500 hover:text-gray-900">
                Zamenjaj
              </button>
            </div>
            <img src={image} alt="Račun" className="w-full max-h-72 object-contain rounded-xl bg-gray-50" />
            {!result && (
              <button
                onClick={scanReceipt}
                disabled={scanning}
                className="w-full mt-4 bg-gray-900 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-50"
              >
                {scanning ? '⟳ AI bere podatke...' : '🤖 Skeniraj s AI'}
              </button>
            )}
          </div>
        )}

        {result && (
          <div className="bg-green-50 border border-green-100 rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-green-600 font-medium text-sm">✓ AI je prebral podatke</span>
              <span className="text-xs text-green-500">Preverite in po potrebi popravite</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Dobavitelj', value: result.vendor },
                { label: 'Datum', value: result.date },
                { label: 'Znesek brez DDV', value: result.amount_net ? `€${result.amount_net}` : '—' },
                { label: 'DDV', value: result.vat_rate !== undefined ? `${result.vat_rate}%` : '—' },
              ].map(item => (
                <div key={item.label} className="bg-white rounded-xl p-3">
                  <div className="text-xs text-gray-500 mb-0.5">{item.label}</div>
                  <div className="text-sm font-medium text-gray-900">{item.value || '—'}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(result || image) && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-medium text-gray-900 mb-4">
              {result ? 'Preverite in potrdite' : 'Vnesite podatke ročno'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Dobavitelj *</label>
                <input
                  value={form.vendor}
                  onChange={e => setForm({...form, vendor: e.target.value})}
                  placeholder="npr. Meta Platforms Ireland"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Datum</label>
                  <input
                    type="date"
                    value={form.receipt_date}
                    onChange={e => setForm({...form, receipt_date: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Kategorija</label>
                  <select
                    value={form.category}
                    onChange={e => setForm({...form, category: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                  >
                    {categories.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Znesek brez DDV (€) *</label>
                  <input
                    type="number"
                    value={form.amount_net}
                    onChange={e => setForm({...form, amount_net: e.target.value})}
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">DDV stopnja</label>
                  <select
                    value={form.vat_rate}
                    onChange={e => setForm({...form, vat_rate: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                  >
                    <option value="22">22%</option>
                    <option value="9.5">9.5%</option>
                    <option value="0">0% (brez DDV)</option>
                  </select>
                </div>
              </div>

              {form.amount_net && (
                <div className="bg-gray-50 rounded-xl p-3 flex gap-6 text-sm">
                  <div>
                    <span className="text-gray-500">DDV: </span>
                    <span className="font-medium">€{(parseFloat(form.amount_net||'0') * parseFloat(form.vat_rate) / 100).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Skupaj: </span>
                    <span className="font-semibold">€{(parseFloat(form.amount_net||'0') * (1 + parseFloat(form.vat_rate)/100)).toFixed(2)}</span>
                  </div>
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving || !form.vendor || !form.amount_net}
                className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-medium mt-2 disabled:opacity-40"
              >
                {saving ? 'Shranjujem...' : '✓ Shrani v stroške'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}