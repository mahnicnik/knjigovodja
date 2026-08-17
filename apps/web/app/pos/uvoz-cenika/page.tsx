'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

interface ParsedItem {
  name: string
  category: string
  unit: string
  sale_price: number
  vat_rate: number
  selected: boolean
}

export default function UvozCenikaPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState<ParsedItem[]>([])
  const [error, setError] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setProcessing(true)
    setError('')
    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      let body: any

      if (isPdf) {
        const maxBytes = 4 * 1024 * 1024
        if (file.size > maxBytes) {
          setError(`PDF je prevelik (${(file.size / 1024 / 1024).toFixed(1)}MB). Največja velikost je 4MB.`)
          setProcessing(false)
          return
        }
        const arrayBuffer = await file.arrayBuffer()
        const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
        body = { pdfBase64 }
      } else {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = (ev) => resolve(ev.target?.result as string)
          reader.readAsDataURL(file)
        })
        body = { image: dataUrl.split(',')[1], mediaType: file.type }
      }

      const res = await fetch('/api/pos/parse-cenik', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Napaka pri branju cenika')
        setProcessing(false)
        return
      }
      setItems((data.items || []).map((it: any) => ({
        name: it.name || '',
        category: it.category || '',
        unit: it.unit || 'kos',
        sale_price: Number(it.sale_price) || 0,
        vat_rate: Number(it.vat_rate) ?? 22,
        selected: true,
      })))
    } catch (e: any) {
      setError('Napaka: ' + e.message)
    }
    setProcessing(false)
  }

  function updateItem(i: number, field: keyof ParsedItem, value: any) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function toggleAll(selected: boolean) {
    setItems(prev => prev.map(it => ({ ...it, selected })))
  }

  async function saveAll() {
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: member } = await supabase.from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
      if (!member) return

      const toInsert = items.filter(it => it.selected && it.name.trim())
      if (toInsert.length === 0) {
        setError('Izberite vsaj en izdelek')
        setSaving(false)
        return
      }

      const { error: insertError } = await supabase.from('inventory_items').insert(
        toInsert.map(it => ({
          org_id: member.org_id,
          name: it.name.trim(),
          category: it.category.trim() || null,
          unit: it.unit || 'kos',
          purchase_price: 0,
          sale_price: it.sale_price,
          vat_rate: it.vat_rate,
          current_stock: 0,
          min_stock: 0,
        }))
      )

      if (insertError) {
        setError('Napaka pri shranjevanju: ' + insertError.message)
        setSaving(false)
        return
      }

      router.push('/zaloge')
    } catch (e: any) {
      setError('Napaka: ' + e.message)
    }
    setSaving(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F7F6F2', padding: '24px 16px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <Link href="/zaloge" style={{ fontSize: 13, color: '#888', textDecoration: 'none' }}>← Zaloge</Link>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0D1F12', marginTop: 4 }}>Uvoz cenika</h1>
          </div>
        </div>

        {items.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24 }}>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
              💡 Naložite fotografijo ali PDF vašega cenika, ponudbe ali seznama izdelkov — AI bo samodejno prepoznal izdelke in cene.
            </p>
            <div
              onClick={() => fileRef.current?.click()}
              style={{ border: '2px dashed #e5e7eb', borderRadius: 12, padding: 48, textAlign: 'center', cursor: 'pointer', background: '#FAFAF8' }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12' }}>
                {processing ? 'Analiziram cenik...' : 'Kliknite ali povlecite sliko / PDF cenika'}
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Podprte: JPG, PNG, PDF</div>
              <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={handleFile} style={{ display: 'none' }} />
            </div>
            {error && <div style={{ marginTop: 16, fontSize: 13, color: '#DC2626' }}>{error}</div>}
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12' }}>
                Najdenih {items.length} izdelkov — preverite in uredite pred shranjevanjem
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => toggleAll(true)} style={{ fontSize: 12, color: '#1D9E75', background: 'none', border: 0, cursor: 'pointer' }}>Izberi vse</button>
                <button onClick={() => toggleAll(false)} style={{ fontSize: 12, color: '#888', background: 'none', border: 0, cursor: 'pointer' }}>Počisti</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '55vh', overflowY: 'auto' }}>
              {items.map((it, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 2fr 1fr 80px 90px 70px 28px', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <input type="checkbox" checked={it.selected} onChange={e => updateItem(i, 'selected', e.target.checked)} />
                  <input value={it.name} onChange={e => updateItem(i, 'name', e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 8px', fontSize: 13 }} />
                  <input value={it.category} onChange={e => updateItem(i, 'category', e.target.value)} placeholder="Kategorija" style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 8px', fontSize: 13 }} />
                  <input value={it.unit} onChange={e => updateItem(i, 'unit', e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 8px', fontSize: 13, textAlign: 'center' }} />
                  <input type="number" onFocus={e => e.target.select()} step="0.01" value={it.sale_price} onChange={e => updateItem(i, 'sale_price', Number(e.target.value))} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 8px', fontSize: 13, textAlign: 'right' }} />
                  <select value={it.vat_rate} onChange={e => updateItem(i, 'vat_rate', Number(e.target.value))} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 4px', fontSize: 13 }}>
                    <option value={22}>22%</option>
                    <option value={9.5}>9.5%</option>
                    <option value={0}>0%</option>
                  </select>
                  <button onClick={() => removeItem(i)} style={{ background: 'none', border: 0, color: '#aaa', cursor: 'pointer', fontSize: 18 }}>×</button>
                </div>
              ))}
            </div>

            {error && <div style={{ marginTop: 12, fontSize: 13, color: '#DC2626' }}>{error}</div>}

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={() => setItems([])} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, background: '#fff', cursor: 'pointer' }}>
                Prekliči
              </button>
              <button
                onClick={saveAll}
                disabled={saving}
                style={{ flex: 1, padding: '10px 18px', borderRadius: 8, border: 0, fontSize: 13, fontWeight: 600, background: '#0D1F12', color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Shranjujem...' : `Shrani ${items.filter(it => it.selected).length} izbranih izdelkov`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
