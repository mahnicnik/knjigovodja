'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

// DOHODNINSKA LESTVICA 2026
const BRACKETS = [
  { upTo: 8755,    rate: 0.16, label: '16%' },
  { upTo: 18488,   rate: 0.26, label: '26%' },
  { upTo: 70907,   rate: 0.33, label: '33%' },
  { upTo: 250000,  rate: 0.39, label: '39%' },
  { upTo: Infinity, rate: 0.50, label: '50%' },
]

const GENERAL_RELIEF = 5000
const SP_CONTRIBUTIONS: Record<number, number> = {
  1: 2584.92, 2: 3012.36, 3: 3439.20, 4: 3866.04, 5: 4293.00,
  6: 4719.84, 7: 5146.68, 8: 5399.76, 9: 6024.24, 10: 6451.08,
  11: 6877.80, 12: 7304.64, 13: 7731.48, 14: 8585.16, 15: 9438.84,
}

function calcTax(annualBase: number): number {
  if (annualBase <= 0) return 0
  let tax = 0
  let prev = 0
  for (const b of BRACKETS) {
    if (annualBase <= prev) break
    const taxable = Math.min(annualBase, b.upTo === Infinity ? annualBase : b.upTo) - prev
    tax += taxable * b.rate
    prev = b.upTo === Infinity ? annualBase : b.upTo
    if (b.upTo === Infinity) break
  }
  return Math.round(tax * 100) / 100
}

function getCurrentBracket(base: number) {
  for (const b of BRACKETS) {
    if (base <= (b.upTo === Infinity ? Infinity : b.upTo)) return b
  }
  return BRACKETS[BRACKETS.length - 1]
}

