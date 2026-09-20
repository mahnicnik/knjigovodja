'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'
import { formatEurNumber } from '@/lib/format'

const MONTHS = ['Januar', 'Februar', 'Marec', 'April', 'Maj', 'Junij', 'Julij', 'Avgust', 'September', 'Oktober', 'November', 'December']

// Ponedeljek tedna, v katerem lezi dani datum (teden ISO, Pon-Ned).
function ponedeljekTedna(d: Date): Date {
  const dan = d.getDay() // 0=Ned..6=Sob
  const razlika = dan === 0 ? -6 : 1 - dan
  const p = new Date(d)
  p.setDate(d.getDate() + razlika)
  p.setHours(0, 0, 0, 0)
  return p
}

export default function KPOPage() {
  const [entries, setEntries] = useState<any[]>([])
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  // DODANO: hitri filtri obdobja - prej je bil na voljo samo mesec/leto ali
  // rocno izbran interval. "mesec" ohranja privzeto obnasanje.
  const [obdobjeTip, setObdobjeTip] = useState<'teden' | 'mesec' | 'cetrtletje' | 'leto' | 'ytd' | 'interval'>('mesec')
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(now.getMonth() / 3)) // 0-3
  const [weekStart, setWeekStart] = useState(ponedeljekTedna(now))
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  // Zdruzljivost s prejsnjim imenom - uporabljeno spodaj v JSX.
  const customRange = obdobjeTip === 'interval'

  function fmtYMD(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  function fmtSl(d: Date) {
    return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`
  }

  function getEffectiveRange() {
    if (obdobjeTip === 'interval') {
      if (dateFrom && dateTo) return { from: dateFrom, to: dateTo }
      // Se ni izbran interval - obnasaj se kot "leto do danes", da ni prazno.
      return { from: `${now.getFullYear()}-01-01`, to: fmtYMD(now) }
    }
    if (obdobjeTip === 'teden') {
      const konec = new Date(weekStart)
      konec.setDate(weekStart.getDate() + 6)
      return { from: fmtYMD(weekStart), to: fmtYMD(konec) }
    }
    if (obdobjeTip === 'cetrtletje') {
      const zacetniMesec = selectedQuarter * 3
      const from = `${selectedYear}-${String(zacetniMesec + 1).padStart(2, '0')}-01`
      const koncniMesec = zacetniMesec + 2
      const to = `${selectedYear}-${String(koncniMesec + 1).padStart(2, '0')}-${new Date(selectedYear, koncniMesec + 1, 0).getDate()}`
      return { from, to }
    }
    if (obdobjeTip === 'leto') {
      return { from: `${selectedYear}-01-01`, to: `${selectedYear}-12-31` }
    }
    if (obdobjeTip === 'ytd') {
      // Za pretekla leta primerjamo do ISTEGA dne v letu (smiselna
      // primerjava "enako obdobje lani"), za tekoce leto do danes.
      const doDatuma = selectedYear === now.getFullYear() ? now : new Date(selectedYear, now.getMonth(), now.getDate())
      return { from: `${selectedYear}-01-01`, to: fmtYMD(doDatuma) }
    }
    // "mesec" (privzeto, nespremenjeno obnasanje)
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
  }, [org, selectedMonth, selectedYear, obdobjeTip, selectedQuarter, weekStart, dateFrom, dateTo])

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
    // POPRAVLJENO (19.8.2026): brali smo SAMO invoice_id. Prejeti racuni
    // (stroski) se v KPO knjigi NISO prikazovali - izdani racuni so se
    // sintetizirali, stroski pa ne. Uporabnik, ki je vnesel strosek in ga
    // potrdil, ga v knjigi ni videl: prihodki so bili tam, odhodki pa 0.
    const { data: linkedEntries } = await supabase
      .from('kpo_entries')
      .select('invoice_id, receipt_id')
      .eq('org_id', org.id)
      .or('invoice_id.not.is.null,receipt_id.not.is.null')
    const linkedInvoiceIds = new Set((linkedEntries || []).map((e: any) => e.invoice_id).filter(Boolean))
    const linkedReceiptIds = new Set((linkedEntries || []).map((e: any) => e.receipt_id).filter(Boolean))

    // Prejeti racuni (stroski) - enak vzorec kot pri izdanih racunih:
    // tisti, ki so ze poknjizeni kot pravi KPO vnos, se ne podvojijo.
    const { data: receipts } = await supabase
      .from('receipts')
      .select('id, vendor, receipt_date, amount_net, amount_total, vat_amount, category, description, status')
      .eq('org_id', org.id)
      .gte('receipt_date', from)
      .lte('receipt_date', to)
      .order('receipt_date', { ascending: false })

    const recEntries = (receipts || [])
      .filter((r: any) => !linkedReceiptIds.has(r.id))
      .map((r: any) => ({
        id: r.id,
        entry_date: r.receipt_date,
        description: `${r.vendor || 'Strošek'}${r.description ? ' — ' + r.description : ''}`,
        entry_type: 'expense',
        income: 0,
        expense: Number(r.amount_net ?? r.amount_total ?? 0),
        vat_out: 0,
        vat_in: Number(r.vat_amount ?? 0),
        category: r.category || 'Drugo',
        receipt_id: r.id,
      }))
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
    const all = [...invEntries, ...recEntries, ...(data || [])].sort((a, b) =>
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
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* DODANO: hitri zavihki za obdobje - "mesec" je privzet in se
                obnasa enako kot prej. */}
            <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
              {([
                ['teden', 'Teden'], ['mesec', 'Mesec'], ['cetrtletje', 'Četrtletje'],
                ['leto', 'Leto'], ['ytd', 'YTD'], ['interval', 'Interval'],
              ] as const).map(([tip, oznaka]) => (
                <button key={tip} onClick={() => setObdobjeTip(tip)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${obdobjeTip === tip ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
                  {oznaka}
                </button>
              ))}
            </div>
            <button className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
              Izvozi PDF
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {obdobjeTip === 'teden' && (
              <div className="flex items-center gap-2">
                <button onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() - 7); return n })}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50">←</button>
                <span className="text-sm text-gray-700 tabular-nums">
                  {fmtSl(weekStart)} – {fmtSl((() => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + 6); return d })())}
                </span>
                <button onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() + 7); return n })}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50">→</button>
                <button onClick={() => setWeekStart(ponedeljekTedna(now))}
                  className="text-xs text-gray-500 hover:text-gray-900 underline">danes</button>
              </div>
            )}
            {obdobjeTip === 'mesec' && (
              <>
                <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
                  {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
                  {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </>
            )}
            {obdobjeTip === 'cetrtletje' && (
              <>
                <select value={selectedQuarter} onChange={e => setSelectedQuarter(Number(e.target.value))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
                  {[0, 1, 2, 3].map(q => <option key={q} value={q}>Q{q + 1}</option>)}
                </select>
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
                  {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </>
            )}
            {(obdobjeTip === 'leto' || obdobjeTip === 'ytd') && (
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
                {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            {obdobjeTip === 'interval' && (
              <>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                <span className="text-gray-400 text-sm">–</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </>
            )}
            {/* Jasen izpis dejanskega obdobja, ki se posilja na streznik -
                zlasti koristno pri YTD in cetrtletju, kjer meje niso ocitne. */}
            {obdobjeTip !== 'interval' && (
              <span className="text-xs text-gray-400">
                {(() => { const { from, to } = getEffectiveRange(); return `${fmtSl(new Date(from))} – ${fmtSl(new Date(to))}` })()}
              </span>
            )}
          </div>
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
