'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function ZalogaPage() {
  const [org, setOrg] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showMovement, setShowMovement] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    sku: '',
    unit: 'kos',
    quantity: '',
    min_quantity: '',
    purchase_price: '',
    sale_price: '',
    vat_rate: '22',
    category: '',
  })
  const [movement, setMovement] = useState({
    type: 'in',
    quantity: '',
    price: '',
    note: '',
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
      // Naloži artikle iz localStorage (ker nimamo warehouse tabele v DB)
      const stored = localStorage.getItem(`zaloga_${o.id}`)
      if (stored) setItems(JSON.parse(stored))
    }
    setLoading(false)
  }

  function saveItems(newItems: any[]) {
    if (!org) return
    setItems(newItems)
    localStorage.setItem(`zaloga_${org.id}`, JSON.stringify(newItems))
  }

  function handleAddItem() {
    if (!form.name) return
    setSaving(true)
    const newItem = {
      id: Date.now().toString(),
      name: form.name,
      sku: form.sku,
      unit: form.unit,
      quantity: parseFloat(form.quantity) || 0,
      min_quantity: parseFloat(form.min_quantity) || 0,
      purchase_price: parseFloat(form.purchase_price) || 0,
      sale_price: parseFloat(form.sale_price) || 0,
      vat_rate: parseFloat(form.vat_rate) || 22,
      category: form.category,
      movements: [],
      created_at: new Date().toISOString(),
    }
    saveItems([...items, newItem])
    setForm({ name: '', sku: '', unit: 'kos', quantity: '', min_quantity: '', purchase_price: '', sale_price: '', vat_rate: '22', category: '' })
    setShowForm(false)
    setSaving(false)
  }

  function handleMovement(itemId: string) {
    const qty = parseFloat(movement.quantity)
    if (!qty) return
    const updated = items.map(item => {
      if (item.id !== itemId) return item
      const newQty = movement.type === 'in' ? item.quantity + qty : item.quantity - qty
      const mov = {
        type: movement.type,
        quantity: qty,
        price: parseFloat(movement.price) || item.purchase_price,
        note: movement.note,
        date: new Date().toISOString(),
      }
      return { ...item, quantity: Math.max(0, newQty), movements: [...(item.movements || []), mov] }
    })
    saveItems(updated)
    setShowMovement(null)
    setMovement({ type: 'in', quantity: '', price: '', note: '' })
  }

  function deleteItem(id: string) {
    if (!confirm('Izbrišete artikel?')) return
    saveItems(items.filter(i => i.id !== id))
  }

  const totalValue = items.reduce((s, i) => s + i.quantity * i.purchase_price, 0)
  const lowStock = items.filter(i => i.min_quantity > 0 && i.quantity <= i.min_quantity)

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Nalagam...</p>
    </div>
  )
  function printPopis() {
    const html = `<!DOCTYPE html>
  <html lang="sl"><head><meta charset="UTF-8">
  <style>
    body{font-family:Arial,sans-serif;font-size:10px;color:#111;padding:20px 30px}
    h1{font-size:16px;font-weight:bold;margin-bottom:4px}
    .sub{color:#666;font-size:10px;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;margin:12px 0}
    th{background:#111;color:white;padding:6px 10px;text-align:left;font-size:9px}
    th.r{text-align:right}
    td{padding:5px 10px;border-bottom:1px solid #f0f0f0}
    td.r{text-align:right}
    .total{font-weight:bold;background:#f5f5f5}
    .sign{display:flex;justify-content:space-between;margin-top:40px}
    .sign-line{border-top:1px solid #111;width:220px;padding-top:4px;font-size:9px;color:#666}
  </style></head><body>
  <h1>POPIS ZALOGE na dan 31. 12. ${new Date().getFullYear()}</h1>
  <div class="sub">${org?.name} · Davčna: ${org?.tax_number} · Datum popisa: ${new Date().toLocaleDateString('sl-SI')}</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Artikel</th>
        <th>Šifra</th>
        <th>Kategorija</th>
        <th class="r">Količina</th>
        <th>Enota</th>
        <th class="r">Nab. cena</th>
        <th class="r">Vrednost</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((item, i) => `
        <tr>
          <td>${i+1}</td>
          <td>${item.name}</td>
          <td>${item.sku || '—'}</td>
          <td>${item.category || '—'}</td>
          <td class="r">${item.quantity}</td>
          <td>${item.unit}</td>
          <td class="r">€${item.purchase_price.toFixed(2)}</td>
          <td class="r">€${(item.quantity * item.purchase_price).toFixed(2)}</td>
        </tr>
      `).join('')}
      <tr class="total">
        <td colspan="7">SKUPAJ VREDNOST ZALOGE</td>
        <td class="r">€${totalValue.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>
  <div style="margin-top:16px;background:#f9f9f9;padding:12px;border-radius:6px;font-size:10px">
    <strong>Opomba za DDD:</strong> Vrednost zaloge na dan 31.12. = €${totalValue.toFixed(2)}.
    Ta znesek je vaše sredstvo in se ne šteje kot odhodek leta ${new Date().getFullYear()}.
    Posredujte računovodkinji za pripravo dohodninske napovedi.
  </div>
  <div class="sign">
    <div><div class="sign-line">${org?.name}</div><div>Odgovorna oseba</div></div>
    <div><div class="sign-line">&nbsp;</div><div>Komisija / priča</div></div>
  </div>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`
  
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
  }
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <div>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Domov</Link>
          <h1 className="font-semibold text-gray-900 mt-0.5">Zaloga in artikli</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)}
  className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
  + Nov artikel