export default function DohodninaPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Vhodni podatki
  const [revenue, setRevenue] = useState('')
  const [expenses, setExpenses] = useState('')
  const [inputMode, setInputMode] = useState<'ytd' | 'avg'>('ytd')
  const [avgMonthlyRevenue, setAvgMonthlyRevenue] = useState('')
  const [contributionClass, setContributionClass] = useState(8)
  const [dependents, setDependents] = useState(0)
  const [month, setMonth] = useState(new Date().getMonth() + 1)

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
        if (o.contribution_class) setContributionClass(o.contribution_class)

        // Naloži dejanske podatke iz baze
        const { data: invoices } = await supabase
          .from('issued_invoices')
          .select('amount_net')
          .eq('org_id', o.id)
          .neq('status', 'draft')
        const { data: receipts } = await supabase
          .from('receipts')
          .select('amount_net')
          .eq('org_id', o.id)

        const totalRevenue = invoices?.reduce((s: number, i: any) => s + Number(i.amount_net), 0) || 0
        const totalExpenses = receipts?.reduce((s: number, r: any) => s + Number(r.amount_net), 0) || 0

        if (totalRevenue > 0) setRevenue(totalRevenue.toFixed(2))
        if (totalExpenses > 0) setExpenses(totalExpenses.toFixed(2))
      }
      setLoading(false)
    }
    load()
  }, [])

  // Izračuni
  const rev = parseFloat(revenue) || 0
  const exp = parseFloat(expenses) || 0
  const annualContributions = SP_CONTRIBUTIONS[contributionClass] || SP_CONTRIBUTIONS[8]
  const monthlyContributions = annualContributions / 12

  // Ekstrapoliraj na letno če je samo delno leto, ali uporabi povprečni mesečni prihodek
  const avgMonthly = parseFloat(avgMonthlyRevenue) || 0
  const annualRevenue = inputMode === 'avg' ? avgMonthly * 12 : (month < 12 ? (rev / month) * 12 : rev)
  const annualExpenses = month < 12 ? (exp / month) * 12 : exp

  // Davčna osnova
  const taxableBase = Math.max(0, annualRevenue - annualExpenses - annualContributions)

  // Olajšave
  const dependentRelief = dependents === 0 ? 0 : dependents === 1 ? 2697 : dependents === 2 ? 4120 : 7780
  const adjustedBase = Math.max(0, taxableBase - GENERAL_RELIEF - dependentRelief)

  // Dohodnina
  const annualTax = calcTax(adjustedBase)
  const monthlyTax = annualTax / 12

  // "Koliko je moje?"
  const annualNet = annualRevenue - annualExpenses - annualContributions - annualTax
  const monthlyNet = annualNet / 12

  // Efektivna stopnja
  const effectiveRate = adjustedBase > 0 ? ((annualTax / adjustedBase) * 100).toFixed(1) : '0'
  const currentBracket = getCurrentBracket(adjustedBase)

  // Akontacija (mesečna)
  const akontacija = monthlyTax

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
          <h1 className="font-semibold text-gray-900 mt-0.5">Akontacija dohodnine</h1>
        </div>
        <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">2026</div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 grid grid-cols-3 gap-6">

        {/* Leva stran — vhodni podatki */}
        <div className="col-span-1 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-medium text-gray-900 mb-4 text-sm">Vaši podatki</h3>

            <div className="space-y-3">
              <div className="flex gap-2 mb-1">
                <button onClick={() => setInputMode('ytd')} className={`flex-1 text-xs py-1.5 rounded-lg font-medium ${inputMode === 'ytd' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>Prihodki YTD</button>
                <button onClick={() => setInputMode('avg')} className={`flex-1 text-xs py-1.5 rounded-lg font-medium ${inputMode === 'avg' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>Povprečje/mes</button>
              </div>
              {inputMode === 'ytd' ? (
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  Prihodki YTD (€)
                  <span className="text-gray-400 ml-1">— iz vaše KPO</span>
                </label>
                <input
                  type="number"
                  value={revenue}
                  onChange={e => setRevenue(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              ) : (
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  Povprečni mesečni prihodek (€)
                  <span className="text-gray-400 ml-1">— oceni letni prihodek</span>
                </label>
                <input
                  type="number"
                  value={avgMonthlyRevenue}
                  onChange={e => setAvgMonthlyRevenue(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              )}

              <div>
                <label className="text-xs text-gray-500 block mb-1">Odhodki YTD (€)</label>
                <input
                  type="number"
                  value={expenses}
                  onChange={e => setExpenses(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Tekoči mesec</label>
                <select
                  value={month}
                  onChange={e => setMonth(parseInt(e.target.value))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none"
                >
                  {['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Avg','Sep','Okt','Nov','Dec'].map((m, i) => (
                    <option key={i} value={i+1}>{m}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Za ekstrapolacijo na celo leto</p>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Prispevni razred</label>
                <select
                  value={contributionClass}
                  onChange={e => setContributionClass(parseInt(e.target.value))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none"
                >
                  {Array.from({length: 15}, (_, i) => i+1).map(c => (
                    <option key={c} value={c}>
                      Razred {c} — €{(SP_CONTRIBUTIONS[c]/12).toFixed(0)}/mes
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Letno: €{annualContributions.toFixed(2)}
                </p>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Vzdrževani otroci</label>
                <select
                  value={dependents}
                  onChange={e => setDependents(parseInt(e.target.value))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none"
                >
                  <option value={0}>Brez otrok</option>
                  <option value={1}>1 otrok</option>
                  <option value={2}>2 otroka</option>
                  <option value={3}>3+ otroci</option>
                </select>
              </div>
            </div>
          </div>

          {/* Davčna lestvica */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-medium text-gray-900 mb-3 text-sm">Dohodninska lestvica 2026</h3>
            <div className="space-y-1.5">
              {BRACKETS.filter(b => b.upTo !== Infinity).map((b, i) => {
                const prev = i === 0 ? 0 : BRACKETS[i-1].upTo
                const isActive = adjustedBase > prev && adjustedBase <= b.upTo
                return (
                  <div key={i} className={`flex justify-between text-xs px-2 py-1.5 rounded-lg ${isActive ? 'bg-gray-900 text-white' : 'text-gray-500'}`}>
                    <span>do €{b.upTo.toLocaleString()}</span>
                    <span className="font-medium">{b.label}</span>
                  </div>
                )
              })}
              <div className={`flex justify-between text-xs px-2 py-1.5 rounded-lg ${adjustedBase > 250000 ? 'bg-gray-900 text-white' : 'text-gray-500'}`}>
                <span>nad €250.000</span>
                <span className="font-medium">50%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Desna stran — rezultati */}
        <div className="col-span-2 space-y-4">

          {/* KOLIKO JE MOJE */}
          <div className="bg-gray-900 rounded-2xl p-6 text-white">
            <div className="text-sm text-gray-400 mb-1">Koliko je moje? (mesečno)</div>
            <div className="text-5xl font-semibold mb-1">
              €{monthlyNet > 0 ? monthlyNet.toFixed(2) : '0.00'}
            </div>
            <div className="text-sm text-gray-400">
              Letno: €{annualNet > 0 ? annualNet.toFixed(2) : '0.00'}
            </div>
            <div className="mt-3 text-xs text-gray-500">
              Po odbitku vseh davkov, prispevkov in stroškov
            </div>
          </div>

          {/* Razčlenitev */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-medium text-gray-900 mb-4">Letni izračun</h3>
            <div className="space-y-0">
              <div className="flex justify-between py-2.5 border-b border-gray-50">
                <span className="text-sm text-gray-600">Letni prihodki</span>
                <span className="text-sm font-medium text-green-600">+ €{annualRevenue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2.5 border-b border-gray-50">
                <span className="text-sm text-gray-600">Letni odhodki</span>
                <span className="text-sm text-red-500">− €{annualExpenses.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2.5 border-b border-gray-50">
                <span className="text-sm text-gray-600">Prispevki s.p. (razred {contributionClass})</span>
                <span className="text-sm text-red-500">− €{annualContributions.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2.5 border-b border-gray-100 bg-gray-50 px-2 rounded-lg my-1">
                <span className="text-sm font-medium text-gray-900">Davčna osnova</span>
                <span className="text-sm font-medium">€{taxableBase.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2.5 border-b border-gray-50">
                <span className="text-sm text-gray-600">Splošna olajšava</span>
                <span className="text-sm text-green-600">− €{GENERAL_RELIEF.toFixed(2)}</span>
              </div>
              {dependents > 0 && (
                <div className="flex justify-between py-2.5 border-b border-gray-50">
                  <span className="text-sm text-gray-600">Olajšava za vzdrževane ({dependents})</span>
                  <span className="text-sm text-green-600">− €{dependentRelief.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between py-2.5 border-b border-gray-50">
                <span className="text-sm text-gray-600">Osnova za dohodnino</span>
                <span className="text-sm font-medium">€{adjustedBase.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2.5 border-b border-gray-50">
                <span className="text-sm text-gray-600">
                  Dohodnina ({currentBracket.label} razred, efektivno {effectiveRate}%)
                </span>
                <span className="text-sm text-red-500">− €{annualTax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-3 border-t-2 border-gray-900 mt-1">
                <span className="font-semibold text-gray-900">Neto letni zaslužek</span>
                <span className="font-semibold text-gray-900 text-lg">€{annualNet.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Mesečni povzetek */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 mb-1">Mesečna akontacija</div>
              <div className="text-lg font-semibold text-orange-500">€{akontacija.toFixed(2)}</div>
              <div className="text-xs text-gray-400 mt-1">Plačati FURS mesečno</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 mb-1">Mesečni prispevki</div>
              <div className="text-lg font-semibold text-red-500">€{monthlyContributions.toFixed(2)}</div>
              <div className="text-xs text-gray-400 mt-1">ZPIZ + ZZZS</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 mb-1">Skupaj FURS/mes</div>
              <div className="text-lg font-semibold">€{(akontacija + monthlyContributions).toFixed(2)}</div>
              <div className="text-xs text-gray-400 mt-1">Prispevki + akontacija</div>
            </div>
          </div>

          {/* Nasvet */}
          {annualNet > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
              <div className="text-sm font-medium text-blue-800 mb-1">💡 Davčni nasvet</div>
              <div className="text-sm text-blue-700 leading-relaxed">
                {adjustedBase > 70907
                  ? `Vaša davčna osnova je v 39% ali 50% razredu. Razmislite o davčno priznavnih stroških (izobraževanje, oprema, pisarniški material) — vsak €100 dodatnih stroškov vam prihrani €${(currentBracket.rate * 100).toFixed(0)} dohodnine.`
                  : adjustedBase > 18488
                  ? `Ste v 33% davčnem razredu. Vsak €100 dodatnih davčno priznavnih stroškov vam prihrani €33 dohodnine.`
                  : `Ste v ugodnem davčnem razredu. Vaša efektivna stopnja je ${effectiveRate}%.`
                }
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}