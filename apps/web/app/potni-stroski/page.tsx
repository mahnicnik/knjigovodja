'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'

// Neobdavčeni zneski 2026 — POPRAVLJENO 30.7.2026 (audit)
// Vir: Uredba o davčni obravnavi povračil stroškov v zvezi z delom
const RATES = {
  km: 0.43,           // €/km — SLUŽBENA POT (prej napačno 0,21 = prevoz na delo)
  // Dnevnica Slovenija je odvisna od TRAJANJA odsotnosti (prej ena vrednost 18,00):
  daily_domestic_6_8: 9.69,    // 6–8 ur
  daily_domestic_8_12: 13.88,  // 8–12 ur
  daily_domestic_12: 27.81,    // nad 12 ur
  // ⚠️ Dnevnica za tujino je ODVISNA OD DRŽAVE (Uredba ima tabelo po
  // državah). Ta enotna vrednost je poenostavitev — za natančen obračun
  // preveri znesek za konkretno državo.
  daily_foreign: 50.00,
  // ⚠️ Nočnina se navadno povrne po DEJANSKEM računu, ne po pavšalu.
  accommodation_max: 70.00,
  meal_domestic: 7.96,     // malica — neobdavčena meja 2026 (prej 6,12)
}

const EXPENSE_TYPES = [
  { value: 'km', label: 'Kilometrina', unit: 'km' },
  { value: 'daily_domestic_12', label: 'Dnevnica SLO — nad 12 ur', unit: 'dan' },
  { value: 'daily_domestic_8_12', label: 'Dnevnica SLO — 8 do 12 ur', unit: 'dan' },
  { value: 'daily_domestic_6_8', label: 'Dnevnica SLO — 6 do 8 ur', unit: 'dan' },
  { value: 'daily_foreign', label: 'Dnevnica — tujina', unit: 'dan' },
  { value: 'accommodation', label: 'Nočnina', unit: 'noč' },
  { value: 'meal', label: 'Malica', unit: 'dan' },
  { value: 'parking', label: 'Parkirnina', unit: 'eur' },
  { value: 'toll', label: 'Cestnina / vinjeta', unit: 'eur' },
  { value: 'other', label: 'Drugo', unit: 'eur' },
]

