'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  vat_rate: number
}

export default function NewInvoicePage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientTaxNumber, setClientTaxNumber] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0])
  const [items, setItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unit_price: 0, vat_rate: 22 }
  ])
  const [notes, setNotes] = useState('')
  const router = useRouter()
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
        const { count } = await supabase
          .from('issued_invoices')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', o.id)
        const num = String((count || 0) + 1).padStart(3, '0')
        setInvoiceNumber(`${new Date().getFullYear()}-${num}`)
      }
    }
    load()
  }, [])

  function addItem() {
    setItems([...items, { description: '', quantity: 1, unit_price: 0, vat_rate: 22 }])
  }

  function removeItem(i: number) {
    setItems(items.filter((_, idx) => idx !== i))
  }

  function updateItem(i: number, field: keyof LineItem, value: any) {
    const updated = [...items]
    updated[i] = { ...updated[i], [field]: value }
    setItems(updated)
  }

  const subtotal = items.reduce((s, item) => s + item.quantity * item.unit_price, 0)
  const vatAmount = items.reduce((s, item) => s + item.quantity * item.unit_price * (item.vat_rate / 100), 0)
  const total = subtotal + vatAmount

  async function handleSave(status: 'draft' | 'sent') {
    if (!org) return
    setLoading(true)
    const { error } = await supabase.from('issued_invoices').insert({
      org_id: org.id,
      invoice_number: invoiceNumber,
      invoice_type: 'invoice',
      client_name: clientName,
      client_email: clientEmail,
      client_tax_number: clientTaxNumber,
      issue_date: issueDate,
      due_date: dueDate,
      line_items: items,
      amount_net: subtotal,
      vat_amount: vatAmount,
      amount_total: total,
      status,
      notes,
      reference: `SI00 ${invoiceNumber}`,
    })
    if (error) {
      alert('Napaka: ' + error.message)
      setLoading(false)
      return
    }
    router.push('/invoices')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <div>
          <Link href="/invoices" className="text-sm text-gray-500 hover:text-gray-900">← Računi</Link>
          <h1 className="font-semibold text-gray-900 mt-0.5">Nov račun</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleSave('draft')} disabled={loading}
            className="border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm">
            Shrani osnutek
          </button>
          <button onClick={() => handleSave('sent')} disabled={loading || !clientName}
            className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40">
            {loading ? 'Shranjujem...' : 'Izdaj račun'}
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-medium text-gray-900 mb-4">Podatki stranke</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Ime podjetja / stranke *</label>
                <input value={clientName} onChange={e => setClientName(e.target.value)}
                  placeholder="Agencija Pixel d.o.o."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Email stranke</label>
                  <input value={clientEmail} onChange={e => setClientEmail(e.target.value)}
                    placeholder="info@agencija.si" type="email"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Davčna številka stranke</label>
                  <input value={clientTaxNumber} onChange={e => setClientTaxNumber(e.target.value)}
                    placeholder="SI12345678"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-medium text-gray-900 mb-4">Datumi</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Datum računa</label>
                <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Rok plačila</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-medium text-gray-900 mb-4">Storitve in blago</h3>
            <div className="grid grid-cols-12 gap-2 mb-2 px-1">
              <div className="col-span-5 text-xs font-medium text-gray-400">Storitev</div>
              <div className="col-span-2 text-xs font-medium text-gray-400 text-center">Količina</div>
              <div className="col-span-2 text-xs font-medium text-gray-400 text-right">Cena (€)</div>
              <div className="col-span-2 text-xs font-medium text-gray-400 text-center">DDV</div>
              <div className="col-span-1"></div>
            </div>
            <div className="space-y-2 mb-4">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)}
                      placeholder="Opis storitve"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </div>
                  <div className="col-span-2">
                    <input type="number" value={item.quantity} onChange={e => updateItem(i, 'quantity', +e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 text-center" />
                  </div>
                  <div className="col-span-2">
                    <input type="number" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', +e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 text-right" />
                  </div>
                  <div className="col-span-2">
                    <select value={item.vat_rate} onChange={e => updateItem(i, 'vat_rate', +e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
                      <option value={22}>22%</option>
                      <option value={9.5}>9.5%</option>
                      <option value={0}>0%</option>
                    </select>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {items.length > 1 && (
                      <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500 text-xl">×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addItem}
              className="text-sm text-gray-500 hover:text-gray-900 border border-dashed border-gray-200 rounded-xl px-4 py-2 w-full hover:border-gray-400 transition-colors">
              + Dodaj postavko
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-medium text-gray-900 mb-4">Opombe</h3>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Dodatne opombe na računu..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 sticky top-4">
            <h3 className="font-medium text-gray-900 mb-4">Povzetek</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Št. računa</span>
                <span className="font-mono">{invoiceNumber}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Osnova</span>
                <span>€{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>DDV</span>
                <span>€{vatAmount.toFixed(2)}</span>
              </div>
              <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between font-semibold text-gray-900">
                <span>Skupaj</span>
                <span>€{total.toFixed(2)}</span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="text-xs text-gray-500 mb-1">Sklic</div>
              <div className="font-mono text-xs bg-gray-50 rounded-lg px-3 py-2">SI00 {invoiceNumber}</div>
            </div>
            {org && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-xs text-gray-500 mb-2">Izdajatelj</div>
                <div className="text-xs text-gray-700 leading-relaxed">
                  <div className="font-medium">{org.name}</div>
                  <div>{org.address}</div>
                  <div>{org.post_code} {org.city}</div>
                  <div className="mt-1">Davčna: {org.tax_number}</div>
                  {org.iban && <div className="font-mono mt-1 text-xs">{org.iban}</div>}
                </div>
              </div>
            )}
            <button onClick={() => handleSave('sent')} disabled={loading || !clientName}
              className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-medium mt-6 disabled:opacity-40">
              {loading ? 'Shranjujem...' : '📄 Izdaj račun'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}