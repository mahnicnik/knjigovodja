'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'

const CATEGORIES = [
  { value: 'kosilo', label: 'Poslovno kosilo/večerja', deductible: 50 },
  { value: 'darilo', label: 'Poslovno darilo', deductible: 50 },
  { value: 'zabava', label: 'Poslovna zabava/event', deductible: 50 },
  { value: 'nastanitev', label: 'Nastanitev poslovnega partnerja', deductible: 50 },
  { value: 'drugo', label: 'Drugo reprezentančno', deductible: 50 },
]

export default function ReprezentancaPage() {
  const [org, setOrg] = useState<any>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    category: 'kosilo',
    description: '',
    attendees: '',
    business_purpose: '',
    amount: '',
    vendor: '',
  })
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
    if (member) {
      const o = (member as any).organizations
      setOrg(o)
      const stored = localStorage.getItem(`reprezentanca_${o.id}`)
      if (stored) setEntries(JSON.parse(stored))
    }
    setLoading(false)
  }

  function save(newEntries: any[]) {
    if (!org) return
    setEntries(newEntries)
    localStorage.setItem(`reprezentanca_${org.id}`, JSON.stringify(newEntries))
  }

  async function handleSave() {
    if (!form.amount || !form.description) return
    setSaving(true)
    const amt = parseFloat(form.amount)
    const cat = CATEGORIES.find(c => c.value === form.category)!
    const deductibleAmt = Math.round(amt * (cat.deductible / 100) * 100) / 100

    const entry = {
      id: Date.now().toString(),
      date: form.date,
      category: form.category,
      categoryLabel: cat.label,
      description: form.description,
      attendees: form.attendees,
      business_purpose: form.business_purpose,
      vendor: form.vendor,
      amount: amt,
      deductible_pct: cat.deductible,
      deductible_amount: deductibleAmt,
    }

    // Vpiši v KPO kot strošek (samo davčno priznavni del)
    // POPRAVLJENO (16.8.2026): prej brez preverbe napake - vnos v davcno evidenco
    // se ni shranil, uporabnik pa je videl potrditev.
    const { error: repErr } = await supabase.from('kpo_entries').insert({
      org_id: org.id,
      entry_date: form.date,
      description: `Reprezentanca: ${form.description} (${cat.deductible}% priznavno)`,
      entry_type: 'expense',
      income: 0,
      expense: deductibleAmt,
      vat_in: 0,
      vat_out: 0,
      category: 'Reprezentanca',
    })
    if (repErr) { alert('Reprezentance ni bilo mogoče poknjižiti: ' + repErr.message); return }

    save([entry, ...entries])
    setForm({
      date: new Date().toISOString().split('T')[0],
      category: 'kosilo', description: '', attendees: '',
      business_purpose: '', amount: '', vendor: '',
    })
    setShowForm(false)
    setSaving(false)
  }

  function deleteEntry(id: string) {
    if (!confirm('Izbrišete vnos?')) return
    save(entries.filter(e => e.id !== id))
  }

  const totalAmount = entries.reduce((s, e) => s + e.amount, 0)
  const totalDeductible = entries.reduce((s, e) => s + e.deductible_amount, 0)
  const totalNonDeductible = totalAmount - totalDeductible

  if (loading) return (
    <AppLayout>
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Nalagam...</p>
    </div>
    </AppLayout>
  )

  return (
    <AppLayout org={org}>
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="font-semibold text-gray-900 mt-0.5">Reprezentanca</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
          + Dodaj
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">

        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-6">
          <div className="font-medium text-orange-800 text-sm mb-1">⚠️ Reprezentanca — davčno pravilo</div>
          <div className="text-orange-700 text-xs leading-relaxed">
            Stroški reprezentance (poslovni obroki, darila, zabave) so davčno priznavni samo do <strong>50%</strong>.
            Primer: poslovno kosilo za €80 → samo €40 je odhodek za DDD.
            Vedno beležite: kdo je bil prisoten, kakšen je bil poslovni namen.
          </div>
        </div>

        {/* Povzetek */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Skupaj stroški</div>
            <div className="text-2xl font-semibold">€{totalAmount.toFixed(2)}</div>
          </div>
          <div className="bg-green-50 rounded-2xl border border-green-100 p-5">
            <div className="text-xs text-green-600 mb-1">Davčno priznavno (50%)</div>
            <div className="text-2xl font-semibold text-green-700">€{totalDeductible.toFixed(2)}</div>
          </div>
          <div className="bg-red-50 rounded-2xl border border-red-100 p-5">
            <div className="text-xs text-red-600 mb-1">Ni priznavno (50%)</div>
            <div className="text-2xl font-semibold text-red-700">€{totalNonDeductible.toFixed(2)}</div>
          </div>
        </div>

        {/* Forma */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-900 p-6 mb-6">
            <h3 className="font-medium text-gray-900 mb-4">Nov reprezentančni strošek</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Datum *</label>
                <input type="date" value={form.date}
                  onChange={e => setForm({...form, date: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Kategorija</label>
                <select value={form.category}
                  onChange={e => setForm({...form, category: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Opis *</label>
                <input value={form.description}
                  onChange={e => setForm({...form, description: e.target.value})}
                  placeholder="npr. Kosilo s stranko Pixi d.o.o."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Dobavitelj / Restavracija</label>
                <input value={form.vendor}
                  onChange={e => setForm({...form, vendor: e.target.value})}
                  placeholder="npr. Restavracija Slon"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Prisotni *</label>
                <input value={form.attendees}
                  onChange={e => setForm({...form, attendees: e.target.value})}
                  placeholder="npr. Janez Novak (Pixi), Nik Mahnič"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Poslovni namen *</label>
                <input value={form.business_purpose}
                  onChange={e => setForm({...form, business_purpose: e.target.value})}
                  placeholder="npr. Pogajanja o letni pogodbi"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Znesek (€) *</label>
                <input type="number" value={form.amount}
                  onChange={e => setForm({...form, amount: e.target.value})}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>

            {form.amount && (
              <div className="bg-gray-50 rounded-xl p-3 mb-4 flex gap-6 text-sm">
                <div><span className="text-gray-500">Skupaj: </span><span className="font-semibold">€{parseFloat(form.amount).toFixed(2)}</span></div>
                <div><span className="text-gray-500">Priznavno 50%: </span><span className="font-semibold text-green-600">€{(parseFloat(form.amount) * 0.5).toFixed(2)}</span></div>
                <div><span className="text-gray-500">Ni priznavno: </span><span className="font-semibold text-red-500">€{(parseFloat(form.amount) * 0.5).toFixed(2)}</span></div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleSave}
                disabled={saving || !form.amount || !form.description}
                className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-40">
                {saving ? 'Shranjujem...' : 'Shrani in vpiši v KPO'}
              </button>
              <button onClick={() => setShowForm(false)}
                className="border border-gray-200 rounded-xl px-6 py-2.5 text-sm">
                Prekliči
              </button>
            </div>
          </div>
        )}

        {/* Seznam */}
        {entries.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-4">🍽️</div>
            <h3 className="font-semibold text-gray-900 mb-2">Še ni reprezentančnih stroškov</h3>
            <p className="text-gray-500 text-sm mb-6">Beležite poslovne obroke, darila in zabave</p>
            <button onClick={() => setShowForm(true)}
              className="bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-medium">
              + Dodaj prvi vnos
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50 border-b border-gray-100">
              <div className="col-span-2 text-xs font-medium text-gray-500">Datum</div>
              <div className="col-span-3 text-xs font-medium text-gray-500">Opis</div>
              <div className="col-span-2 text-xs font-medium text-gray-500">Prisotni</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Skupaj</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Priznavno</div>
              <div className="col-span-1"></div>
            </div>
            {entries.map((e, i) => (
              <div key={e.id} className={`grid grid-cols-12 gap-2 px-6 py-3 items-center ${i < entries.length-1 ? 'border-b border-gray-50' : ''}`}>
                <div className="col-span-2 text-xs text-gray-500">
                  {new Date(e.date).toLocaleDateString('sl-SI')}
                </div>
                <div className="col-span-3">
                  <div className="text-xs font-medium text-gray-900 truncate">{e.description}</div>
                  <div className="text-xs text-gray-400">{e.categoryLabel}</div>
                </div>
                <div className="col-span-2 text-xs text-gray-500 truncate">{e.attendees}</div>
                <div className="col-span-2 text-xs text-right font-medium">€{e.amount.toFixed(2)}</div>
                <div className="col-span-2 text-xs text-right text-green-600 font-medium">€{e.deductible_amount.toFixed(2)}</div>
                <div className="col-span-1 flex justify-end">
                  <button onClick={() => deleteEntry(e.id)}
                    className="text-xs text-red-400 hover:text-red-600">✕</button>
                </div>
              </div>
            ))}
            <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50 border-t border-gray-200">
              <div className="col-span-7 text-xs font-medium text-gray-700">SKUPAJ</div>
              <div className="col-span-2 text-xs text-right font-semibold">€{totalAmount.toFixed(2)}</div>
              <div className="col-span-2 text-xs text-right font-semibold text-green-600">€{totalDeductible.toFixed(2)}</div>
              <div className="col-span-1"></div>
            </div>
          </div>
        )}
      </div>
    </div>
    </AppLayout>
  )
}