'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'

const MONTHS = ['Januar','Februar','Marec','April','Maj','Junij','Julij','Avgust','September','Oktober','November','December']

export default function AvtoPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    total_km: '',
    private_km: '',
    business_km: '',
    car_value: '',
    notes: '',
  })
  const supabase = createClient()

  useEffect(() => { load() }, [])

  // POPRAVLJENO (26.7.2026, audit K4): prej localStorage - zdaj baza
  // (vehicle_usage tabela). NAMENOMA se boniteta NE knjizi samodejno v
  // KPO kot preprost strosek - boniteta je davcno dodatek k dohodku
  // lastnika (porocati na REK-1 pod vrsto dohodka 1150), ne strosek
  // podjetja - to zahteva locen, skrbnejsi pregled preden se avtomatizira.
  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
    if (member) {
      const o = (member as any).organizations
      setOrg(o)
      const { data } = await supabase
        .from('vehicle_usage')
        .select('*')
        .eq('org_id', o.id)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
      setEntries(data || [])
    }
    setLoading(false)
  }

  const totalKm = parseFloat(form.total_km) || 0
  const privateKm = parseFloat(form.private_km) || 0
  const businessKm = totalKm - privateKm
  const privatePct = totalKm > 0 ? Math.round((privateKm / totalKm) * 100) : 0
  const businessPct = 100 - privatePct

  // Boniteta za zasebno rabo: 1.5% vrednosti vozila na mesec za zasebni %
  const carValue = parseFloat(form.car_value) || 0
  const bonitetaMonthly = Math.round(carValue * 0.015 * (privatePct / 100) * 100) / 100
  const bonitetaAnnual = Math.round(bonitetaMonthly * 12 * 100) / 100

  // DDV odbitek: samo poslovni delež
  const vatDeductiblePct = businessPct

  async function handleSave() {
    if (!org || !form.total_km) return
    setSaving(true)
    const { error } = await supabase.from('vehicle_usage').insert({
      org_id: org.id,
      month: form.month,
      year: form.year,
      total_km: totalKm,
      private_km: privateKm,
      business_km: businessKm,
      private_pct: privatePct,
      business_pct: businessPct,
      car_value: carValue,
      boniteta_monthly: bonitetaMonthly,
      notes: form.notes,
    })
    if (error) {
      alert('Napaka pri shranjevanju: ' + error.message)
      setSaving(false)
      return
    }
    setShowForm(false)
    setForm({
      month: new Date().getMonth(),
      year: new Date().getFullYear(),
      total_km: '', private_km: '', business_km: '',
      car_value: '', notes: '',
    })
    setSaving(false)
    load()
  }

  async function deleteEntry(id: string) {
    if (!confirm('Izbrišete ta mesečni vnos?')) return
    await supabase.from('vehicle_usage').delete().eq('id', id)
    load()
  }

  const totalPrivateKm = entries.reduce((s, e) => s + Number(e.private_km), 0)
  const totalBusinessKm = entries.reduce((s, e) => s + Number(e.business_km), 0)
  const totalBoniteta = entries.reduce((s, e) => s + Number(e.boniteta_monthly || 0), 0)

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
          <h1 className="font-semibold text-gray-900 mt-0.5">Službeni avto — zasebna raba</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
          + Nov mesec
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">

        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-6">
          <div className="font-medium text-orange-800 text-sm mb-2">🚗 Zasebna raba službenega avta</div>
          <div className="text-orange-700 text-xs leading-relaxed">
            Če uporabljate s.p. avto tudi zasebno, morate:<br/>
            <strong>1.</strong> Voditi evidenco km (poslovno vs zasebno) — vsak mesec<br/>
            <strong>2.</strong> Obračunati boniteto: <strong>1.5% nabavne vrednosti/mesec × % zasebne rabe</strong><br/>
            <strong>3.</strong> DDV od nakupa/stroškov avta odbiti samo v poslovnem deležu<br/>
            <strong>4.</strong> Boniteto poročati na REK-1 za s.p. lastnika
          </div>
        </div>

        {/* Povzetek */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Poslovni km</div>
            <div className="text-2xl font-semibold text-green-600">{totalBusinessKm.toFixed(0)}</div>
            <div className="text-xs text-gray-400 mt-1">Davčno priznavno</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Zasebni km</div>
            <div className="text-2xl font-semibold text-orange-500">{totalPrivateKm.toFixed(0)}</div>
            <div className="text-xs text-gray-400 mt-1">Osnova za boniteto</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-500 mb-1">Skupna boniteta</div>
            <div className="text-2xl font-semibold text-red-500">€{totalBoniteta.toFixed(2)}</div>
            <div className="text-xs text-gray-400 mt-1">Poročati na REK-1</div>
          </div>
        </div>

        {/* Forma */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-900 p-6 mb-6">
            <h3 className="font-medium text-gray-900 mb-4">Evidenca za mesec</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Mesec</label>
                <select value={form.month}
                  onChange={e => setForm({...form, month: parseInt(e.target.value)})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
                  {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Leto</label>
                <select value={form.year}
                  onChange={e => setForm({...form, year: parseInt(e.target.value)})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
                  {[2024,2025,2026,2027].map(y => <option key={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Skupaj prevoženi km</label>
                <input type="number" value={form.total_km}
                  onChange={e => setForm({...form, total_km: e.target.value})}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Zasebni km</label>
                <input type="number" value={form.private_km}
                  onChange={e => setForm({...form, private_km: e.target.value})}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Nabavna vrednost avta (€)</label>
                <input type="number" value={form.car_value}
                  onChange={e => setForm({...form, car_value: e.target.value})}
                  placeholder="npr. 25000"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Opomba</label>
                <input value={form.notes}
                  onChange={e => setForm({...form, notes: e.target.value})}
                  placeholder="npr. dopust, vikendi..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>

            {/* Predogled */}
            {totalKm > 0 && (
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <div className="grid grid-cols-4 gap-4 text-center text-sm">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Poslovni km</div>
                    <div className="font-semibold text-green-600">{businessKm.toFixed(0)} km ({businessPct}%)</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Zasebni km</div>
                    <div className="font-semibold text-orange-500">{privateKm.toFixed(0)} km ({privatePct}%)</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Boniteta/mes</div>
                    <div className="font-semibold text-red-500">€{bonitetaMonthly.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">DDV odbitek</div>
                    <div className="font-semibold">{vatDeductiblePct}%</div>
                  </div>
                </div>
                {carValue > 0 && (
                  <div className="mt-3 text-xs text-gray-600 bg-white rounded-lg p-2">
                    Boniteta = €{carValue.toFixed(0)} × 1.5% × {privatePct}% = €{bonitetaMonthly.toFixed(2)}/mes
                    (letno: €{bonitetaAnnual.toFixed(2)})
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleSave}
                disabled={saving || !form.total_km}
                className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-40">
                {saving ? 'Shranjujem...' : 'Shrani evidenco'}
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
            <h3 className="font-semibold text-gray-900 mb-2">Še ni evidence</h3>
            <p className="text-gray-500 text-sm mb-6">
              Vodite mesečno evidenco km za pravilno obračunavanje bonitete
            </p>
            <button onClick={() => setShowForm(true)}
              className="bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-medium">
              + Začni evidenco
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50 border-b border-gray-100">
              <div className="col-span-2 text-xs font-medium text-gray-500">Mesec</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Skupaj km</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Poslovni</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Zasebni</div>
              <div className="col-span-1 text-xs font-medium text-gray-500 text-right">% zasebno</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Boniteta</div>
              <div className="col-span-1"></div>
            </div>
            {entries.map((e) => (
              <div key={e.id} className="grid grid-cols-12 gap-2 px-6 py-3 items-center border-b border-gray-50">
                <div className="col-span-2 text-xs font-medium text-gray-900">
                  {MONTHS[e.month]} {e.year}
                </div>
                <div className="col-span-2 text-xs text-right text-gray-600">{e.total_km} km</div>
                <div className="col-span-2 text-xs text-right text-green-600">{e.business_km} km</div>
                <div className="col-span-2 text-xs text-right text-orange-500">{e.private_km} km</div>
                <div className="col-span-1 text-xs text-right text-gray-600">{e.private_pct}%</div>
                <div className="col-span-2 text-xs text-right font-medium text-red-500">€{Number(e.boniteta_monthly || 0).toFixed(2)}</div>
                <div className="col-span-1 flex justify-end">
                  <button onClick={() => deleteEntry(e.id)}
                    className="text-xs text-red-400 hover:text-red-600">✕</button>
                </div>
              </div>
            ))}
            <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50 border-t border-gray-200">
              <div className="col-span-2 text-xs font-medium text-gray-700">SKUPAJ</div>
              <div className="col-span-2 text-xs text-right font-semibold">
                {(entries.reduce((s,e) => s+Number(e.total_km), 0)).toFixed(0)} km
              </div>
              <div className="col-span-2 text-xs text-right font-semibold text-green-600">
                {totalBusinessKm.toFixed(0)} km
              </div>
              <div className="col-span-2 text-xs text-right font-semibold text-orange-500">
                {totalPrivateKm.toFixed(0)} km
              </div>
              <div className="col-span-1"></div>
              <div className="col-span-2 text-xs text-right font-semibold text-red-500">
                €{totalBoniteta.toFixed(2)}
              </div>
              <div className="col-span-1"></div>
            </div>
          </div>
        )}

        {/* Navodilo za REK-1 */}
        {totalBoniteta > 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mt-6">
            <div className="font-medium text-blue-800 text-sm mb-1">📋 Boniteta na REK-1</div>
            <div className="text-blue-700 text-xs leading-relaxed">
              Skupno boniteto <strong>€{totalBoniteta.toFixed(2)}</strong> morate vpisati v REK-1
              obrazec pod vrsto dohodka <strong>1150 — Boniteta</strong>.
              Boniteta poveča davčno osnovo in se obdavči kot dohodek iz delovnega razmerja.
            </div>
          </div>
        )}
      </div>
    </div>
    </AppLayout>
  )
}
