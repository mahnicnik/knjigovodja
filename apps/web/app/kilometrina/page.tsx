'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { KM_RATE_BUSINESS as TC_KM_BUSINESS, KM_RATE_COMMUTE as TC_KM_COMMUTE } from '@/lib/tax-constants'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'

// POPRAVLJENO (30.7.2026, audit): Uredba o davčni obravnavi povračil
// stroškov določa DVE LOČENI stopnji, ki ju zakon strogo razlikuje.
// Mešanje obeh je ob inšpekciji sankcionirano.
const KM_RATE_BUSINESS = TC_KM_BUSINESS // iz lib/tax-constants.ts
const KM_RATE_COMMUTE = TC_KM_COMMUTE // iz lib/tax-constants.ts

export default function KilometrinaPage() {
  const [org, setOrg] = useState<any>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    from_location: '',
    to_location: '',
    km: '',
    purpose: '',
    return_trip: false,
    trip_type: 'business' as 'business' | 'commute',
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
      // Naloži iz KPO (kategorija Transport)
      const { data } = await supabase
        .from('kpo_entries')
        .select('*')
        .eq('org_id', o.id)
        .eq('category', 'Kilometrina')
        .order('entry_date', { ascending: false })
      setEntries(data || [])
    }
    setLoading(false)
  }

  const activeRate = form.trip_type === 'commute' ? KM_RATE_COMMUTE : KM_RATE_BUSINESS
  const totalKm = form.km ? parseFloat(form.km) * (form.return_trip ? 2 : 1) : 0
  const totalAmount = Math.round(totalKm * activeRate * 100) / 100

  async function handleSave() {
    if (!org || !form.from_location || !form.to_location || !form.km) return
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)

    const km = parseFloat(form.km) * (form.return_trip ? 2 : 1)
    const rate = form.trip_type === 'commute' ? KM_RATE_COMMUTE : KM_RATE_BUSINESS
    const typeLabel = form.trip_type === 'commute' ? 'Prevoz na delo' : 'Službena pot'
    const amount = Math.round(km * rate * 100) / 100
    const description = `${typeLabel}: ${form.from_location} → ${form.to_location}${form.return_trip ? ' (povratno)' : ''} — ${km} km — ${form.purpose}`

    // Vpiši v KPO kot strošek
    // POPRAVLJENO (16.8.2026): prej brez preverbe napake - vnos v davcno evidenco
    // se ni shranil, uporabnik pa je videl potrditev.
    const { error: kmErr } = await supabase.from('kpo_entries').insert({
      org_id: org.id,
      entry_date: form.date,
      description,
      entry_type: 'expense',
      income: 0,
      expense: amount,
      vat_in: 0,
      vat_out: 0,
      category: 'Kilometrina',
      notes: `${typeLabel} · ${km} km × €${rate}/km`,
    })
    if (kmErr) { alert('Kilometrine ni bilo mogoče poknjižiti: ' + kmErr.message); return }

    setForm({
      date: new Date().toISOString().split('T')[0],
      from_location: '',
      to_location: '',
      km: '',
      purpose: '',
      return_trip: false,
      trip_type: form.trip_type,
    })
    setShowForm(false)
    setSaving(false)
    load()
  }

  async function downloadPDF(entry: any) {
    const html = `<!DOCTYPE html>
<html lang="sl">
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; padding: 30px 40px; color: #111; }
  h1 { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
  .sub { color: #666; font-size: 10px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th { background: #f5f5f5; padding: 8px 10px; text-align: left; font-size: 9px; text-transform: uppercase; color: #666; }
  td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; }
  .total { font-size: 14px; font-weight: bold; text-align: right; margin-top: 12px; }
  .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 10px; color: #666; }
  .sign { border-top: 1px solid #111; width: 200px; text-align: center; padding-top: 4px; }
</style>
</head>
<body>
<h1>POTNI NALOG</h1>
<div class="sub">${org?.name} · Davčna: ${org?.tax_number}</div>

<table>
  <tr><th>Datum</th><th>Relacija</th><th>Namen</th><th>km</th><th>€/km</th><th>Skupaj</th></tr>
  <tr>
    <td>${new Date(entry.entry_date).toLocaleDateString('sl-SI')}</td>
    <td>${entry.description.split('→').slice(0,2).join('→').replace('Potni nalog: ','')}</td>
    <td>${entry.description.split('—').slice(-1)[0]?.trim() || ''}</td>
    <td>${entry.notes?.split(' km')[0] || ''}</td>
    <td>${entry.notes?.match(/€([\d.]+)\/km/)?.[1] ? '€' + entry.notes.match(/€([\d.]+)\/km/)[1] : '—'}</td>
    <td>€${Number(entry.expense).toFixed(2)}</td>
  </tr>
</table>

<div class="total">Skupaj za povračilo: €${Number(entry.expense).toFixed(2)}</div>

<div class="footer">
  <div>
    <div class="sign">${org?.name}</div>
    <div>Podpis delodajalca</div>
  </div>
  <div>
    <div class="sign">&nbsp;</div>
    <div>Podpis delavca</div>
  </div>
</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
  }

  const totalExpense = entries.reduce((s, e) => s + Number(e.expense), 0)

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
          <h1 className="font-semibold text-gray-900 mt-0.5">Kilometrina in potni nalogi</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
          + Nov potni nalog
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Info */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-6 flex justify-between items-center">
          <div>
            <div className="font-medium text-blue-800 text-sm">Kilometrina 2026</div>
            <div className="text-blue-600 text-xs mt-0.5">Službena pot €0.43/km · Prevoz na delo €0.21/km — neobdavčeno po Uredbi</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-blue-600">Skupaj letos</div>
            <div className="font-semibold text-blue-800">€{totalExpense.toFixed(2)}</div>
          </div>
        </div>

        {/* Forma */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-900 p-6 mb-6">
            <h3 className="font-medium text-gray-900 mb-4">Nov potni nalog</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Datum *</label>
                <input type="date" value={form.date}
                  onChange={e => setForm({...form, date: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Namen poti *</label>
                <input value={form.purpose}
                  onChange={e => setForm({...form, purpose: e.target.value})}
                  placeholder="npr. sestanek s stranko"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Odhod iz *</label>
                <input value={form.from_location}
                  onChange={e => setForm({...form, from_location: e.target.value})}
                  placeholder="npr. Ljubljana"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Cilj *</label>
                <input value={form.to_location}
                  onChange={e => setForm({...form, to_location: e.target.value})}
                  placeholder="npr. Maribor"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Razdalja (km, enosmerno) *</label>
                <input type="number" value={form.km}
                  onChange={e => setForm({...form, km: e.target.value})}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.return_trip}
                    onChange={e => setForm({...form, return_trip: e.target.checked})}
                    className="w-4 h-4 rounded" />
                  <span className="text-sm text-gray-700">Povratna pot</span>
                </label>
              </div>
            </div>

            {/* DODANO (30.7.2026): izbira vrste poti — zakon določa
                različni stopnji in ju strogo ločuje. */}
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-2">Vrsta poti</label>
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => setForm({...form, trip_type: 'business'})}
                  className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium border-2 ${form.trip_type === 'business' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600'}`}>
                  🚗 Službena pot — €0.43/km
                </button>
                <button type="button"
                  onClick={() => setForm({...form, trip_type: 'commute'})}
                  className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium border-2 ${form.trip_type === 'commute' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600'}`}>
                  🏠 Prevoz na delo — €0.21/km
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {form.trip_type === 'business'
                  ? 'Obisk stranke, sejem, teren, vožnja med poslovnimi enotami. Potrebuje potni nalog.'
                  : 'Dnevna vožnja med domom in stalnim delovnim mestom.'}
              </p>
            </div>

            {totalKm > 0 && (
              <div className="bg-gray-50 rounded-xl p-3 mb-4 flex gap-6 text-sm">
                <div><span className="text-gray-500">Skupaj km: </span><span className="font-semibold">{totalKm} km</span></div>
                <div><span className="text-gray-500">Znesek: </span><span className="font-semibold text-green-600">€{totalAmount.toFixed(2)}</span></div>
                <div><span className="text-gray-500">({totalKm} × €{activeRate})</span></div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleSave}
                disabled={saving || !form.from_location || !form.to_location || !form.km}
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
            <div className="text-4xl mb-4">🚗</div>
            <h3 className="font-semibold text-gray-900 mb-2">Še ni potnih nalogov</h3>
            <p className="text-gray-500 text-sm mb-6">
              Vsak km za poslovno pot si lahko povrnete €0.21 — neobdavčeno
            </p>
            <button onClick={() => setShowForm(true)}
              className="bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-medium">
              + Vnesi prvo pot
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50 border-b border-gray-100">
              <div className="col-span-2 text-xs font-medium text-gray-500">Datum</div>
              <div className="col-span-5 text-xs font-medium text-gray-500">Relacija / Namen</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Km</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Znesek</div>
              <div className="col-span-1 text-xs font-medium text-gray-500"></div>
            </div>
            {entries.map((entry, i) => (
              <div key={entry.id} className={`grid grid-cols-12 gap-2 px-6 py-3 items-center ${i < entries.length-1 ? 'border-b border-gray-50' : ''}`}>
                <div className="col-span-2 text-xs text-gray-500">
                  {new Date(entry.entry_date).toLocaleDateString('sl-SI')}
                </div>
                <div className="col-span-5 text-xs text-gray-900 truncate">{entry.description.replace('Potni nalog: ','')}</div>
                <div className="col-span-2 text-xs text-right text-gray-600">
                  {entry.notes?.split(' km')[0]} km
                </div>
                <div className="col-span-2 text-xs text-right font-medium">
                  €{Number(entry.expense).toFixed(2)}
                </div>
                <div className="col-span-1 flex justify-end">
                  <button onClick={() => downloadPDF(entry)}
                    className="text-xs text-gray-400 hover:text-gray-900 border border-gray-200 rounded-lg px-2 py-1">
                    PDF
                  </button>
                </div>
              </div>
            ))}
            <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50 border-t border-gray-200">
              <div className="col-span-7 text-xs font-medium text-gray-700">SKUPAJ</div>
              <div className="col-span-2"></div>
              <div className="col-span-2 text-xs text-right font-semibold">€{totalExpense.toFixed(2)}</div>
              <div className="col-span-1"></div>
            </div>
          </div>
        )}
      </div>
    </div>
    </AppLayout>
  )
}