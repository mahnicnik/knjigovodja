'use client'

import { useEffect, useState } from 'react'
import { lokalniDatum } from '@/lib/tax-constants'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'

// Amortizacijske stopnje po ZDoh-2
const CATEGORIES = [
  { value: 'racunalnik', label: 'Računalnik / IT oprema', rate: 50, years: 2 },
  { value: 'avto', label: 'Osebni avtomobil', rate: 20, years: 5 },
  { value: 'stroji', label: 'Stroji in naprave', rate: 20, years: 5 },
  { value: 'pohistvo', label: 'Pohištvo in pisarniška oprema', rate: 20, years: 5 },
  { value: 'stavba', label: 'Stavba / nepremičnina', rate: 3, years: 33 },
  { value: 'programska', label: 'Programska oprema', rate: 50, years: 2 },
  { value: 'drugo', label: 'Drugo', rate: 20, years: 5 },
]

function calcAmortization(purchasePrice: number, rate: number, purchaseYear: number, currentYear: number) {
  const annualAmount = purchasePrice * (rate / 100)
  const years = Math.ceil(100 / rate)
  const schedule = []
  let remaining = purchasePrice

  for (let y = 0; y < years; y++) {
    const year = purchaseYear + y
    const amount = Math.min(annualAmount, remaining)
    remaining = Math.max(0, remaining - amount)
    schedule.push({ year, amount: Math.round(amount * 100) / 100, remaining: Math.round(remaining * 100) / 100 })
    if (remaining === 0) break
  }

  return schedule
}

