'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import posthog from 'posthog-js'

export default function ExpensesPage() {
  const [org, setOrg] = useState<any>(null)
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    vendor: '',
    receipt_date: new Date().toISOString().split('T')[0],
    amount_net: '',
    vat_rate: '22',
    description: '',
    category: 'Pisarniški material',
  })
  const supabase = createClient()

  useEffect(() => { load() }, [])

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
      const { data } = await supabase
        .from('receipts')
        .select('*')
        .eq('org_id', o.id)
        .order('receipt_date', { ascending: false })
      setExpenses(data || [])
    }
    setLoading(false)
  }

  async function handleSave() {
    if (!org || !form.vendor || !form.amount_net) return
    setSaving(true)
    const amountNet = parseFloat(form.amount_net)
    const vatRate = parseFloat(form.vat_rate)
    const vatAmount = amountNet * (vatRate / 100)
    const amountTotal = amountNet + vatAmount

    const { error } = await supabase.from('receipts').insert({
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

    if (error) {
      alert('Napaka: ' + error.message)
      setSaving(false)
      return
    }

    // Dodaj v KPO
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

    posthog.capture('expense_added', {
      category: form.category,
      amount_net: amountNet,
      amount_total: amountTotal,
      vat_rate: vatRate,
    })
    setForm({
      vendor: '',
      receipt_date: new Date().toISOString().split('T')[0],
      amount_net: '',
      vat_rate: '22',
      description: '',
      category: 'Pisarniški material',
    })
    setShowForm(false)
    setSaving(false)
    load()
  }

  const totalNet = expenses.reduce((s, e) => s + Number(e.amount_net || 0), 0)
  const totalVat = expenses.reduce((s, e) => s + Number(e.vat_amount || 0), 0)
  const totalGross = expenses.reduce((s, e) => s + Number(e.amount_total || 0), 0)

  const categories = [
    'Pisarniški material', 'Komunikacije', 'Programska oprema',
    'Transport', 'Prehrana', 'Izobraževanje', 'Marketing',
    'Oprema', 'Storitve', 'Drugo'
  ]

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
          <h1 className="font-semibold text-gray-900 mt-0.5">Stroški in prejeti računi</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium"
        >
          + Dodaj strošek
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Forma za nov strošek */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-900 p-6 mb-6">
            <h3 className="font-medium text-gray-900 mb-4">Nov strošek / prejet račun</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Dobavitelj *</label>
                <input
                  value={form.vendor}
                  onChange={e => setForm({...form, vendor: e.target.value})}
                  placeholder="Telekom d.d."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Datum računa</label>
                <input
                  type="date"
                  value={form.receipt_date}
                  onChange={e => setForm({...form, receipt_date: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
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
                <label className="text-xs text-gray-500 block mb-1">Opis (opcijsko)</label>
                <input
                  value={form.description}
                  onChange={e => setForm({...form, description: e.target.value})}
                  placeholder="npr. mesečna naročnina"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>

            {/* Predogled izračuna */}
            {form.amount_net && (
              <div className="bg-gray-50 rounded-xl p-3 mb-4 flex gap-6 text-sm">
                <div><span className="text-gray-500">Osnova: </span><span className="font-medium">€{parseFloat(form.amount_net).toFixed(2)}</span></div>
                <div><span className="text-gray-500">DDV: </span><span className="font-medium">€{(parseFloat(form.amount_net) * parseFloat(form.vat_rate) / 100).toFixed(2)}</span></div>
                <div><span className="text-gray-500">Skupaj: </span><span className="font-semibold">€{(parseFloat(form.amount_net) * (1 + parseFloat(form.vat_rate)/100)).toFixed(2)}</span></div>
                <div><span className="text-gray-500">DDV vračilo: </span><span className="font-medium text-green-600">€{(parseFloat(form.amount_net) * parseFloat(form.vat_rate) / 100).toFixed(2)}</span></div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !form.vendor || !form.amount_net}
                className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-40"
              >
                {saving ? 'Shranjujem...' : 'Shrani strošek'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="border border-gray-200 rounded-xl px-6 py-2.5 text-sm"
              >
                Prekliči
              </button>
            </div>
          </div>
        )}

        {/* Povzetek */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Skupaj odhodki</div>
            <div className="text-xl font-semibold text-red-500">€{totalNet.toFixed(2)}</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">DDV vhod (vračilo)</div>
            <div className="text-xl font-semibold text-green-600">€{totalVat.toFixed(2)}</div>
            <div className="text-xs text-gray-400 mt-1">Odšteje se od DDV dolga</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Skupaj plačano</div>
            <div className="text-xl font-semibold">€{totalGross.toFixed(2)}</div>
          </div>
        </div>

        {/* Seznam stroškov */}
        {expenses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-4">🧾</div>
            <h3 className="font-semibold text-gray-900 mb-2">Še ni vnesenih stroškov</h3>
            <p className="text-gray-500 text-sm mb-6">Dodajte prejete račune da se DDV pravilno izračuna</p>
            <button
              onClick={() => setShowForm(true)}
              className="bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-medium"
            >
              + Dodaj prvi strošek
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50 border-b border-gray-100">
              <div className="col-span-2 text-xs font-medium text-gray-500">Datum</div>
              <div className="col-span-3 text-xs font-medium text-gray-500">Dobavitelj</div>
              <div className="col-span-2 text-xs font-medium text-gray-500">Kategorija</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Osnova</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">DDV vhod</div>
              <div className="col-span-1 text-xs font-medium text-gray-500 text-right">Skupaj</div>
            </div>
            {expenses.map((exp, i) => (
              <div key={exp.id} className={`grid grid-cols-12 gap-2 px-6 py-3 items-center ${i < expenses.length-1 ? 'border-b border-gray-50' : ''}`}>
                <div className="col-span-2 text-xs text-gray-500">
                  {new Date(exp.receipt_date).toLocaleDateString('sl-SI')}
                </div>
                <div className="col-span-3 text-xs font-medium text-gray-900 truncate">{exp.vendor}</div>
                <div className="col-span-2 text-xs text-gray-500 truncate">{exp.category}</div>
                <div className="col-span-2 text-xs text-right text-red-500">€{Number(exp.amount_net).toFixed(2)}</div>
                <div className="col-span-2 text-xs text-right text-green-600">€{Number(exp.vat_amount).toFixed(2)}</div>
                <div className="col-span-1 text-xs text-right font-medium">€{Number(exp.amount_total).toFixed(2)}</div>
              </div>
            ))}
            <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50 border-t border-gray-200">
              <div className="col-span-7 text-xs font-medium text-gray-700">SKUPAJ</div>
              <div className="col-span-2 text-xs text-right font-semibold text-red-500">€{totalNet.toFixed(2)}</div>
              <div className="col-span-2 text-xs text-right font-semibold text-green-600">€{totalVat.toFixed(2)}</div>
              <div className="col-span-1 text-xs text-right font-semibold">€{totalGross.toFixed(2)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}