</button>
{items.length > 0 && (
  <button onClick={printPopis}
    className="border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm">
    📋 Popis 31.12.
  </button>
)}
      </div>
      
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Opozorilo nizka zaloga */}
        {lowStock.length > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 mb-6">
            <div className="font-medium text-red-800 text-sm mb-1">⚠️ Nizka zaloga</div>
            <div className="text-red-700 text-xs">
              {lowStock.map(i => i.name).join(', ')} — naročite zaloge!
            </div>
          </div>
        )}

        {/* Povzetek */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Artiklov</div>
            <div className="text-2xl font-semibold">{items.length}</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Vrednost zaloge</div>
            <div className="text-2xl font-semibold">€{totalValue.toFixed(2)}</div>
            <div className="text-xs text-gray-400 mt-1">Po nabavnih cenah</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Nizka zaloga</div>
            <div className={`text-2xl font-semibold ${lowStock.length > 0 ? 'text-red-500' : 'text-green-600'}`}>
              {lowStock.length}
            </div>
          </div>
        </div>

        {/* Forma za nov artikel */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-900 p-6 mb-6">
            <h3 className="font-medium text-gray-900 mb-4">Nov artikel</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Naziv *</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="npr. Kava 250g"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Šifra (SKU)</label>
                <input value={form.sku} onChange={e => setForm({...form, sku: e.target.value})}
                  placeholder="npr. KAV-001"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Enota</label>
                <select value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
                  {['kos','kg','g','l','ml','m','m²','pak','šk'].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Kategorija</label>
                <input value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                  placeholder="npr. Pijače"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Začetna količina</label>
                <input type="number" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Min. zaloga (opozorilo)</label>
                <input type="number" value={form.min_quantity} onChange={e => setForm({...form, min_quantity: e.target.value})}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Nabavna cena (€)</label>
                <input type="number" value={form.purchase_price} onChange={e => setForm({...form, purchase_price: e.target.value})}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Prodajna cena (€)</label>
                <input type="number" value={form.sale_price} onChange={e => setForm({...form, sale_price: e.target.value})}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">DDV stopnja</label>
                <select value={form.vat_rate} onChange={e => setForm({...form, vat_rate: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
                  <option value="22">22% — splošna</option>
                  <option value="9.5">9.5% — hrana, brezalk. pijače</option>
                  <option value="0">0% — oproščeno</option>
                </select>
              </div>
              {form.purchase_price && form.sale_price && (
                <div className="bg-green-50 rounded-xl p-3 flex items-center">
                  <div>
                    <div className="text-xs text-green-600 mb-0.5">Marža</div>
                    <div className="font-semibold text-green-700">
                      {(((parseFloat(form.sale_price) - parseFloat(form.purchase_price)) / parseFloat(form.purchase_price)) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={handleAddItem} disabled={saving || !form.name}
                className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-40">
                Dodaj artikel
              </button>
              <button onClick={() => setShowForm(false)}
                className="border border-gray-200 rounded-xl px-6 py-2.5 text-sm">
                Prekliči
              </button>
            </div>
          </div>
        )}

        {/* Seznam artiklov */}
        {items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-4">📦</div>
            <h3 className="font-semibold text-gray-900 mb-2">Še ni artiklov</h3>
            <p className="text-gray-500 text-sm mb-6">Dodajte produkte ki jih prodajate ali hranite v zalogi</p>
            <button onClick={() => setShowForm(true)}
              className="bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-medium">
              + Dodaj prvi artikel
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50 border-b border-gray-100">
              <div className="col-span-3 text-xs font-medium text-gray-500">Artikel</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-center">Zaloga</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Nabavna</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Prodajna</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Vrednost</div>
              <div className="col-span-1"></div>
            </div>

            {items.map((item, i) => (
              <div key={item.id}>
                <div className={`grid grid-cols-12 gap-2 px-6 py-3 items-center ${i < items.length-1 ? 'border-b border-gray-50' : ''}`}>
                  <div className="col-span-3">
                    <div className="font-medium text-sm text-gray-900">{item.name}</div>
                    <div className="text-xs text-gray-500">{item.sku && `${item.sku} · `}{item.category}</div>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className={`text-sm font-semibold ${item.min_quantity > 0 && item.quantity <= item.min_quantity ? 'text-red-500' : 'text-gray-900'}`}>
                      {item.quantity} {item.unit}
                    </span>
                    {item.min_quantity > 0 && item.quantity <= item.min_quantity && (
                      <div className="text-xs text-red-400">nizka!</div>
                    )}
                  </div>
                  <div className="col-span-2 text-right text-sm text-gray-600">€{item.purchase_price.toFixed(2)}</div>
                  <div className="col-span-2 text-right text-sm text-gray-900 font-medium">€{item.sale_price.toFixed(2)}</div>
                  <div className="col-span-2 text-right text-sm text-gray-600">
                    €{(item.quantity * item.purchase_price).toFixed(2)}
                  </div>
                  <div className="col-span-1 flex gap-1 justify-end">
                    <button onClick={() => setShowMovement(showMovement === item.id ? null : item.id)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-50">
                      ±
                    </button>
                    <button onClick={() => deleteItem(item.id)}
                      className="text-xs border border-red-100 text-red-400 rounded-lg px-2 py-1 hover:bg-red-50">
                      ✕
                    </button>
                  </div>
                </div>

                {/* Gibanje zaloge */}
                {showMovement === item.id && (
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                    <div className="flex gap-3 items-end">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Tip</label>
                        <select value={movement.type} onChange={e => setMovement({...movement, type: e.target.value})}
                          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
                          <option value="in">📥 Prejeto</option>
                          <option value="out">📤 Izdano / prodano</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Količina</label>
                        <input type="number" value={movement.quantity}
                          onChange={e => setMovement({...movement, quantity: e.target.value})}
                          placeholder="0"
                          className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Cena/enoto</label>
                        <input type="number" value={movement.price}
                          onChange={e => setMovement({...movement, price: e.target.value})}
                          placeholder={item.purchase_price.toFixed(2)}
                          className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-gray-500 block mb-1">Opomba</label>
                        <input value={movement.note}
                          onChange={e => setMovement({...movement, note: e.target.value})}
                          placeholder="npr. dobava od Mercatorja"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
                      </div>
                      <button onClick={() => handleMovement(item.id)}
                        className="bg-gray-900 text-white rounded-xl px-4 py-2 text-sm font-medium">
                        Potrdi
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Skupna vrednost */}
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-between">
              <span className="text-xs font-medium text-gray-700">SKUPNA VREDNOST ZALOGE</span>
              <span className="text-sm font-semibold">€{totalValue.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Info o amortizaciji */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mt-6">
          <div className="font-medium text-blue-800 text-sm mb-1">💡 Zaloga in davčna osnova</div>
          <div className="text-blue-700 text-xs leading-relaxed">
            Vrednost zaloge na dan 31. december je vaše <strong>sredstvo</strong> — ni odhodek tega leta.
            Ob koncu leta naredite popis zaloge in vrednost sporočite računovodkinji za DDD obrazec.
            Trenutna vrednost: <strong>€{totalValue.toFixed(2)}</strong>
          </div>
        </div>
      </div>
    </div>
  )
}