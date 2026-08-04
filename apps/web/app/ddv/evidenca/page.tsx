'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'

const QUARTERS = [
  { q: 1, label: 'Q1 (jan–mar)', from: '-01-01', to: '-03-31', due: 'april' },
  { q: 2, label: 'Q2 (apr–jun)', from: '-04-01', to: '-06-30', due: 'julij' },
  { q: 3, label: 'Q3 (jul–sep)', from: '-07-01', to: '-09-30', due: 'oktober' },
  { q: 4, label: 'Q4 (okt–dec)', from: '-10-01', to: '-12-31', due: 'januar' },
]

export default function DDVEvidencaPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedQ, setSelectedQ] = useState(Math.ceil((new Date().getMonth() + 1) / 3))
  const [data, setData] = useState<any>(null)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
    if (member) setOrg((member as any).organizations)
    setLoading(false)
  }

  async function generateEvidenca() {
    if (!org) return
    setGenerating(true)

    const quarter = QUARTERS.find(q => q.q === selectedQ)!
    const from = `${selectedYear}${quarter.from}`
    const to = `${selectedYear}${quarter.to}`

    const [invoicesRes, receiptsRes] = await Promise.all([
      supabase.from('issued_invoices').select('*').eq('org_id', org.id)
        .neq('status', 'draft').gte('issue_date', from).lte('issue_date', to),
      supabase.from('receipts').select('*').eq('org_id', org.id)
        .gte('receipt_date', from).lte('receipt_date', to),
    ])

    const invoices = invoicesRes.data || []
    const receipts = receiptsRes.data || []

    const vatOut22 = invoices.filter((i: any) => !i.vat_rate || i.vat_rate === 22)
      .reduce((s: number, i: any) => s + Number(i.vat_amount), 0)
    const vatOut95 = invoices.filter((i: any) => i.vat_rate === 9.5)
      .reduce((s: number, i: any) => s + Number(i.vat_amount), 0)
    const sales22 = invoices.filter((i: any) => !i.vat_rate || i.vat_rate === 22)
      .reduce((s: number, i: any) => s + Number(i.amount_net), 0)
    const sales95 = invoices.filter((i: any) => i.vat_rate === 9.5)
      .reduce((s: number, i: any) => s + Number(i.amount_net), 0)
    const vatIn = receipts.reduce((s: number, r: any) => s + Number(r.vat_amount), 0)
    const purchases = receipts.reduce((s: number, r: any) => s + Number(r.amount_net), 0)
    const vatDue = Math.max(0, vatOut22 + vatOut95 - vatIn)

    setData({ invoices, receipts, vatOut22, vatOut95, sales22, sales95, vatIn, purchases, vatDue, quarter, from, to })
    setGenerating(false)
  }

  function downloadXML() {
    if (!data || !org) return
    const q = QUARTERS.find(q => q.q === selectedQ)!
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DDV_O xmlns="http://edavki.durs.si/Documents/Schemas/DDV_O_4.xsd">
  <Podatki_o_zavezancu>
    <DavcnaStevilka>${org.tax_number}</DavcnaStevilka>
    <ID_za_DDV>SI${org.tax_number}</ID_za_DDV>
    <Naziv>${org.name}</Naziv>
    <Naslov>${org.address || ''}</Naslov>
    <PostnaStevilka>${org.post_code || ''}</PostnaStevilka>
    <Kraj>${org.city || ''}</Kraj>
  </Podatki_o_zavezancu>
  <Obdobje>
    <ObdobjeOd>${data.from}</ObdobjeOd>
    <ObdobjeDo>${data.to}</ObdobjeDo>
    <Kvartal>${selectedQ}</Kvartal>
    <Leto>${selectedYear}</Leto>
  </Obdobje>
  <Obracun>
    <!-- IZHODNI DDV (od prodaj) -->
    <P11>${data.sales22.toFixed(2)}</P11>
    <P12>${data.vatOut22.toFixed(2)}</P12>
    <P21>${data.sales95.toFixed(2)}</P21>
    <P22>${data.vatOut95.toFixed(2)}</P22>
    <!-- VHODNI DDV (od nakupov) -->
    <P41>${data.purchases.toFixed(2)}</P41>
    <P42>${data.vatIn.toFixed(2)}</P42>
    <!-- RAZLIKA -->
    <P51>${(data.vatOut22 + data.vatOut95).toFixed(2)}</P51>
    <P52>${data.vatIn.toFixed(2)}</P52>
    <P53>${data.vatDue.toFixed(2)}</P53>
  </Obracun>
  <Podpis>
    <Datum>${new Date().toISOString().split('T')[0]}</Datum>
    <Ime>${org.name}</Ime>
  </Podpis>
</DDV_O>`

    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `DDV-O-${selectedYear}-Q${selectedQ}.xml`
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadCSV() {
    if (!data || !org) return

    const b2b = data.invoices.filter((i: any) => i.client_tax_number)
    const b2c = data.invoices.filter((i: any) => !i.client_tax_number)

    let csv = 'Tip;Datum;Številka;Stranka;DDV številka;Osnova;DDV;Skupaj\n'

    b2b.forEach((inv: any) => {
      csv += `B2B;${inv.issue_date};${inv.invoice_number};${inv.client_name};${inv.client_tax_number || ''};${Number(inv.amount_net).toFixed(2)};${Number(inv.vat_amount).toFixed(2)};${Number(inv.amount_total).toFixed(2)}\n`
    })
    b2c.forEach((inv: any) => {
      csv += `B2C;${inv.issue_date};${inv.invoice_number};${inv.client_name};;${Number(inv.amount_net).toFixed(2)};${Number(inv.vat_amount).toFixed(2)};${Number(inv.amount_total).toFixed(2)}\n`
    })

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `DDV-evidenca-${selectedYear}-Q${selectedQ}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Nalagam...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <div>
          <Link href="/ddv" className="text-sm text-gray-500 hover:text-gray-900">← DDV</Link>
          <h1 className="font-semibold text-gray-900 mt-0.5">DDV-O evidenca</h1>
        </div>
        {data && (
          <div className="flex gap-2">
            <button onClick={downloadCSV}
              className="border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm">
              ⬇ CSV evidenca
            </button>
            <button onClick={downloadXML}
              className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
              ⬇ DDV-O XML
            </button>
          </div>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* Izbira obdobja */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <h3 className="font-medium text-gray-900 mb-3 text-sm">Izberite obdobje</h3>
          <div className="flex gap-3 mb-4">
            <select value={selectedQ} onChange={e => { setSelectedQ(parseInt(e.target.value)); setData(null) }}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none flex-1">
              {QUARTERS.map(q => <option key={q.q} value={q.q}>{q.label}</option>)}
            </select>
            <select value={selectedYear} onChange={e => { setSelectedYear(parseInt(e.target.value)); setData(null) }}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none w-28">
              {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={generateEvidenca} disabled={generating}
            className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40">
            {generating ? 'Generiram...' : `📊 Generiraj DDV-O za Q${selectedQ} ${selectedYear}`}
          </button>
        </div>

        {data && (
          <>
            {/* DDV povzetek */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
              <h3 className="font-medium text-gray-900 mb-4">DDV-O obračun Q{selectedQ} {selectedYear}</h3>
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-3 gap-2 text-xs font-medium text-gray-500 pb-2 border-b border-gray-100">
                  <span>Postavka</span><span className="text-right">Osnova</span><span className="text-right">DDV</span>
                </div>
                {data.sales22 > 0 && (
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="text-gray-600">Prodaje 22% (P11/P12)</span>
                    <span className="text-right">€{data.sales22.toFixed(2)}</span>
                    <span className="text-right text-red-500">€{data.vatOut22.toFixed(2)}</span>
                  </div>
                )}
                {data.sales95 > 0 && (
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="text-gray-600">Prodaje 9.5% (P21/P22)</span>
                    <span className="text-right">€{data.sales95.toFixed(2)}</span>
                    <span className="text-right text-red-500">€{data.vatOut95.toFixed(2)}</span>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-sm border-t border-gray-100 pt-2">
                  <span className="text-gray-600">Nabave (P41/P42)</span>
                  <span className="text-right">€{data.purchases.toFixed(2)}</span>
                  <span className="text-right text-green-600">−€{data.vatIn.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 font-semibold bg-gray-50 rounded-xl p-3 mt-2">
                  <span>Za plačilo FURS (P53)</span>
                  <span></span>
                  <span className="text-right text-orange-500">€{data.vatDue.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* B2B / B2C ločitev */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="text-xs font-medium text-gray-500 mb-2 uppercase">B2B — Pravne osebe</div>
                <div className="text-2xl font-semibold">{data.invoices.filter((i: any) => i.client_tax_number).length}</div>
                <div className="text-xs text-gray-500 mt-1">računov z DDV številko</div>
                <div className="text-sm font-medium text-gray-900 mt-2">
                  €{data.invoices.filter((i: any) => i.client_tax_number)
                    .reduce((s: number, i: any) => s + Number(i.amount_total), 0).toFixed(2)}
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="text-xs font-medium text-gray-500 mb-2 uppercase">B2C — Fizične osebe</div>
                <div className="text-2xl font-semibold">{data.invoices.filter((i: any) => !i.client_tax_number).length}</div>
                <div className="text-xs text-gray-500 mt-1">računov brez DDV številke</div>
                <div className="text-sm font-medium text-gray-900 mt-2">
                  €{data.invoices.filter((i: any) => !i.client_tax_number)
                    .reduce((s: number, i: any) => s + Number(i.amount_total), 0).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Navodilo za oddajo */}
            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-4">
              <div className="font-medium text-orange-800 text-sm mb-2">⚠️ Kako oddati DDV-O na eDavki</div>
              <div className="text-orange-700 text-xs leading-relaxed">
                1. Prenesite XML datoteko (gumb zgoraj desno)<br/>
                2. Pojdite na <strong>edavki.durs.si</strong><br/>
                3. Vloge → DDV → DDV-O obrazec<br/>
                4. Naložite XML ali vnesite ročno<br/>
                5. Rok: do konca meseca po koncu kvartala<br/>
                6. Po oddaji prejmete UPN za plačilo
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={downloadXML}
                className="flex-1 bg-gray-900 text-white rounded-xl py-3 text-sm font-medium">
                ⬇ Prenesi DDV-O XML za eDavki
              </button>
              <button onClick={downloadCSV}
                className="flex-1 border border-gray-200 rounded-xl py-3 text-sm">
                ⬇ CSV evidenca (Excel)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}