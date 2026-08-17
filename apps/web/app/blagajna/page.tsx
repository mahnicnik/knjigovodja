'use client'

import { useEffect, useState } from 'react'
import { lokalniDatum } from '@/lib/tax-constants'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'

interface CartItem {
  id: string
  name: string
  price: number
  vat_rate: number
  qty: number
}

interface Product {
  id: string
  name: string
  price: number
  vat_rate: number
  category: string
  color: string
}

const COLORS = ['bg-blue-500','bg-green-500','bg-orange-500','bg-purple-500','bg-red-500','bg-yellow-500','bg-pink-500','bg-teal-500']

export default function BlagajnaPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [receipts, setReceipts] = useState<any[]>([])
  const [showProducts, setShowProducts] = useState(false)
  const [showReceipts, setShowReceipts] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('card')
  const [cashGiven, setCashGiven] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [lastReceipt, setLastReceipt] = useState<any>(null)
  const [newProduct, setNewProduct] = useState({ name: '', price: '', vat_rate: '22', category: '', color: 'bg-blue-500' })
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
    if (member) {
      const o = (member as any).organizations
      setOrg(o)
      const storedProducts = localStorage.getItem(`blagajna_products_${o.id}`)
      if (storedProducts) setProducts(JSON.parse(storedProducts))
      const storedReceipts = localStorage.getItem(`blagajna_receipts_${o.id}`)
      if (storedReceipts) setReceipts(JSON.parse(storedReceipts))
    }
    setLoading(false)
  }

  function saveProducts(p: Product[]) {
    if (!org) return
    setProducts(p)
    localStorage.setItem(`blagajna_products_${org.id}`, JSON.stringify(p))
  }

  function saveReceipts(r: any[]) {
    if (!org) return
    setReceipts(r)
    localStorage.setItem(`blagajna_receipts_${org.id}`, JSON.stringify(r))
  }

  function addToCart(product: Product) {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) return prev.map(i => i.id === product.id ? {...i, qty: i.qty + 1} : i)
      return [...prev, { id: product.id, name: product.name, price: product.price, vat_rate: product.vat_rate, qty: 1 }]
    })
  }

  function removeFromCart(id: string) {
    setCart(prev => {
      const existing = prev.find(i => i.id === id)
      if (existing && existing.qty > 1) return prev.map(i => i.id === id ? {...i, qty: i.qty - 1} : i)
      return prev.filter(i => i.id !== id)
    })
  }

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const vat22 = cart.filter(i => i.vat_rate === 22).reduce((s, i) => s + i.price * i.qty * 0.22 / 1.22, 0)
  const vat95 = cart.filter(i => i.vat_rate === 9.5).reduce((s, i) => s + i.price * i.qty * 0.095 / 1.095, 0)
  const total = subtotal
  const change = parseFloat(cashGiven) - total

  async function processPayment() {
    if (cart.length === 0) return
    const receiptNum = `B${Date.now()}`
    const receipt = {
      id: receiptNum,
      date: new Date().toISOString(),
      items: [...cart],
      total,
      vat22: Math.round(vat22 * 100) / 100,
      vat95: Math.round(vat95 * 100) / 100,
      paymentMethod,
      cashGiven: paymentMethod === 'cash' ? parseFloat(cashGiven) : null,
      change: paymentMethod === 'cash' ? change : null,
    }

    if (org) {
      // POPRAVLJENO (16.8.2026): prej brez preverbe - prihodek se ni poknjizil.
      const { error: kpoErr } = await supabase.from('kpo_entries').insert({
        org_id: org.id,
        entry_date: lokalniDatum(),
        description: `Blagajna ${receiptNum} — ${cart.map(i => i.name).join(', ')}`,
        entry_type: 'income',
        income: Math.round((total / 1.22) * 100) / 100,
        expense: 0,
        vat_in: 0,
        vat_out: Math.round((vat22 + vat95) * 100) / 100,
        category: 'Blagajna',
      })
      if (kpoErr) { alert('Prihodka ni bilo mogoče poknjižiti: ' + kpoErr.message); return }
    }

    saveReceipts([receipt, ...receipts])
    setLastReceipt(receipt)
    setCart([])
    setCashGiven('')
    setShowSuccess(true)
    setTimeout(() => setShowSuccess(false), 3000)
  }

  function addProduct() {
    if (!newProduct.name || !newProduct.price) return
    const product: Product = {
      id: Date.now().toString(),
      name: newProduct.name,
      price: parseFloat(newProduct.price),
      vat_rate: parseFloat(newProduct.vat_rate),
      category: newProduct.category,
      color: newProduct.color,
    }
    saveProducts([...products, product])
    setNewProduct({ name: '', price: '', vat_rate: '22', category: '', color: 'bg-blue-500' })
  }

  const today = lokalniDatum()
  const todayReceipts = receipts.filter(r => r.date.startsWith(today))
  const todayTotal = todayReceipts.reduce((s, r) => s + r.total, 0)
  const todayCash = todayReceipts.filter(r => r.paymentMethod === 'cash').reduce((s, r) => s + r.total, 0)
  const todayCard = todayReceipts.filter(r => r.paymentMethod === 'card').reduce((s, r) => s + r.total, 0)

  function printReceipt(receipt: any) {
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{font-family:'Courier New',monospace;font-size:12px;width:280px;margin:0 auto;padding:10px}
  .center{text-align:center}
  .line{border-top:1px dashed #000;margin:8px 0}
  .bold{font-weight:bold}
  .row{display:flex;justify-content:space-between}
  .total{font-size:16px;font-weight:bold}
</style></head>
<body>
<div class="center bold">${org?.name}</div>
<div class="center" style="font-size:10px">${org?.address}, ${org?.city}</div>
<div class="center" style="font-size:10px">Davčna: ${org?.tax_number}</div>
<div class="line"></div>
<div class="center">Račun št. ${receipt.id}</div>
<div class="center" style="font-size:10px">${new Date(receipt.date).toLocaleString('sl-SI')}</div>
<div class="line"></div>
${receipt.items.map((item: CartItem) => `
  <div class="row"><span>${item.name} x${item.qty}</span><span>€${(item.price * item.qty).toFixed(2)}</span></div>
`).join('')}
<div class="line"></div>
${receipt.vat22 > 0 ? `<div class="row"><span>DDV 22%</span><span>€${receipt.vat22.toFixed(2)}</span></div>` : ''}
${receipt.vat95 > 0 ? `<div class="row"><span>DDV 9.5%</span><span>€${receipt.vat95.toFixed(2)}</span></div>` : ''}
<div class="line"></div>
<div class="row total"><span>SKUPAJ</span><span>€${receipt.total.toFixed(2)}</span></div>
<div class="row"><span>${receipt.paymentMethod === 'cash' ? 'Gotovina' : 'Kartica'}</span><span>€${receipt.total.toFixed(2)}</span></div>
${receipt.change > 0 ? `<div class="row"><span>Vračilo</span><span>€${receipt.change.toFixed(2)}</span></div>` : ''}
<div class="line"></div>
<div class="center" style="font-size:10px">Hvala za obisk!</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
  }

  function printZReport() {
    const todayVat22 = todayReceipts.reduce((s, r) => s + (r.vat22 || 0), 0)
    const todayVat95 = todayReceipts.reduce((s, r) => s + (r.vat95 || 0), 0)
    const todayNet = todayTotal - todayVat22 - todayVat95

    const html = `<!DOCTYPE html>
<html lang="sl"><head><meta charset="UTF-8">
<style>
  body{font-family:'Courier New',monospace;font-size:11px;width:300px;margin:0 auto;padding:10px}
  .center{text-align:center}
  .bold{font-weight:bold}
  .line{border-top:1px dashed #000;margin:8px 0}
  .row{display:flex;justify-content:space-between}
  .title{font-size:14px;font-weight:bold;text-align:center;margin:6px 0}
  .big{font-size:16px;font-weight:bold}
</style></head><body>
<div class="center bold">${org?.name}</div>
<div class="center" style="font-size:9px">${org?.address}, ${org?.city}</div>
<div class="center" style="font-size:9px">Davčna: ${org?.tax_number}</div>
<div class="line"></div>
<div class="title">Z-REPORT — DNEVNI ZAKLJUČEK</div>
<div class="center" style="font-size:10px">${new Date().toLocaleString('sl-SI')}</div>
<div class="line"></div>
<div class="row"><span>Število računov:</span><span>${todayReceipts.length}</span></div>
<div class="line"></div>
<div class="row"><span>Gotovina:</span><span>€${todayCash.toFixed(2)}</span></div>
<div class="row"><span>Kartica:</span><span>€${todayCard.toFixed(2)}</span></div>
<div class="line"></div>
<div class="row"><span>Osnova brez DDV:</span><span>€${todayNet.toFixed(2)}</span></div>
${todayVat22 > 0 ? `<div class="row"><span>DDV 22%:</span><span>€${todayVat22.toFixed(2)}</span></div>` : ''}
${todayVat95 > 0 ? `<div class="row"><span>DDV 9.5%:</span><span>€${todayVat95.toFixed(2)}</span></div>` : ''}
<div class="line"></div>
<div class="row big"><span>SKUPAJ PROMET:</span><span>€${todayTotal.toFixed(2)}</span></div>
<div class="line"></div>
<div class="center" style="font-size:9px;margin-top:8px">Dnevni zaključek blagajne</div>
<div class="center" style="font-size:9px">ZDavPR — davčna blagajna</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <p className="text-gray-500">Nalagam...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="border-b border-gray-800 px-6 py-3 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white">← Domov</Link>
          <h1 className="font-semibold">Blagajna</h1>
          <span className="text-xs text-gray-500">{org?.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-400">
            Danes: <span className="text-white font-medium">€{todayTotal.toFixed(2)}</span>
            <span className="ml-2 text-green-400">💳 €{todayCard.toFixed(2)}</span>
            <span className="ml-2 text-yellow-400">💵 €{todayCash.toFixed(2)}</span>
          </div>
          <button onClick={() => setShowReceipts(!showReceipts)}
            className="border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg text-xs">
            📋 Računi ({todayReceipts.length})
            <button onClick={printZReport}
  className="border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg text-xs">
  📊 Z-Report
</button>
          </button>
          <button onClick={printZReport}
            className="border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg text-xs">
            📊 Z-Report
          </button>
          <button onClick={() => setShowProducts(!showProducts)}
            className="border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg text-xs">
            ⚙️ Artikli
          </button>
        </div>
      </div>

      <div className="flex h-screen">
        <div className="flex-1 p-6 overflow-y-auto">
          {showProducts ? (
            <div>
              <h3 className="font-medium mb-4">Upravljanje artiklov</h3>
              <div className="grid grid-cols-3 gap-3 mb-6">
                <input value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                  placeholder="Naziv *"
                  className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none" />
                <input type="number" onFocus={e => e.target.select()} value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})}
                  placeholder="Cena z DDV *"
                  className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none" />
                <select value={newProduct.vat_rate} onChange={e => setNewProduct({...newProduct, vat_rate: e.target.value})}
                  className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none">
                  <option value="22">DDV 22%</option>
                  <option value="9.5">DDV 9.5%</option>
                  <option value="0">Brez DDV</option>
                </select>
                <input value={newProduct.category} onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                  placeholder="Kategorija"
                  className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none" />
                <div className="flex gap-2 items-center">
                  {COLORS.map(c => (
                    <div key={c} onClick={() => setNewProduct({...newProduct, color: c})}
                      className={`w-6 h-6 rounded-full cursor-pointer ${c} ${newProduct.color === c ? 'ring-2 ring-white' : ''}`} />
                  ))}
                </div>
                <button onClick={addProduct} disabled={!newProduct.name || !newProduct.price}
                  className="bg-white text-gray-900 rounded-xl py-2 text-sm font-medium disabled:opacity-40">
                  + Dodaj
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {products.map(p => (
                  <div key={p.id} className={`${p.color} rounded-2xl p-4 relative`}>
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-lg font-bold mt-1">€{p.price.toFixed(2)}</div>
                    <div className="text-xs opacity-75">{p.vat_rate}% DDV</div>
                    <button onClick={() => saveProducts(products.filter(x => x.id !== p.id))}
                      className="absolute top-2 right-2 text-white opacity-60 hover:opacity-100">✕</button>
                  </div>
                ))}
              </div>
            </div>
          ) : showReceipts ? (
            <div>
              <h3 className="font-medium mb-4">Računi danes</h3>
              {todayReceipts.length === 0 ? (
                <p className="text-gray-500 text-sm">Še ni računov danes</p>
              ) : (
                <div className="space-y-2">
                  {todayReceipts.map(r => (
                    <div key={r.id} className="bg-gray-800 rounded-xl p-4 flex justify-between items-center">
                      <div>
                        <div className="text-sm font-medium">#{r.id}</div>
                        <div className="text-xs text-gray-400">{new Date(r.date).toLocaleTimeString('sl-SI')}</div>
                        <div className="text-xs text-gray-400">{r.items.map((i: CartItem) => i.name).join(', ')}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">€{r.total.toFixed(2)}</div>
                        <div className="text-xs text-gray-400">{r.paymentMethod === 'cash' ? '💵' : '💳'}</div>
                        <button onClick={() => printReceipt(r)} className="text-xs text-blue-400 mt-1">🖨️ Natisni</button>
                      </div>
                    </div>
                  ))}
                  <div className="bg-gray-700 rounded-xl p-4">
                    <div className="flex justify-between font-semibold">
                      <span>DNEVNI ZAKLJUČEK</span>
                      <span>€{todayTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-400 mt-1">
                      <span>Gotovina</span><span>€{todayCash.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-400">
                      <span>Kartica</span><span>€{todayCard.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {products.length === 0 ? (
                <div className="text-center py-20">
                  <div className="text-5xl mb-4">🛍️</div>
                  <p className="text-gray-400 mb-4">Še ni artiklov</p>
                  <button onClick={() => setShowProducts(true)}
                    className="border border-gray-700 text-gray-300 px-6 py-3 rounded-xl text-sm">
                    ⚙️ Dodaj artikle
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {products.map(product => (
                    <button key={product.id} onClick={() => addToCart(product)}
                      className={`${product.color} rounded-2xl p-5 text-left active:scale-95 transition-transform`}>
                      <div className="font-medium text-sm mb-1">{product.name}</div>
                      {product.category && <div className="text-xs opacity-75 mb-2">{product.category}</div>}
                      <div className="text-2xl font-bold">€{product.price.toFixed(2)}</div>
                      <div className="text-xs opacity-75 mt-1">DDV {product.vat_rate}%</div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-700">
            <div className="flex justify-between items-center">
              <h3 className="font-medium">Košarica</h3>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-xs text-red-400">Počisti</button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <p className="text-gray-500 text-sm text-center mt-8">Tapnite artikel za dodajanje</p>
            ) : (
              <div className="space-y-2">
                {cart.map(item => (
                  <div key={item.id} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{item.name}</div>
                      <div className="text-xs text-gray-400">€{item.price.toFixed(2)} × {item.qty}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => removeFromCart(item.id)}
                        className="w-6 h-6 bg-gray-700 rounded-full text-sm flex items-center justify-center">−</button>
                      <span className="text-sm font-medium w-6 text-center">{item.qty}</span>
                      <button onClick={() => addToCart({id: item.id, name: item.name, price: item.price, vat_rate: item.vat_rate, category: '', color: ''})}
                        className="w-6 h-6 bg-gray-700 rounded-full text-sm flex items-center justify-center">+</button>
                      <span className="text-sm font-semibold w-16 text-right">€{(item.price * item.qty).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {cart.length > 0 && (
            <div className="p-4 border-t border-gray-700">
              {vat22 > 0 && <div className="flex justify-between text-xs text-gray-400 mb-1"><span>DDV 22%</span><span>€{vat22.toFixed(2)}</span></div>}
              {vat95 > 0 && <div className="flex justify-between text-xs text-gray-400 mb-1"><span>DDV 9.5%</span><span>€{vat95.toFixed(2)}</span></div>}
              <div className="flex justify-between text-xl font-bold mb-4">
                <span>SKUPAJ</span><span>€{total.toFixed(2)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button onClick={() => setPaymentMethod('card')}
                  className={`py-2 rounded-xl text-sm font-medium transition-colors ${paymentMethod === 'card' ? 'bg-blue-600' : 'bg-gray-700'}`}>
                  💳 Kartica
                </button>
                <button onClick={() => setPaymentMethod('cash')}
                  className={`py-2 rounded-xl text-sm font-medium transition-colors ${paymentMethod === 'cash' ? 'bg-yellow-600' : 'bg-gray-700'}`}>
                  💵 Gotovina
                </button>
              </div>
              {paymentMethod === 'cash' && (
                <div className="mb-3">
                  <input type="number" onFocus={e => e.target.select()} value={cashGiven}
                    onChange={e => setCashGiven(e.target.value)}
                    placeholder="Prejeto (€)"
                    className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none mb-2" />
                  {cashGiven && parseFloat(cashGiven) >= total && (
                    <div className="text-center text-green-400 font-semibold">
                      Vračilo: €{change.toFixed(2)}
                    </div>
                  )}
                </div>
              )}
              <button onClick={processPayment}
                disabled={paymentMethod === 'cash' && (!cashGiven || parseFloat(cashGiven) < total)}
                className="w-full bg-green-600 hover:bg-green-500 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-40 transition-colors">
                ✓ Zaključi plačilo
              </button>
            </div>
          )}

          {showSuccess && lastReceipt && (
            <div className="p-4 bg-green-600 text-center">
              <div className="font-semibold mb-1">✓ Plačano! €{lastReceipt.total.toFixed(2)}</div>
              <button onClick={() => printReceipt(lastReceipt)} className="text-xs underline">
                🖨️ Natisni račun
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}