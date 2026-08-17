'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'
import { formatEurNumber } from '@/lib/format'

const MONTHS = ['Januar', 'Februar', 'Marec', 'April', 'Maj', 'Junij', 'Julij', 'Avgust', 'September', 'Oktober', 'November', 'December']

export default function KPOPage() {
  const [entries, setEntries] = useState<any[]>([])
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [customRange, setCustomRange] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  function getEffectiveRange() {
    if (customRange && dateFrom && dateTo) return { from: dateFrom, to: dateTo }
    const from = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`
    const to = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${new Date(selectedYear, selectedMonth + 1, 0).getDate()}`
    return { from, to }
  }

  useEffect(() => {
    async function loadOrg() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
      if (member) setOrg((member as any).organizations)
      else setLoading(false)
    }
    loadOrg()
  }, [])

  useEffect(() => {
    if (!org) return
    loadEntries()
  }, [org, selectedMonth, selectedYear, customRange, dateFrom, dateTo])

  async function loadEntries() {
    setLoading(true)
    const { from, to } = getEffectiveRange()
    const { data } = await supabase
      .from('kpo_entries')
      .select('*')
      .eq('org_id', org.id)
      .gte('entry_date', from)
      .lte('entry_date', to)
      .order('entry_date', { ascending: false })
    const { data: invoices } = await supabase
      .from('issued_invoices')
      .select('*')
      .eq('org_id', org.id)
      .neq('status', 'draft').or('zoi.is.null,zoi.not.like.DEMO-%')
      .gte('issue_date', from)
      .lte('issue_date', to)
      .order('issue_date', { ascending: false })
    // POPRAVLJENO (26.7.2026): preprecitev dvojnega stetja - racuni, ki
    // so ze poknjizeni kot pravi KPO vnos (npr. prek bancnega uvoza,
    // invoice_id povezava), se NE sintetizirajo se enkrat iz
    // issued_invoices - prikaze se samo pravi vnos (z datumom placila).
    const { data: linkedEntries } = await supabase
      .from('kpo_entries')
      .select('invoice_id')
      .eq('org_id', org.id)
      .not('invoice_id', 'is', null)
    const linkedInvoiceIds = new Set((linkedEntries || []).map((e: any) => e.invoice_id))
    const invEntries = (invoices || [])
      .filter((inv: any) => !linkedInvoiceIds.has(inv.id))
      .map((inv: any) => ({
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
    setLoading(false)
  }

  const totalIncome = entries.reduce((s, e) => s + (e.income || 0), 0)
  const totalExpense = entries.reduce((s, e) => s + (e.expense || 0), 0)
  const totalVatOut = entries.reduce((s, e) => s + (e.vat_out || 0), 0)
  const totalVatIn = entries.reduce((s, e) => s + (e.vat_in || 0), 0)
  const profit = totalIncome - totalExpense

  if (loading && !org) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Nalagam...</p>
    </div>
  )

  return (
    <AppLayout org={org}>
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="font-semibold text-gray-900 mt-0.5">KPO knjiga</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!customRange ? (
            <>
              <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
                {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </>
          ) : (
            <>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <span className="text-gray-400 text-sm">–</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </>
          )}
          <button
            onClick={() => setCustomRange(!customRange)}
            className="text-xs text-gray-500 hover:text-gray-900 underline"
          >
            {customRange ? 'Nazaj na mesec/leto' : 'Izberi interval →'}
          </button>
          <button className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
            Izvozi PDF
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Prihodki</div>
            <div className="text-xl font-semibold text-green-600">€{formatEurNumber(totalIncome)}</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Odhodki</div>
            <div className="text-xl font-semibold text-red-500">€{formatEurNumber(totalExpense)}</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Dobiček</div>
            <div className={`text-xl font-semibold ${profit >= 0 ? 'text-gray-900' : 'text-red-500'}`}>
              €{formatEurNumber(profit)}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">DDV dolg</div>
            <div className="text-xl font-semibold text-orange-500">
              €{formatEurNumber((totalVatOut - totalVatIn))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {/* DODANO (30.7.2026): horizontalno drsenje na mobilnih napravah
              namesto obrezane/prekrivajoce vsebine pri grid-cols-12. */}
          <div className="overflow-x-auto">
          <div className="min-w-[640px]">
          <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50 border-b border-gray-100">
            <div className="col-span-2 text-xs font-medium text-gray-500">Datum</div>
            <div className="col-span-4 text-xs font-medium text-gray-500">Opis</div>
            <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Prihodek</div>
            <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Odhodek</div>
            <div className="col-span-2 text-xs font-medium text-gray-500 text-right">DDV</div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-400 text-sm">Nalagam...</div>
          ) : entries.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="font-semibold text-gray-900 mb-2">Za izbrano obdobje ni zapisov</h3>
              <p className="text-gray-500 text-sm">Izdajte račun, dodajte strošek, ali izberite drugo obdobje</p>
            </div>
          ) : (
            entries.map((entry, i) => (
              <div key={entry.id} className={`grid grid-cols-12 gap-2 px-6 py-3 text-sm ${i < entries.length-1 ? 'border-b border-gray-50' : ''}`}>
                <div className="col-span-2 text-gray-500 text-xs">
                  {new Date(entry.entry_date).toLocaleDateString('sl-SI')}
                </div>
                <div className="col-span-4 text-gray-900 text-xs truncate">{entry.description}</div>
                <div className="col-span-2 text-right text-xs">
                  {entry.income > 0 ? <span className="text-green-600 font-medium">€{formatEurNumber(entry.income)}</span> : <span className="text-gray-300">—</span>}
                </div>
                <div className="col-span-2 text-right text-xs">
                  {entry.expense > 0 ? <span className="text-red-500">€{formatEurNumber(entry.expense)}</span> : <span className="text-gray-300">—</span>}
                </div>
                <div className="col-span-2 text-right text-xs text-gray-500">
                  {(entry.vat_out || entry.vat_in) > 0 ? `€${formatEurNumber((entry.vat_out || entry.vat_in))}` : '—'}
                </div>
              </div>
            ))
          )}

          {entries.length > 0 && (
            <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50 border-t border-gray-200">
              <div className="col-span-2 text-xs font-medium text-gray-700">SKUPAJ</div>
              <div className="col-span-4"></div>
              <div className="col-span-2 text-right text-xs font-semibold text-green-600">€{formatEurNumber(totalIncome)}</div>
              <div className="col-span-2 text-right text-xs font-semibold text-red-500">€{formatEurNumber(totalExpense)}</div>
              {/* POPRAVLJENO (30.7.2026): SKUPAJ je sestevek vsega DDV, prikazanega
                  v tem stolpcu (prihodek + strosek), NE neto obveznost -
                  ta je pravilno ze zgoraj v kartici "DDV dolg". Prej je
                  vrstica izpuscala DDV od stroskov v celoti. */}
              <div className="col-span-2 text-right text-xs font-semibold text-gray-700">€{formatEurNumber((totalVatOut + totalVatIn))}</div>
            </div>
          )}
          </div>
          </div>
        </div>
      </div>
    </div>
    </AppLayout>
  )
}
