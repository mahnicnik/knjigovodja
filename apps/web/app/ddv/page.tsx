'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'
import { formatEurNumber } from '@/lib/format'
import { VAT_REGISTRATION_THRESHOLD, lokalniDatum } from '@/lib/tax-constants'

// POPRAVLJENO (29.7.2026, audit portala):
//  1. VHODNI DDV: prej trdo kodiran na €0.00 (s komentarjem "za zdaj brez
//     vhodnega DDV") - stran je zato PRECENJEVALA davcno obveznost, ker
//     ni odstevala DDV od nabav. Podatek (receipts.vat_amount) je ves cas
//     obstajal in ga stran /letni-pregled ze pravilno uporablja.
//  2. KVARTALNI FILTER: prej poizvedba BREZ datumskega filtra - sestela je
//     VSE racune od zacetka uporabe, a jih prikazala pod naslovom
//     "Q3 2026". Zdaj se filtrira po dejansko izbranem kvartalu.
//  3. Dodana izbira kvartala/leta (prej vedno samo tekoci).

const QUARTER_LABELS: Record<number, string> = {
  1: '30. april', 2: '31. julij', 3: '31. oktober', 4: '31. januar'
}

function quarterRange(quarter: number, year: number) {
  const startMonth = (quarter - 1) * 3
  const from = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`
  const endMonth = startMonth + 2
  const lastDay = new Date(year, endMonth + 1, 0).getDate()
  const to = `${year}-${String(endMonth + 1).padStart(2, '0')}-${lastDay}`
  return { from, to }
}

export default function DDVPage() {
  const [org, setOrg] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [receipts, setReceipts] = useState<any[]>([])
  const [kpoExpenses, setKpoExpenses] = useState<any[]>([])
  // DODANO (16.8.2026): izstopni DDV iz knjige (POS blagajna, banka, kartice)
  const [kpoIncome, setKpoIncome] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // DODANO (20.9.2026): drseči 12-mesečni promet za nezavezance, da vidijo,
  // koliko manjka do zakonske meje za OBVEZNO registracijo v sistem DDV
  // (60.000 € prometa v zadnjih 12 mesecih). NE preklopi vat_registered
  // samodejno - registracija je pri FURS aktivno dejanje z rokom (prijava
  // najkasneje v roku, ki ga zakon doloca po prekoracitvi praga), zavezanec
  // pa lahko zaracunava DDV šele, ko mu FURS dodeli ID za DDV. Samodejni
  // preklop bi torej lahko povzrocil zaracunavanje DDV, preden je podjetje
  // sploh registrirano - to je bolj tvegano kot prepozna registracija.
  const [rollingRevenue, setRollingRevenue] = useState<number | null>(null)
  const supabase = createClient()

  const now = new Date()
  const [quarter, setQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3))
  const [year, setYear] = useState(now.getFullYear())

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
    loadPeriod()
  }, [org, quarter, year])

  useEffect(() => {
    // DODANO (20.9.2026): samo za nezavezance racunamo drsece 12-mesecno
    // obdavcljivo osnovo (za DDV zavezanca to ni vec relevantno).
    if (!org || org.vat_registered) return
    loadRollingRevenue()
  }, [org])

  async function loadRollingRevenue() {
    const to = lokalniDatum(now)
    const fromD = new Date(now)
    fromD.setFullYear(fromD.getFullYear() - 1)
    fromD.setDate(fromD.getDate() + 1) // vkljucno z danasnjim dnem = natanko 12 mesecev
    const from = lokalniDatum(fromD)

    const [invRes, kpoIncRes] = await Promise.all([
      supabase
        .from('issued_invoices')
        .select('amount_net')
        .eq('org_id', org.id)
        .neq('status', 'draft').or('zoi.is.null,zoi.not.like.DEMO-%')
        .gte('issue_date', from)
        .lte('issue_date', to),
      // invoice_id IS NULL: ista varovalka pred dvojnim stetjem kot loadPeriod().
      supabase
        .from('kpo_entries')
        .select('income, vat_out')
        .eq('org_id', org.id)
        .eq('entry_type', 'income')
        .is('invoice_id', null)
        .gte('entry_date', from)
        .lte('entry_date', to),
    ])

    const invNet = (invRes.data || []).reduce((s, i: any) => s + Number(i.amount_net || 0), 0)
    const kpoNet = (kpoIncRes.data || []).reduce((s, e: any) => s + (Number(e.income || 0) - Number(e.vat_out || 0)), 0)
    setRollingRevenue(invNet + kpoNet)
  }

  async function loadPeriod() {
    setLoading(true)
    const { from, to } = quarterRange(quarter, year)

    const [invRes, recRes, kpoExpRes, kpoIncRes] = await Promise.all([
      supabase
        .from('issued_invoices')
        .select('*')
        .eq('org_id', org.id)
        .neq('status', 'draft').or('zoi.is.null,zoi.not.like.DEMO-%')
        .gte('issue_date', from)
        .lte('issue_date', to)
        .order('issue_date', { ascending: false }),
      supabase
        .from('receipts')
        .select('*')
        .eq('org_id', org.id)
        .gte('receipt_date', from)
        .lte('receipt_date', to)
        .order('receipt_date', { ascending: false }),
      // DODANO (30.7.2026): KPO stroski (bancni odlivi, place,
      // provizije...) - SAMO brez receipt_id, da se ze rocno vneseni
      // stroski ne stejejo dvakrat (ista varovalka kot na /porocila,
      // /letni-pregled, /statistika).
      supabase
        .from('kpo_entries')
        .select('vat_in, entry_date')
        .eq('org_id', org.id)
        .eq('entry_type', 'expense')
        .is('receipt_id', null)
        .gte('entry_date', from)
        .lte('entry_date', to),
      // DODANO (16.8.2026, KRITICNO): IZSTOPNI DDV iz knjige prihodkov.
      // Obracun je bral izstopni DDV SAMO iz izdanih racunov, promet iz POS
      // blagajne (in bancni ter karticni prilivi) pa se knjizi v kpo_entries -
      // njihov DDV v obracunu NI bil zajet. Podjetje bi FURS-u prijavilo
      // PREMALO izstopnega DDV. Filter invoice_id IS NULL prepreci dvojno
      // stetje racunov, ki so ze zajeti zgoraj.
      supabase
        .from('kpo_entries')
        .select('vat_out, entry_date')
        .eq('org_id', org.id)
        .eq('entry_type', 'income')
        .is('invoice_id', null)
        .gte('entry_date', from)
        .lte('entry_date', to),
    ])

    setInvoices(invRes.data || [])
    setReceipts(recRes.data || [])
    setKpoExpenses(kpoExpRes.data || [])
    setKpoIncome(kpoIncRes.data || [])
    setLoading(false)
  }

  const vatOut = invoices.reduce((s, i) => s + Number(i.vat_amount || 0), 0)
    + kpoIncome.reduce((s, e) => s + Number(e.vat_out || 0), 0)
  const vatIn = receipts.reduce((s, r) => s + Number(r.vat_amount || 0), 0)
    + kpoExpenses.reduce((s, e) => s + Number(e.vat_in || 0), 0)
  const vatDue = vatOut - vatIn
  const isRefund = vatDue < 0

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
          <h1 className="font-semibold text-gray-900 mt-0.5">DDV obračun</h1>
        </div>
        <div className="flex items-center gap-2">
          <select value={quarter} onChange={e => setQuarter(Number(e.target.value))}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
            {[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
            {[now.getFullYear(), now.getFullYear()-1, now.getFullYear()-2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">

        {!org?.vat_registered ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8">
            <div className="text-center mb-6">
              <div className="text-4xl mb-4">ℹ️</div>
              <h3 className="font-semibold text-gray-900 mb-2">Niste DDV zavezanec</h3>
              <p className="text-gray-500 text-sm">DDV obračun velja samo za DDV zavezance.</p>
            </div>

            {/* DODANO (20.9.2026): drseči 12-mesečni promet proti zakonski meji.
                Registracija ni samodejna - je aktivno dejanje pri FURS. */}
            {rollingRevenue !== null && (() => {
              const delez = Math.min(100, Math.round((rollingRevenue / VAT_REGISTRATION_THRESHOLD) * 100))
              const presezen = rollingRevenue >= VAT_REGISTRATION_THRESHOLD
              const blizu = !presezen && rollingRevenue >= VAT_REGISTRATION_THRESHOLD * 0.8
              return (
                <div className={`rounded-xl p-4 border ${presezen ? 'bg-red-50 border-red-100' : blizu ? 'bg-orange-50 border-orange-100' : 'bg-gray-50 border-gray-100'}`}>
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-xs font-medium text-gray-600">Promet zadnjih 12 mesecev</span>
                    <span className="text-sm font-semibold text-gray-900">€{formatEurNumber(rollingRevenue)} / €{formatEurNumber(VAT_REGISTRATION_THRESHOLD)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-200 overflow-hidden mb-3">
                    <div
                      className={`h-full rounded-full ${presezen ? 'bg-red-500' : blizu ? 'bg-orange-400' : 'bg-gray-400'}`}
                      style={{ width: `${delez}%` }}
                    />
                  </div>
                  {presezen ? (
                    <p className="text-xs text-red-700 leading-relaxed">
                      Promet je presegel 60.000 € v zadnjih 12 mesecih — po zakonu ste dolžni se registrirati za DDV pri FURS
                      (eDavki → Vstop v sistem DDV). Sami ne obračunavajte DDV, dokler vam FURS ne dodeli ID za DDV — šele
                      takrat v Nastavitvah vklopite &quot;DDV zavezanec&quot;.
                    </p>
                  ) : blizu ? (
                    <p className="text-xs text-orange-700 leading-relaxed">
                      Bližate se zakonski meji 60.000 €. Dobro je začeti spremljati promet in se pozanimati o postopku
                      registracije, da vas prag ne preseneti.
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Ko promet zadnjih 12 mesecev preseže 60.000 €, ste po zakonu dolžni se registrirati za DDV.
                    </p>
                  )}
                </div>
              )
            })()}
          </div>
        ) : (
          <>
            {/* Rok opomnik */}
            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-6 flex justify-between items-center">
              <div>
                <div className="font-medium text-orange-800 text-sm">Q{quarter} {year} — rok oddaje</div>
                <div className="text-orange-600 text-xs mt-0.5">{QUARTER_LABELS[quarter]} {quarter === 4 ? year + 1 : year}</div>
              </div>
              <div className="text-orange-500 text-xs font-medium">DDV-O obrazec</div>
            </div>

            {/* Izračun */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
              <h3 className="font-medium text-gray-900 mb-4">Q{quarter} {year} — izračun</h3>
              {loading ? (
                <p className="text-gray-400 text-sm text-center py-4">Nalagam...</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-sm text-gray-600">DDV izhod (od prodaj)</span>
                    <span className="font-semibold text-red-500">€{formatEurNumber(vatOut)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-sm text-gray-600">DDV vhod (od nakupov)</span>
                    <span className="font-semibold text-green-600">−€{formatEurNumber(vatIn)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 bg-gray-50 rounded-xl px-3">
                    <span className="font-medium text-gray-900">
                      {isRefund ? 'FURS vam vrne' : 'Za plačilo FURS'}
                    </span>
                    <span className={`text-xl font-semibold ${isRefund ? 'text-green-600' : 'text-gray-900'}`}>
                      €{formatEurNumber(Math.abs(vatDue))}
                    </span>
                  </div>
                  {isRefund && (
                    <p className="text-xs text-green-700 bg-green-50 rounded-lg p-2">
                      Vhodni DDV presega izhodnega — v tem obdobju ste upravičeni do vračila.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* FURS podatki — samo če je za plačilo */}
            {!isRefund && vatDue > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
                <h3 className="font-medium text-gray-900 mb-4">Plačilni podatki FURS</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">IBAN</span>
                    <span className="font-mono text-xs">SI56 0110 0888 1000 030</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Sklic</span>
                    <span className="font-mono text-xs">SI19 {org?.tax_number} DDV{String(year).slice(-2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Namen</span>
                    <span className="text-xs">DDV obračun Q{quarter}/{year}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Znesek</span>
                    <span className="font-semibold">€{formatEurNumber(vatDue)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Izdani računi */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
              <h3 className="font-medium text-gray-900 mb-4">Izdani računi — Q{quarter} {year}</h3>
              {invoices.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">Ni računov v tem kvartalu</p>
              ) : (
                invoices.map((inv, i) => (
                  <div key={inv.id} className={`flex justify-between items-center py-2 ${i < invoices.length-1 ? 'border-b border-gray-50' : ''}`}>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{inv.client_name}</div>
                      <div className="text-xs text-gray-500">#{inv.invoice_number} · {new Date(inv.issue_date).toLocaleDateString('sl-SI')}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">€{formatEurNumber(Number(inv.amount_total || 0))}</div>
                      <div className="text-xs text-orange-500">DDV: €{formatEurNumber(Number(inv.vat_amount || 0))}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Prejeti računi (vhodni DDV) */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="font-medium text-gray-900 mb-4">Prejeti računi (vhodni DDV) — Q{quarter} {year}</h3>
              {receipts.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">Ni prejetih računov v tem kvartalu</p>
              ) : (
                receipts.map((r, i) => (
                  <div key={r.id} className={`flex justify-between items-center py-2 ${i < receipts.length-1 ? 'border-b border-gray-50' : ''}`}>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{r.vendor}</div>
                      <div className="text-xs text-gray-500">{r.category} · {(r.receipt_date ? (r.receipt_date ? (r.receipt_date ? new Date(r.receipt_date).toLocaleDateString('sl-SI') : '—') : '—') : '—')}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">€{formatEurNumber(Number(r.amount_total || 0))}</div>
                      <div className="text-xs text-green-600">DDV: €{formatEurNumber(Number(r.vat_amount || 0))}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
    </AppLayout>
  )
}
