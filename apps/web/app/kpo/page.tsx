'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function KPOPage() {
  const [entries, setEntries] = useState<any[]>([])
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
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
        const { data } = await supabase
          .from('kpo_entries')
          .select('*')
          .eq('org_id', o.id)
          .order('entry_date', { ascending: false })
        const { data: invoices } = await supabase
          .from('issued_invoices')
          .select('*')
          .eq('org_id', o.id)
          .neq('status', 'draft')
          .order('issue_date', { ascending: false })
        const invEntries = (invoices || []).map((inv: any) => ({
          id: inv.id,
          entry_date: inv.issue_date,
          description: `Račun #${inv.invoice_number} — ${inv.client_name}`,
          entry_type: 'income',
          income: inv.amount_net,
          expense: 0,
          vat_out: inv.vat_amount,
          vat_in: 0,
          category: 'Storitev',
        }))
        const all = [...invEntries, ...(data || [])].sort((a, b) =>
          new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
        )
        setEntries(all)
      }
      setLoading(false)
    }
    load()
  }, [])

  const totalIncome = entries.reduce((s, e) => s + (e.income || 0), 0)
  const totalExpense = entries.reduce((s, e) => s + (e.expense || 0), 0)
  const totalVatOut = entries.reduce((s, e) => s + (e.vat_out || 0), 0)
  const totalVatIn = entries.reduce((s, e) => s + (e.vat_in || 0), 0)
  const profit = totalIncome - totalExpense

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
          <h1 className="font-semibold text-gray-900 mt-0.5">KPO knjiga</h1>
        </div>
        <button className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
          Izvozi PDF
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Prihodki</div>
            <div className="text-xl font-semibold text-green-600">€{totalIncome.toFixed(2)}</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Odhodki</div>
            <div className="text-xl font-semibold text-red-500">€{totalExpense.toFixed(2)}</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Dobiček</div>
            <div className={`text-xl font-semibold ${profit >= 0 ? 'text-gray-900' : 'text-red-500'}`}>
              €{profit.toFixed(2)}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">DDV dolg</div>
            <div className="text-xl font-semibold text-orange-500">
              €{(totalVatOut - totalVatIn).toFixed(2)}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50 border-b border-gray-100">
            <div className="col-span-2 text-xs font-medium text-gray-500">Datum</div>
            <div className="col-span-4 text-xs font-medium text-gray-500">Opis</div>
            <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Prihodek</div>
            <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Odhodek</div>
            <div className="col-span-2 text-xs font-medium text-gray-500 text-right">DDV</div>
          </div>

          {entries.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="font-semibold text-gray-900 mb-2">KPO knjiga je prazna</h3>
              <p className="text-gray-500 text-sm">Izdajte račun ali dodajte strošek</p>
            </div>
          ) : (
            entries.map((entry, i) => (
              <div key={entry.id} className={`grid grid-cols-12 gap-2 px-6 py-3 text-sm ${i < entries.length-1 ? 'border-b border-gray-50' : ''}`}>
                <div className="col-span-2 text-gray-500 text-xs">
                  {new Date(entry.entry_date).toLocaleDateString('sl-SI')}
                </div>
                <div className="col-span-4 text-gray-900 text-xs truncate">{entry.description}</div>
                <div className="col-span-2 text-right text-xs">
                  {entry.income > 0 ? <span className="text-green-600 font-medium">€{entry.income.toFixed(2)}</span> : <span className="text-gray-300">—</span>}
                </div>
                <div className="col-span-2 text-right text-xs">
                  {entry.expense > 0 ? <span className="text-red-500">€{entry.expense.toFixed(2)}</span> : <span className="text-gray-300">—</span>}
                </div>
                <div className="col-span-2 text-right text-xs text-gray-500">
                  {(entry.vat_out || entry.vat_in) > 0 ? `€${(entry.vat_out || entry.vat_in).toFixed(2)}` : '—'}
                </div>
              </div>
            ))
          )}

          {entries.length > 0 && (
            <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50 border-t border-gray-200">
              <div className="col-span-2 text-xs font-medium text-gray-700">SKUPAJ</div>
              <div className="col-span-4"></div>
              <div className="col-span-2 text-right text-xs font-semibold text-green-600">€{totalIncome.toFixed(2)}</div>
              <div className="col-span-2 text-right text-xs font-semibold text-red-500">€{totalExpense.toFixed(2)}</div>
              <div className="col-span-2 text-right text-xs font-semibold text-gray-700">€{totalVatOut.toFixed(2)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}