export default function PotniStroskiPage() {
  const [org, setOrg] = useState<any>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    employee_id: '',
    date_from: new Date().toISOString().split('T')[0],
    date_to: new Date().toISOString().split('T')[0],
    destination: '',
    purpose: '',
    expense_type: 'km',
    quantity: '',
    amount_per_unit: '',
    receipt_amount: '',
    notes: '',
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
      const { data: emps } = await supabase
        .from('employees').select('*')
        .eq('org_id', o.id).eq('status', 'active')
      setEmployees(emps || [])
      const stored = localStorage.getItem(`potni_stroski_${o.id}`)
      // POPRAVLJENO (17.8.2026): branje iz shrambe brskalnika brez varovalke.
      // Ce se zapis pokvari (prekinjena seja, sprememba oblike, rocni poseg),
      // razclenjevanje vrze napako in stran se sploh ne nalozi - uporabnik
      // obtici na beli strani brez izhoda. Zdaj se pokvarjen zapis preprosto
      // preskoci.
      if (stored) { try { setEntries(JSON.parse(stored)) } catch { /* pokvarjen zapis - preskoci */ } }
    }
    setLoading(false)
  }

  function saveEntries(e: any[]) {
    if (!org) return
    setEntries(e)
    localStorage.setItem(`potni_stroski_${org.id}`, JSON.stringify(e))
  }

  const expType = EXPENSE_TYPES.find(e => e.value === form.expense_type)!

  // Izračun neobdavčenega zneska
  function calcAmount(type: string, qty: number, receiptAmt: number): number {
    switch (type) {
      case 'km': return Math.round(qty * RATES.km * 100) / 100
      case 'daily_domestic_12': return Math.round(qty * RATES.daily_domestic_12 * 100) / 100
      case 'daily_domestic_8_12': return Math.round(qty * RATES.daily_domestic_8_12 * 100) / 100
      case 'daily_domestic_6_8': return Math.round(qty * RATES.daily_domestic_6_8 * 100) / 100
      case 'daily_foreign': return Math.round(qty * RATES.daily_foreign * 100) / 100
      case 'accommodation': return Math.min(receiptAmt, RATES.accommodation_max * qty)
      case 'meal': return Math.round(qty * RATES.meal_domestic * 100) / 100
      default: return receiptAmt
    }
  }

  const qty = parseFloat(form.quantity) || 0
  const receiptAmt = parseFloat(form.receipt_amount) || 0
  const calculatedAmount = calcAmount(form.expense_type, qty, receiptAmt)

  async function handleSave() {
    if (!form.employee_id || !form.destination) return
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)

    const emp = employees.find(e => e.id === form.employee_id)
    const entry = {
      id: Date.now().toString(),
      employee_id: form.employee_id,
      employee_name: emp?.full_name || '',
      date_from: form.date_from,
      date_to: form.date_to,
      destination: form.destination,
      purpose: form.purpose,
      expense_type: form.expense_type,
      expense_label: expType.label,
      quantity: qty,
      unit: expType.unit,
      receipt_amount: receiptAmt,
      amount: calculatedAmount,
      notes: form.notes,
    }

    // Vpiši v KPO
    // POPRAVLJENO (16.8.2026): prej brez preverbe napake - vnos v davcno evidenco
    // se ni shranil, uporabnik pa je videl potrditev.
    const { error: potErr } = await supabase.from('kpo_entries').insert({
      org_id: org.id,
      entry_date: form.date_from,
      description: `Potni stroški ${emp?.full_name} — ${form.destination} (${expType.label})`,
      entry_type: 'expense',
      income: 0,
      expense: calculatedAmount,
      vat_in: 0,
      vat_out: 0,
      category: 'Transport',
    })
    if (potErr) { alert('Potnega stroška ni bilo mogoče poknjižiti: ' + potErr.message); return }

    saveEntries([entry, ...entries])
    setForm({
      employee_id: form.employee_id,
      date_from: new Date().toISOString().split('T')[0],
      date_to: new Date().toISOString().split('T')[0],
      destination: '', purpose: '',
      expense_type: 'km', quantity: '',
      amount_per_unit: '', receipt_amount: '', notes: '',
    })
    setShowForm(false)
    setSaving(false)
  }

  function downloadPotniNalog(empId: string) {
    const emp = employees.find(e => e.id === empId)
    const empEntries = entries.filter(e => e.employee_id === empId)
    if (!emp || empEntries.length === 0) return

    const total = empEntries.reduce((s, e) => s + e.amount, 0)

    const html = `<!DOCTYPE html>
<html lang="sl"><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;font-size:10px;color:#111;padding:20px 30px;max-width:600px;margin:0 auto}
  .header{display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #111}
  h2{font-size:14px;font-weight:bold;text-align:center;margin:12px 0;text-transform:uppercase}
  table{width:100%;border-collapse:collapse;margin:12px 0;font-size:9px}
  th{background:#111;color:white;padding:5px 8px;text-align:left}
  th.r{text-align:right}
  td{padding:4px 8px;border-bottom:1px solid #f0f0f0}
  td.r{text-align:right}
  .total{background:#f5f5f5;font-weight:bold}
  .sign{display:flex;justify-content:space-between;margin-top:30px}
  .sign-line{border-top:1px solid #111;width:200px;padding-top:4px;font-size:9px;color:#666}
</style></head><body>
<div class="header">
  <div><strong>${org.name}</strong><br><span style="color:#666;font-size:9px">${org.address}, ${org.city}<br>Davčna: ${org.tax_number}</span></div>
  <div style="text-align:right;font-size:9px;color:#666">Potni stroški<br>${new Date().toLocaleDateString('sl-SI')}</div>
</div>
<h2>Povračilo potnih stroškov</h2>
<table>
  <tr style="background:#f9f9f9"><td><strong>Delavec:</strong></td><td>${emp.full_name}</td><td><strong>Davčna:</strong></td><td>${emp.tax_number || '—'}</td></tr>
</table>
<table>
  <thead><tr><th>Datum</th><th>Destinacija</th><th>Vrsta stroška</th><th class="r">Kol.</th><th class="r">Znesek</th></tr></thead>
  <tbody>
    ${empEntries.map(e => `
      <tr>
        <td>${new Date(e.date_from).toLocaleDateString('sl-SI')}</td>
        <td>${e.destination}</td>
        <td>${e.expense_label}</td>
        <td class="r">${e.quantity} ${e.unit}</td>
        <td class="r">€${e.amount.toFixed(2)}</td>
      </tr>
    `).join('')}
    <tr class="total"><td colspan="4">SKUPAJ ZA POVRAČILO</td><td class="r">€${total.toFixed(2)}</td></tr>
  </tbody>
</table>
<div class="sign">
  <div><div class="sign-line">${org.name}</div><div>Delodajalec</div></div>
  <div><div class="sign-line">${emp.full_name}</div><div>Delavec</div></div>
</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
  }

  const totalAll = entries.reduce((s, e) => s + e.amount, 0)

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
          <h1 className="font-semibold text-gray-900 mt-0.5">Potni stroški zaposlenih</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
          + Dodaj strošek
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Info */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-6">
          <div className="font-medium text-blue-800 text-sm mb-2">💡 Neobdavčeni zneski 2026</div>
          <div className="grid grid-cols-3 gap-3 text-xs text-blue-700">
            <div><strong>Kilometrina (službena pot):</strong> €{RATES.km}/km</div>
            <div><strong>Dnevnica SLO:</strong> €{RATES.daily_domestic_12} (nad 12h) · €{RATES.daily_domestic_8_12} (8–12h) · €{RATES.daily_domestic_6_8} (6–8h)</div>
            <div><strong>Dnevnica tujina:</strong> €{RATES.daily_foreign}/dan</div>
            <div><strong>Nočnina max:</strong> €{RATES.accommodation_max}/noč</div>
            <div><strong>Malica:</strong> €{RATES.meal_domestic}/dan</div>
            <div><strong>Parkirnina:</strong> po računu</div>
          </div>
        </div>

        {employees.length === 0 && (
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-6">
            <div className="text-orange-700 text-sm">
              Najprej dodajte zaposlenega v <Link href="/place" className="underline font-medium">Plače</Link>.
            </div>
          </div>
        )}

        {/* Forma */}
        {showForm && employees.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-900 p-6 mb-6">
            <h3 className="font-medium text-gray-900 mb-4">Nov potni strošek</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Zaposleni *</label>
                <select value={form.employee_id}
                  onChange={e => setForm({...form, employee_id: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
                  <option value="">Izberite zaposlenega</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Vrsta stroška</label>
                <select value={form.expense_type}
                  onChange={e => setForm({...form, expense_type: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
                  {EXPENSE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Datum od</label>
                <input type="date" value={form.date_from}
                  onChange={e => setForm({...form, date_from: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Datum do</label>
                <input type="date" value={form.date_to}
                  onChange={e => setForm({...form, date_to: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Destinacija *</label>
                <input value={form.destination}
                  onChange={e => setForm({...form, destination: e.target.value})}
                  placeholder="npr. Maribor, München..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Namen</label>
                <input value={form.purpose}
                  onChange={e => setForm({...form, purpose: e.target.value})}
                  placeholder="npr. sestanek s stranko"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  Količina ({expType.unit})
                </label>
                <input type="number" value={form.quantity}
                  onChange={e => setForm({...form, quantity: e.target.value})}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              {['accommodation', 'parking', 'toll', 'other'].includes(form.expense_type) && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Znesek po računu (€)</label>
                  <input type="number" value={form.receipt_amount}
                    onChange={e => setForm({...form, receipt_amount: e.target.value})}
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              )}
            </div>

            {qty > 0 && (
              <div className="bg-gray-50 rounded-xl p-3 mb-4 flex gap-6 text-sm">
                <div>
                  <span className="text-gray-500">Neobdavčeni znesek: </span>
                  <span className="font-semibold text-green-600">€{calculatedAmount.toFixed(2)}</span>
                </div>
                {form.expense_type === 'km' && (
                  <div className="text-gray-400 text-xs">
                    {qty} km × €{RATES.km} = €{calculatedAmount.toFixed(2)}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleSave}
                disabled={saving || !form.employee_id || !form.destination}
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

        {/* Po zaposlenih */}
        {employees.length > 0 && (
          <div className="space-y-4">
            {employees.map(emp => {
              const empEntries = entries.filter(e => e.employee_id === emp.id)
              if (empEntries.length === 0) return null
              const empTotal = empEntries.reduce((s, e) => s + e.amount, 0)

              return (
                <div key={emp.id} className="bg-white rounded-2xl border border-gray-100 p-6">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <div className="font-semibold text-gray-900">{emp.full_name}</div>
                      <div className="text-xs text-gray-500">{empEntries.length} potnih stroškov</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Za povračilo</div>
                        <div className="font-semibold text-green-600">€{empTotal.toFixed(2)}</div>
                      </div>
                      <button onClick={() => downloadPotniNalog(emp.id)}
                        className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                        📄 Potni nalog
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {empEntries.slice(0, 5).map(e => (
                      <div key={e.id} className="flex justify-between text-xs py-1 border-b border-gray-50">
                        <span className="text-gray-500">{new Date(e.date_from).toLocaleDateString('sl-SI')}</span>
                        <span className="text-gray-700 flex-1 mx-3 truncate">{e.destination} — {e.expense_label}</span>
                        <span className="font-medium">€{e.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    {empEntries.length > 5 && (
                      <div className="text-xs text-gray-400 text-center pt-1">
                        + še {empEntries.length - 5} vnosov
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {entries.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                <div className="text-4xl mb-4">✈️</div>
                <h3 className="font-semibold text-gray-900 mb-2">Še ni potnih stroškov</h3>
                <p className="text-gray-500 text-sm mb-6">Dodajte dnevnice, km, nočnine za vaše zaposlene</p>
                <button onClick={() => setShowForm(true)}
                  className="bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-medium">
                  + Dodaj strošek
                </button>
              </div>
            )}
          </div>
        )}

        {totalAll > 0 && (
          <div className="bg-gray-900 rounded-2xl p-5 mt-6 text-white">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-gray-400">Skupaj potni stroški</div>
                <div className="text-xs text-gray-500 mt-0.5">Neobdavčeno povračilo zaposlenim</div>
              </div>
              <div className="text-2xl font-semibold">€{totalAll.toFixed(2)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
    </AppLayout>
  )
}