export default function AmortizacijaPage() {
  const [org, setOrg] = useState<any>(null)
  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '',
    category: 'racunalnik',
    purchase_price: '',
    purchase_date: lokalniDatum(),
    description: '',
  })
  const supabase = createClient()
  const currentYear = new Date().getFullYear()

  useEffect(() => { load() }, [])

  // POPRAVLJENO (26.7.2026, audit K4): prej localStorage - zdaj baza
  // (fixed_assets tabela). Razpored amortizacije se preracuna ob vsakem
  // nalaganju (ni shranjen kot podatek, samo izpeljan iz nabavne cene/stopnje).
  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
    if (member) {
      const o = (member as any).organizations
      setOrg(o)
      const { data } = await supabase
        .from('fixed_assets')
        .select('*')
        .eq('org_id', o.id)
        .order('purchase_date', { ascending: false })
      const withSchedule = (data || []).map((asset: any) => ({
        ...asset,
        categoryLabel: asset.category_label,
        schedule: calcAmortization(
          Number(asset.purchase_price),
          Number(asset.rate),
          new Date(asset.purchase_date).getFullYear(),
          currentYear
        ),
      }))
      setAssets(withSchedule)
    }
    setLoading(false)
  }

  async function handleAdd() {
    if (!org || !form.name || !form.purchase_price) return
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    const cat = CATEGORIES.find(c => c.value === form.category)!
    const price = parseFloat(form.purchase_price)
    const purchaseYear = new Date(form.purchase_date).getFullYear()
    const schedule = calcAmortization(price, cat.rate, purchaseYear, currentYear)

    const { error } = await supabase.from('fixed_assets').insert({
      org_id: org.id,
      name: form.name,
      category: form.category,
      category_label: cat.label,
      rate: cat.rate,
      purchase_price: price,
      purchase_date: form.purchase_date,
      description: form.description,
    })
    if (error) {
      alert('Napaka pri shranjevanju: ' + error.message)
      setSaving(false)
      return
    }

    // DODANO (26.7.2026): poknjizi TEKOCE LETO amortizacije v KPO kot
    // odhodek (prej se ni knjizilo NIKAMOR). Naslednja leta te iste
    // amortizacije je treba poknjiziti rocno vsako naslednje leto posebej
    // (samodejno letno obnavljanje ni del tega popravka).
    const currentYearEntry = schedule.find(e => e.year === currentYear)
    if (currentYearEntry && currentYearEntry.amount > 0) {
      // POPRAVLJENO (16.8.2026): prej brez preverbe napake - vnos v davcno evidenco
    // se ni shranil, uporabnik pa je videl potrditev.
    const { error: amortErr } = await supabase.from('kpo_entries').insert({
        org_id: org.id,
        entry_date: purchaseYear === currentYear ? form.purchase_date : `${currentYear}-01-01`,
        description: `Amortizacija ${currentYear}: ${form.name}`,
        entry_type: 'expense',
        income: 0,
        expense: currentYearEntry.amount,
        vat_in: 0,
        vat_out: 0,
        category: 'Amortizacija',
        notes: `${cat.label} · stopnja ${cat.rate}%/leto`,
      })
      if (amortErr) { alert('Amortizacije ni bilo mogoče poknjižiti: ' + amortErr.message); return }
    }

    setForm({ name: '', category: 'racunalnik', purchase_price: '', purchase_date: lokalniDatum(), description: '' })
    setShowForm(false)
    setSaving(false)
    load()
  }

  async function deleteAsset(id: string) {
    if (!confirm('Izbrišete sredstvo? (Že poknjižen strošek amortizacije v KPO ostane, izbriše se samo evidenca sredstva.)')) return
    await supabase.from('fixed_assets').delete().eq('id', id)
    load()
  }

  // Strošek amortizacije za tekoče leto
  const currentYearExpense = assets.reduce((s, asset) => {
    const yearEntry = asset.schedule.find((e: any) => e.year === currentYear)
    return s + (yearEntry?.amount || 0)
  }, 0)

  // Skupna vrednost sredstev (neto)
  const totalNetValue = assets.reduce((s, asset) => {
    const yearEntry = asset.schedule.find((e: any) => e.year === currentYear)
    return s + (yearEntry?.remaining || 0)
  }, 0)

  const selectedCat = CATEGORIES.find(c => c.value === form.category)!

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
          <h1 className="font-semibold text-gray-900 mt-0.5">Amortizacija opreme</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
          + Dodaj sredstvo
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Info */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-6">
          <div className="font-medium text-blue-800 text-sm mb-1">💡 Kaj je amortizacija?</div>
          <div className="text-blue-700 text-xs leading-relaxed">
            Ko kupite opremo (računalnik, avto, stroj) — tega ne morete odpisati v celoti takoj.
            Strošek se <strong>razporeja skozi leta</strong> po predpisanih stopnjah.
            Računalnik za €1,200 → strošek €600/leto × 2 leti (50% stopnja).
          </div>
        </div>

        {/* Povzetek */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Sredstev</div>
            <div className="text-2xl font-semibold">{assets.length}</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Amortizacija {currentYear}</div>
            <div className="text-2xl font-semibold text-red-500">€{currentYearExpense.toFixed(2)}</div>
            <div className="text-xs text-gray-400 mt-1">Davčno priznavni strošek</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Neto vrednost sredstev</div>
            <div className="text-2xl font-semibold">€{totalNetValue.toFixed(2)}</div>
            <div className="text-xs text-gray-400 mt-1">Neodpisana vrednost</div>
          </div>
        </div>

        {/* Forma */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-900 p-6 mb-6">
            <h3 className="font-medium text-gray-900 mb-4">Novo osnovno sredstvo</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Naziv *</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="npr. MacBook Pro 14"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Kategorija</label>
                <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>
                      {c.label} ({c.rate}%/leto — {c.years} let)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Nabavna vrednost (€) *</label>
                <input type="number" onFocus={e => e.target.select()} value={form.purchase_price}
                  onChange={e => setForm({...form, purchase_price: e.target.value})}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Datum nakupa</label>
                <input type="date" value={form.purchase_date}
                  onChange={e => setForm({...form, purchase_date: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>

            {/* Predogled amortizacije */}
            {form.purchase_price && parseFloat(form.purchase_price) > 0 && (
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <div className="text-xs font-medium text-gray-500 mb-2 uppercase">Razpored amortizacije</div>
                <div className="space-y-1">
                  {calcAmortization(
                    parseFloat(form.purchase_price),
                    selectedCat.rate,
                    new Date(form.purchase_date).getFullYear(),
                    currentYear
                  ).map(e => (
                    <div key={e.year} className={`flex justify-between text-xs px-2 py-1.5 rounded-lg ${e.year === currentYear ? 'bg-gray-900 text-white' : 'text-gray-600'}`}>
                      <span>{e.year}</span>
                      <span>strošek: €{e.amount.toFixed(2)}</span>
                      <span>ostane: €{e.remaining.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleAdd} disabled={saving || !form.name || !form.purchase_price}
                className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-40">
                {saving ? 'Shranjujem...' : 'Dodaj sredstvo'}
              </button>
              <button onClick={() => setShowForm(false)}
                className="border border-gray-200 rounded-xl px-6 py-2.5 text-sm">
                Prekliči
              </button>
            </div>
          </div>
        )}

        {/* Seznam sredstev */}
        {assets.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-4">🖥️</div>
            <h3 className="font-semibold text-gray-900 mb-2">Še ni osnovnih sredstev</h3>
            <p className="text-gray-500 text-sm mb-6">
              Dodajte opremo ki ste jo kupili za poslovanje
            </p>
            <button onClick={() => setShowForm(true)}
              className="bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-medium">
              + Dodaj sredstvo
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {assets.map(asset => {
              const currentEntry = asset.schedule.find((e: any) => e.year === currentYear)
              const totalAmortized = asset.purchase_price - (currentEntry?.remaining || 0)
              const pct = (totalAmortized / asset.purchase_price) * 100

              return (
                <div key={asset.id} className="bg-white rounded-2xl border border-gray-100 p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="font-semibold text-gray-900">{asset.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {asset.categoryLabel} · {asset.rate}%/leto · Nabava: €{Number(asset.purchase_price).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {new Date(asset.purchase_date).toLocaleDateString('sl-SI')}
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Strošek {currentYear}</div>
                        <div className="font-semibold text-red-500">€{(currentEntry?.amount || 0).toFixed(2)}</div>
                      </div>
                      <button onClick={() => deleteAsset(asset.id)}
                        className="text-xs border border-red-100 text-red-400 rounded-lg px-2 py-1 hover:bg-red-50">
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Odpisano: €{totalAmortized.toFixed(2)} ({pct.toFixed(0)}%)</span>
                      <span>Ostane: €{(currentEntry?.remaining || 0).toFixed(2)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="bg-gray-900 h-2 rounded-full" style={{width: `${Math.min(pct, 100)}%`}}></div>
                    </div>
                  </div>

                  {/* Razpored */}
                  <div className="grid grid-cols-5 gap-1">
                    {asset.schedule.map((e: any) => (
                      <div key={e.year} className={`text-center p-2 rounded-lg text-xs ${e.year === currentYear ? 'bg-gray-900 text-white' : e.year < currentYear ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                        <div className="font-medium">{e.year}</div>
                        <div>€{e.amount.toFixed(0)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Skupni strošek */}
            <div className="bg-gray-900 rounded-2xl p-5 text-white">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-sm text-gray-400">Skupna amortizacija {currentYear}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Davčno priznavni strošek za DDD</div>
                </div>
                <div className="text-2xl font-semibold">€{currentYearExpense.toFixed(2)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </AppLayout>
  )
}
