'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

const BRACKETS = [
  { upTo: 8755, rate: 0.16 },
  { upTo: 18488, rate: 0.26 },
  { upTo: 70907, rate: 0.33 },
  { upTo: 250000, rate: 0.39 },
  { upTo: Infinity, rate: 0.50 },
]

const SP_CONTRIBUTIONS: Record<number, number> = {
  1: 2584.92, 2: 3012.36, 3: 3439.20, 4: 3866.04, 5: 4293.00,
  6: 4719.84, 7: 5146.68, 8: 5399.76, 9: 6024.24, 10: 6451.08,
  11: 6877.80, 12: 7304.64, 13: 7731.48, 14: 8585.16, 15: 9438.84,
}

function calcNormirani(revenue: number, contributionClass: number) {
  const normExpenses = revenue * 0.80 // 80% normiranih odhodkov
  const taxableBase = Math.max(0, revenue - normExpenses)
  const contributions = SP_CONTRIBUTIONS[contributionClass] || SP_CONTRIBUTIONS[8]
  const adjustedBase = Math.max(0, taxableBase - contributions - 5000)
  let tax = 0, prev = 0
  for (const b of BRACKETS) {
    if (adjustedBase <= prev) break
    const t = Math.min(adjustedBase, b.upTo === Infinity ? adjustedBase : b.upTo) - prev
    tax += t * b.rate
    prev = b.upTo === Infinity ? adjustedBase : b.upTo
    if (b.upTo === Infinity) break
  }
  const netIncome = revenue - contributions - Math.round(tax * 100) / 100
  return {
    revenue,
    normExpenses: Math.round(normExpenses * 100) / 100,
    taxableBase: Math.round(taxableBase * 100) / 100,
    contributions,
    adjustedBase: Math.round(adjustedBase * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    netIncome: Math.round(netIncome * 100) / 100,
    effectiveRate: adjustedBase > 0 ? Math.round((tax / adjustedBase) * 1000) / 10 : 0,
  }
}

function calcDejanskih(revenue: number, expenses: number, contributionClass: number) {
  const contributions = SP_CONTRIBUTIONS[contributionClass] || SP_CONTRIBUTIONS[8]
  const taxableBase = Math.max(0, revenue - expenses - contributions)
  const adjustedBase = Math.max(0, taxableBase - 5000)
  let tax = 0, prev = 0
  for (const b of BRACKETS) {
    if (adjustedBase <= prev) break
    const t = Math.min(adjustedBase, b.upTo === Infinity ? adjustedBase : b.upTo) - prev
    tax += t * b.rate
    prev = b.upTo === Infinity ? adjustedBase : b.upTo
    if (b.upTo === Infinity) break
  }
  const netIncome = revenue - expenses - contributions - Math.round(tax * 100) / 100
  return {
    revenue,
    expenses,
    taxableBase: Math.round(taxableBase * 100) / 100,
    contributions,
    adjustedBase: Math.round(adjustedBase * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    netIncome: Math.round(netIncome * 100) / 100,
    effectiveRate: adjustedBase > 0 ? Math.round((tax / adjustedBase) * 1000) / 10 : 0,
  }
}

export default function NormianiPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [revenue, setRevenue] = useState('')
  const [expenses, setExpenses] = useState('')
  const [contributionClass, setContributionClass] = useState(8)
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
      if (o.contribution_class) setContributionClass(o.contribution_class)

      const { data: invoices } = await supabase
        .from('issued_invoices').select('amount_net')
        .eq('org_id', o.id).neq('status', 'draft')
      const { data: receipts } = await supabase
        .from('receipts').select('amount_net').eq('org_id', o.id)

      const totalRev = invoices?.reduce((s: number, i: any) => s + Number(i.amount_net), 0) || 0
      const totalExp = receipts?.reduce((s: number, r: any) => s + Number(r.amount_net), 0) || 0
      if (totalRev > 0) setRevenue(totalRev.toFixed(2))
      if (totalExp > 0) setExpenses(totalExp.toFixed(2))
    }
    setLoading(false)
  }

  const rev = parseFloat(revenue) || 0
  const exp = parseFloat(expenses) || 0

  const normirani = rev > 0 ? calcNormirani(rev, contributionClass) : null
  const dejanskih = rev > 0 ? calcDejanskih(rev, exp, contributionClass) : null

  const betterOption = normirani && dejanskih
    ? normirani.tax < dejanskih.tax ? 'normirani' : 'dejanskih'
    : null

  const taxSaving = normirani && dejanskih
    ? Math.abs(normirani.tax - dejanskih.tax)
    : 0

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Nalagam...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Domov</Link>
        <h1 className="font-semibold text-gray-900 mt-0.5">Normirani vs dejanski odhodki</h1>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">

        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-6">
          <div className="font-medium text-blue-800 text-sm mb-2">📊 Kaj je normirani s.p.?</div>
          <div className="text-blue-700 text-xs leading-relaxed">
            <strong>Normirani s.p.</strong> ne vodi KPO knjige in ne hrani računov za stroške.
            FURS avtomatično prizna <strong>80% odhodkov</strong> od prihodkov — ne glede na dejanske stroške.
            Davek plačate samo na 20% prihodkov.<br/><br/>
            <strong>Kdaj je normirani boljši?</strong> Ko imate malo dejanskih stroškov (pod 80% prihodkov).
            <strong>Kdaj je dejanski boljši?</strong> Ko imate visoke stroške (nad 80% prihodkov) — npr. kupujete material, opremo.
          </div>
        </div>

        {/* Vhodni podatki */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <h3 className="font-medium text-gray-900 mb-4">Vnesite podatke</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Letni prihodki (€)</label>
              <input type="number" value={revenue}
                onChange={e => setRevenue(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Dejanski letni stroški (€)</label>
              <input type="number" value={expenses}
                onChange={e => setExpenses(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Prispevni razred</label>
              <select value={contributionClass}
                onChange={e => setContributionClass(parseInt(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
                {Array.from({length: 15}, (_, i) => i+1).map(c => (
                  <option key={c} value={c}>Razred {c} — €{(SP_CONTRIBUTIONS[c]/12).toFixed(0)}/mes</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {normirani && dejanskih && (
          <>
            {/* Priporočilo */}
            {betterOption && (
              <div className={`rounded-2xl p-5 mb-6 ${betterOption === 'normirani' ? 'bg-green-50 border border-green-100' : 'bg-blue-50 border border-blue-100'}`}>
                <div className={`font-medium text-sm mb-1 ${betterOption === 'normirani' ? 'text-green-800' : 'text-blue-800'}`}>
                  💡 Priporočilo: <strong>{betterOption === 'normirani' ? 'Normirani s.p.' : 'Dejanski odhodki'}</strong>
                </div>
                <div className={`text-xs ${betterOption === 'normirani' ? 'text-green-700' : 'text-blue-700'}`}>
                  Z {betterOption === 'normirani' ? 'normiranim' : 'dejanskim'} načinom prihranite
                  <strong> €{taxSaving.toFixed(2)}</strong> dohodnine letno.
                  {betterOption === 'normirani'
                    ? ' Vaši dejanski stroški so nižji od 80% prihodkov — normirani odhodki so ugodnejši.'
                    : ' Vaši dejanski stroški presegajo 80% prihodkov — vodenje KPO se izplača.'}
                </div>
              </div>
            )}

            {/* Primerjava */}
            <div className="grid grid-cols-2 gap-6 mb-6">

              {/* Normirani */}
              <div className={`bg-white rounded-2xl border p-6 ${betterOption === 'normirani' ? 'border-green-300 ring-2 ring-green-100' : 'border-gray-100'}`}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold text-gray-900">Normirani s.p.</h3>
                  {betterOption === 'normirani' && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Priporočeno</span>
                  )}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Prihodki</span>
                    <span>€{normirani.revenue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Normirani odhodki (80%)</span>
                    <span className="text-green-600">−€{normirani.normExpenses.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Davčna osnova (20%)</span>
                    <span>€{normirani.taxableBase.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Prispevki s.p.</span>
                    <span className="text-red-500">−€{normirani.contributions.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Splošna olajšava</span>
                    <span className="text-red-500">−€5.000,00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Dohodnina ({normirani.effectiveRate}%)</span>
                    <span className="text-red-500">−€{normirani.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-base border-t border-gray-100 pt-2 mt-2">
                    <span>Neto zaslužek</span>
                    <span className="text-green-600">€{normirani.netIncome.toFixed(2)}</span>
                  </div>
                </div>
                <div className="mt-4 bg-gray-50 rounded-xl p-3 text-xs text-gray-600">
                  ✓ Ni vodenja KPO<br/>
                  ✓ Ni zbiranja računov<br/>
                  ✗ Ni odbitka DDV vhoda<br/>
                  ✗ Prihodki omejeni na €150.000/leto
                </div>
              </div>

              {/* Dejanski */}
              <div className={`bg-white rounded-2xl border p-6 ${betterOption === 'dejanskih' ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-100'}`}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold text-gray-900">Dejanski odhodki</h3>
                  {betterOption === 'dejanskih' && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">✓ Priporočeno</span>
                  )}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Prihodki</span>
                    <span>€{dejanskih.revenue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Dejanski odhodki</span>
                    <span className="text-green-600">−€{dejanskih.expenses.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Davčna osnova</span>
                    <span>€{dejanskih.taxableBase.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Prispevki s.p.</span>
                    <span className="text-red-500">−€{dejanskih.contributions.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Splošna olajšava</span>
                    <span className="text-red-500">−€5.000,00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Dohodnina ({dejanskih.effectiveRate}%)</span>
                    <span className="text-red-500">−€{dejanskih.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-base border-t border-gray-100 pt-2 mt-2">
                    <span>Neto zaslužek</span>
                    <span className="text-blue-600">€{dejanskih.netIncome.toFixed(2)}</span>
                  </div>
                </div>
                <div className="mt-4 bg-gray-50 rounded-xl p-3 text-xs text-gray-600">
                  ✓ Odbitek DDV vhoda<br/>
                  ✓ Ni omejitve prihodkov<br/>
                  ✗ Vodenje KPO knjige<br/>
                  ✗ Zbiranje vseh računov
                </div>
              </div>
            </div>

            {/* Mejnik */}
            <div className="bg-gray-900 rounded-2xl p-5 text-white">
              <div className="font-medium text-sm mb-2">📍 Mejnik — kdaj se izplača voditi KPO?</div>
              <div className="text-xs text-gray-400 leading-relaxed">
                Normirani je ugodnejši ko so vaši stroški pod <strong className="text-white">{(rev * 0.80).toFixed(0)} €</strong> (80% prihodkov).
                Vaši dejanski stroški so <strong className="text-white">€{exp.toFixed(2)}</strong>
                {exp < rev * 0.80
                  ? <span className="text-green-400"> — pod mejnikom → normirani je ugodnejši.</span>
                  : <span className="text-orange-400"> — nad mejnikom → dejanski odhodki se izplačajo.</span>
                }
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}