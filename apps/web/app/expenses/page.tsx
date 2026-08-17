'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import posthog from 'posthog-js'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'

const MONTHS = ['Januar','Februar','Marec','April','Maj','Junij','Julij','Avgust','September','Oktober','November','December']

export default function ExpensesPage() {
  const [org, setOrg] = useState<any>(null)
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // DODANO (30.7.2026): izbirnik obdobja - privzeto tekoci mesec namesto
  // nalaganja vse zgodovine. Petih nacinov: mesec / cetrtletje / leto /
  // vse / po meri.
  type PeriodMode = 'month' | 'quarter' | 'year' | 'all' | 'custom'
  const now = new Date()
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [selMonth, setSelMonth] = useState(now.getMonth())
  const [selYear, setSelYear] = useState(now.getFullYear())
  const [selQuarter, setSelQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3))
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  function getPeriodRange(): { from: string | null; to: string | null; label: string } {
    const pad = (n: number) => String(n).padStart(2, '0')
    if (periodMode === 'all') return { from: null, to: null, label: 'Vse od začetka' }
    if (periodMode === 'year') {
      return { from: `${selYear}-01-01`, to: `${selYear}-12-31`, label: `Poslovno leto ${selYear}` }
    }
    if (periodMode === 'quarter') {
      const startMonth = (selQuarter - 1) * 3
      const lastDay = new Date(selYear, startMonth + 3, 0).getDate()
      return {
        from: `${selYear}-${pad(startMonth + 1)}-01`,
        to: `${selYear}-${pad(startMonth + 3)}-${lastDay}`,
        label: `Q${selQuarter} ${selYear}`,
      }
    }
    if (periodMode === 'custom') {
      return { from: customFrom || null, to: customTo || null, label: 'Po meri' }
    }
    // mesec (privzeto)
    const lastDay = new Date(selYear, selMonth + 1, 0).getDate()
    return {
      from: `${selYear}-${pad(selMonth + 1)}-01`,
      to: `${selYear}-${pad(selMonth + 1)}-${lastDay}`,
      label: `${MONTHS[selMonth]} ${selYear}`,
    }
  }

  const [form, setForm] = useState({
    vendor: '',
    receipt_date: new Date().toISOString().split('T')[0],
    amount_net: '',
    vat_rate: '22',
    description: '',
    category: 'Pisarniški material',
  })
  const supabase = createClient()

  useEffect(() => { loadOrg() }, [])
  useEffect(() => { if (org) loadExpenses() }, [org, periodMode, selMonth, selYear, selQuarter, customFrom, customTo])

  async function loadOrg() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
    if (member) setOrg((member as any).organizations)
    else setLoading(false)
  }

  async function loadExpenses() {
    setLoading(true)
    const { from, to } = getPeriodRange()
    let query = supabase.from('receipts').select('*').eq('org_id', org.id)
    if (from) query = query.gte('receipt_date', from)
    if (to) query = query.lte('receipt_date', to)
    const { data } = await query.order('receipt_date', { ascending: false })
    setExpenses(data || [])
    setLoading(false)
  }

  function openEdit(exp: any) {
    setForm({
      vendor: exp.vendor || '',
      receipt_date: exp.receipt_date,
      amount_net: String(exp.amount_net),
      vat_rate: String(exp.vat_rate),
      description: exp.description || '',
      category: exp.category || categories[0],
    })
    setEditingId(exp.id)
    setShowForm(true)
  }
  // DODANO (11.8.2026): manjkala je moznost brisanja stroska.
  async function deleteReceipt(id: string) {
    if (!confirm('Res želite izbrisati ta strošek? To dejanje je nepovratno.')) return
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    // Najprej pocisti povezan KPO vnos (ce obstaja), da ne ostane osirotel
    // POPRAVLJENO (16.8.2026): prej brez preverbe - ce vnos v knjigi ostane,
    // strosek pa se izbrise, ostane osirotel zapis v davcni evidenci.
    const { error: kpoDelErr } = await supabase.from('kpo_entries').delete().eq('receipt_id', id)
    if (kpoDelErr) { alert('Vnosa v knjigi ni bilo mogoče izbrisati: ' + kpoDelErr.message); return }
    const { error } = await supabase.from('receipts').delete().eq('id', id)
    if (error) {
      alert('Napaka pri brisanju: ' + error.message)
      setSaving(false)
      return
    }
    setShowForm(false)
    setEditingId(null)
    setSaving(false)
    load()
  }

  async function handleSave() {
    if (!org || !form.vendor || !form.amount_net) return
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    const amountNet = parseFloat(form.amount_net)
    const vatRate = parseFloat(form.vat_rate)
    const vatAmount = amountNet * (vatRate / 100)
    const amountTotal = amountNet + vatAmount

    const payload = {
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
    }
    // POPRAVLJENO (30.7.2026, audit): ob urejanju se je v KPO vedno
    // ustvaril NOV vnos -> strosek se je v davcni evidenci PODVOJIL.
    // Zdaj se zapise receipt_id (povezava), ob urejanju pa se obstojeci
    // KPO vnos posodobi namesto podvoji.
    const { data: savedReceipt, error } = editingId
      ? await supabase.from('receipts').update(payload).eq('id', editingId).select('id').single()
      : await supabase.from('receipts').insert(payload).select('id').single()

    if (error) {
      alert('Napaka: ' + error.message)
      setSaving(false)
      return
    }

    const savedReceiptId = savedReceipt?.id ?? editingId

    const kpoPayload = {
      org_id: org.id,
      entry_date: form.receipt_date,
      description: `${form.vendor} — ${form.category}`,
      entry_type: 'expense',
      income: 0,
      expense: amountNet,
      vat_in: vatAmount,
      vat_out: 0,
      category: form.category,
      receipt_id: savedReceiptId,
    }

    if (editingId) {
      // Poisci obstojec KPO vnos za ta strosek
      const { data: existingKpo } = await supabase
        .from('kpo_entries')
        .select('id')
        .eq('org_id', org.id)
        .eq('receipt_id', editingId)
        .maybeSingle()

      if (existingKpo) {
        const { error: kpoUpdErr } = await supabase.from('kpo_entries').update(kpoPayload).eq('id', existingKpo.id)
        if (kpoUpdErr) throw new Error('Vnosa v knjigi ni bilo mogoče posodobiti: ' + kpoUpdErr.message)
      } else {
        // Star vnos brez povezave (pred tem popravkom) - ustvari novega
        const { error: kpoNovErr } = await supabase.from('kpo_entries').insert(kpoPayload)
        if (kpoNovErr) throw new Error('Vnosa v knjigo ni bilo mogoče shraniti: ' + kpoNovErr.message)
      }
    } else {
      const { error: kpoErr2 } = await supabase.from('kpo_entries').insert(kpoPayload)
      if (kpoErr2) throw new Error('Vnosa v knjigo ni bilo mogoče shraniti: ' + kpoErr2.message)
    }

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
    loadExpenses()
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
          <h1 className="font-semibold text-gray-900 mt-0.5">Stroški in prejeti računi</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/scan"
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 inline-flex items-center gap-1.5"
          >
            📷 Skeniraj z AI
          </Link>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium"
          >
            + Dodaj strošek
          </button>
        </div>
      </div>

      {/* DODANO (30.7.2026): izbirnik obdobja */}
      <div className="max-w-4xl mx-auto px-6 pt-6 flex flex-wrap items-center gap-2">
        {([
          ['month', 'Mesec'],
          ['quarter', 'Četrtletje'],
          ['year', 'Poslovno leto'],
          ['all', 'Vse'],
          ['custom', 'Po meri'],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setPeriodMode(mode)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${periodMode === mode ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >
            {label}
          </button>
        ))}

        <div className="flex items-center gap-2 ml-2">
          {periodMode === 'month' && (
            <>
              <select value={selMonth} onChange={e => setSelMonth(Number(e.target.value))} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs">
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select value={selYear} onChange={e => setSelYear(Number(e.target.value))} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs">
                {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </>
          )}
          {periodMode === 'quarter' && (
            <>
              <select value={selQuarter} onChange={e => setSelQuarter(Number(e.target.value))} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs">
                {[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}
              </select>
              <select value={selYear} onChange={e => setSelYear(Number(e.target.value))} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs">
                {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </>
          )}
          {periodMode === 'year' && (
            <select value={selYear} onChange={e => setSelYear(Number(e.target.value))} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs">
              {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2, now.getFullYear() - 3].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          {periodMode === 'custom' && (
            <>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
              <span className="text-gray-400 text-xs">–</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
            </>
          )}
        </div>
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
              {editingId && (
                <button
                  onClick={() => deleteReceipt(editingId)}
                  disabled={saving}
                  className="border border-red-200 bg-red-50 text-red-700 rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-40"
                >
                  🗑️ Izbriši
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving || !form.vendor || !form.amount_net}
                className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-40"
              >
                {saving ? 'Shranjujem...' : editingId ? 'Posodobi strošek' : 'Shrani strošek'}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditingId(null) }}
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
            {/* DODANO (30.7.2026): horizontalno drsenje na mobilnih napravah. */}
            <div className="overflow-x-auto">
            <div className="min-w-[640px]">
            <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50 border-b border-gray-100">
              <div className="col-span-2 text-xs font-medium text-gray-500">Datum</div>
              <div className="col-span-3 text-xs font-medium text-gray-500">Dobavitelj</div>
              <div className="col-span-2 text-xs font-medium text-gray-500">Kategorija</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Osnova</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">DDV vhod</div>
              <div className="col-span-1 text-xs font-medium text-gray-500 text-right">Skupaj</div>
            </div>
            {expenses.map((exp, i) => (
              <div key={exp.id} onClick={() => openEdit(exp)} className={`grid grid-cols-12 gap-2 px-6 py-3 items-center cursor-pointer hover:bg-gray-50 transition-colors ${i < expenses.length-1 ? 'border-b border-gray-50' : ''}`}>
                <div className="col-span-2 text-xs text-gray-500">
                  {(exp.receipt_date ? (exp.receipt_date ? (exp.receipt_date ? new Date(exp.receipt_date).toLocaleDateString('sl-SI') : '—') : '—') : '—')}
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
            </div>
          </div>
        )}
      </div>
    </div>
    </AppLayout>
  )
}