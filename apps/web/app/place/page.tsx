'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

const EE = { piz: 0.1550, zzzs: 0.0636, injury: 0.0014, unemployment: 0.0014 }
const ER = { piz: 0.0885, zzzs: 0.0656, injury: 0.0053, unemployment: 0.0014, parental: 0.0010 }
const GENERAL_RELIEF_MONTHLY = 5000 / 12
const MIN_WAGE = 1253.90
const BRACKETS = [
  { upTo: 8755, rate: 0.16 }, { upTo: 18488, rate: 0.26 },
  { upTo: 70907, rate: 0.33 }, { upTo: 250000, rate: 0.39 },
  { upTo: Infinity, rate: 0.50 },
]

function r(v: number) { return Math.round(v * 100) / 100 }

function calcPayroll(grossSalary: number, dependents: number = 0, extras: {
  overtime?: number
  nightBonus?: number
  sundayBonus?: number
  holidayBonus?: number
  travelAllowance?: number
  mealAllowance?: number
} = {}) {
  const overtimeAmt = r(grossSalary / 174 * 1.3 * (extras.overtime || 0))
  const nightAmt = r(grossSalary / 174 * 0.3 * (extras.nightBonus || 0))
  const sundayAmt = r(grossSalary / 174 * 0.5 * (extras.sundayBonus || 0))
  const holidayAmt = r(grossSalary / 174 * 1.0 * (extras.holidayBonus || 0))
  const taxableGross = grossSalary + overtimeAmt + nightAmt + sundayAmt + holidayAmt
  const travelAmt = r((extras.travelAllowance || 0) * 21 * 0.21)
  const mealAmt = r((extras.mealAllowance || 0) * 0.0)

  const ee_piz = r(taxableGross * EE.piz)
  const ee_zzzs = r(taxableGross * EE.zzzs)
  const ee_injury = r(taxableGross * EE.injury)
  const ee_unemployment = r(taxableGross * EE.unemployment)
  const ee_total = r(ee_piz + ee_zzzs + ee_injury + ee_unemployment)

  const base = taxableGross - ee_total
  const depRelief = dependents === 0 ? 0 : dependents === 1 ? 2697/12 : dependents === 2 ? 4120/12 : 7780/12
  const taxableBase = Math.max(0, base - GENERAL_RELIEF_MONTHLY - depRelief)
  let tax = 0, prev = 0
  const annualBase = taxableBase * 12
  for (const b of BRACKETS) {
    if (annualBase <= prev) break
    const t = Math.min(annualBase, b.upTo === Infinity ? annualBase : b.upTo) - prev
    tax += t * b.rate
    prev = b.upTo === Infinity ? annualBase : b.upTo
    if (b.upTo === Infinity) break
  }
  const incomeTax = r(tax / 12)
  const netSalary = r(taxableGross - ee_total - incomeTax + travelAmt)
  const er_piz = r(taxableGross * ER.piz)
  const er_zzzs = r(taxableGross * ER.zzzs)
  const er_injury = r(taxableGross * ER.injury)
  const er_unemployment = r(taxableGross * ER.unemployment)
  const er_parental = r(taxableGross * ER.parental)
  const er_total = r(er_piz + er_zzzs + er_injury + er_unemployment + er_parental)

  return {
    baseSalary: grossSalary,
    overtimeAmt, nightAmt, sundayAmt, holidayAmt,
    taxableGross, travelAmt,
    ee_piz, ee_zzzs, ee_injury, ee_unemployment, ee_total,
    incomeTax, netSalary,
    er_piz, er_zzzs, er_injury, er_unemployment, er_parental, er_total,
    totalCost: r(taxableGross + er_total),
    totalFurs: r(ee_total + incomeTax + er_total),
  }
}

const MONTHS = ['Januar','Februar','Marec','April','Maj','Junij','Julij','Avgust','September','Oktober','November','December']

export default function PlacePage() {
  const [org, setOrg] = useState<any>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showCalc, setShowCalc] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [extras, setExtras] = useState<Record<string, any>>({})

  const [calcGross, setCalcGross] = useState('1800')
  const [calcDeps, setCalcDeps] = useState(0)
  const [calcExtras, setCalcExtras] = useState({
    overtime: 0, nightBonus: 0, sundayBonus: 0,
    holidayBonus: 0, travelAllowance: 0, mealAllowance: 0,
  })

  const [form, setForm] = useState({
    full_name: '', tax_number: '', iban: '',
    gross_salary: '', employment_type: 'full_time',
    start_date: new Date().toISOString().split('T')[0],
    dependents: 0,
  })

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
      const { data } = await supabase.from('employees').select('*')
        .eq('org_id', o.id).eq('status', 'active')
      setEmployees(data || [])
    }
    setLoading(false)
  }

  async function handleAddEmployee() {
    if (!org || !form.full_name || !form.gross_salary) return
    setSaving(true)
    await supabase.from('employees').insert({
      org_id: org.id,
      full_name: form.full_name,
      tax_number: form.tax_number,
      iban: form.iban,
      gross_salary: parseFloat(form.gross_salary),
      employment_type: form.employment_type,
      start_date: form.start_date,
      dependents: form.dependents,
      status: 'active',
    })
    setForm({ full_name: '', tax_number: '', iban: '', gross_salary: '', employment_type: 'full_time', start_date: new Date().toISOString().split('T')[0], dependents: 0 })
    setShowForm(false)
    setSaving(false)
    load()
  }

  function getExtras(empId: string) {
    return extras[empId] || { overtime: 0, nightBonus: 0, sundayBonus: 0, holidayBonus: 0, travelAllowance: 0, mealAllowance: 0 }
  }

  function setEmpExtras(empId: string, field: string, value: number) {
    setExtras((prev: any) => ({ ...prev, [empId]: { ...getExtras(empId), [field]: value } }))
  }

  function downloadPlacilnaLista(emp: any) {
    const p = calcPayroll(Number(emp.gross_salary), emp.dependents || 0, getExtras(emp.id))
    const month = MONTHS[selectedMonth]
    const html = `<!DOCTYPE html>
<html lang="sl"><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;font-size:10px;color:#111;padding:20px 30px;max-width:580px;margin:0 auto}
  .header{display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #111}
  .company{font-size:14px;font-weight:bold}
  .title{font-size:16px;font-weight:bold;text-align:center;margin:16px 0;text-transform:uppercase;letter-spacing:1px}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
  .info-box{background:#f9f9f9;padding:10px 12px;border-radius:6px}
  .info-label{font-size:8px;color:#666;text-transform:uppercase;margin-bottom:4px}
  .info-val{font-size:11px;font-weight:500}
  table{width:100%;border-collapse:collapse;margin:12px 0}
  th{background:#111;color:white;padding:6px 10px;font-size:9px;text-align:left}
  th.r{text-align:right}
  td{padding:5px 10px;border-bottom:1px solid #f0f0f0;font-size:10px}
  td.r{text-align:right}
  .total-row td{font-weight:bold;background:#f5f5f5}
  .net-box{background:#111;color:white;padding:12px 16px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;margin:12px 0}
  .sign{margin-top:30px;display:flex;justify-content:space-between}
  .sign-line{border-top:1px solid #111;width:200px;padding-top:4px;font-size:9px;color:#666}
  .footer{margin-top:20px;font-size:8px;color:#aaa;text-align:center}
</style></head><body>
<div class="header">
  <div>
    <div class="company">${org.name}</div>
    <div style="font-size:9px;color:#666;margin-top:4px">${org.address || ''}, ${org.city || ''}<br>Davčna: ${org.tax_number}</div>
  </div>
  <div style="text-align:right;font-size:9px;color:#666">
    Plačilna lista<br>${month} ${selectedYear}
  </div>
</div>

<div class="title">Plačilna lista — ${month} ${selectedYear}</div>

<div class="info-grid">
  <div class="info-box">
    <div class="info-label">Delavec</div>
    <div class="info-val">${emp.full_name}</div>
    <div style="font-size:9px;color:#666;margin-top:2px">Davčna: ${emp.tax_number || '—'}</div>
  </div>
  <div class="info-box">
    <div class="info-label">Delodajalec</div>
    <div class="info-val">${org.name}</div>
    <div style="font-size:9px;color:#666;margin-top:2px">Davčna: ${org.tax_number}</div>
  </div>
  <div class="info-box">
    <div class="info-label">Vrsta zaposlitve</div>
    <div class="info-val">${emp.employment_type === 'full_time' ? 'Polni delovni čas' : emp.employment_type === 'part_time' ? 'Krajši delovni čas' : 'Študentsko delo'}</div>
  </div>
  <div class="info-box">
    <div class="info-label">Datum izplačila</div>
    <div class="info-val">${new Date().toLocaleDateString('sl-SI')}</div>
  </div>
</div>

<table>
  <thead><tr><th>Postavka</th><th class="r">Osnova</th><th class="r">Znesek</th></tr></thead>
  <tbody>
    <tr><td>Osnovna plača</td><td class="r">—</td><td class="r">€${p.baseSalary.toFixed(2)}</td></tr>
    ${p.overtimeAmt > 0 ? `<tr><td>Nadure (30% dodatek)</td><td class="r">${getExtras(emp.id).overtime || 0} ur</td><td class="r">€${p.overtimeAmt.toFixed(2)}</td></tr>` : ''}
    ${p.nightAmt > 0 ? `<tr><td>Nočni dodatek (30%)</td><td class="r">${getExtras(emp.id).nightBonus || 0} ur</td><td class="r">€${p.nightAmt.toFixed(2)}</td></tr>` : ''}
    ${p.sundayAmt > 0 ? `<tr><td>Nedeljski dodatek (50%)</td><td class="r">${getExtras(emp.id).sundayBonus || 0} ur</td><td class="r">€${p.sundayAmt.toFixed(2)}</td></tr>` : ''}
    ${p.holidayAmt > 0 ? `<tr><td>Praznični dodatek (100%)</td><td class="r">${getExtras(emp.id).holidayBonus || 0} ur</td><td class="r">€${p.holidayAmt.toFixed(2)}</td></tr>` : ''}
    <tr class="total-row"><td>BRUTO PLAČA</td><td class="r">—</td><td class="r">€${p.taxableGross.toFixed(2)}</td></tr>
    <tr><td style="color:#666">− ZPIZ delavec (15.50%)</td><td class="r" style="color:#666">€${p.taxableGross.toFixed(2)}</td><td class="r" style="color:#dc2626">−€${p.ee_piz.toFixed(2)}</td></tr>
    <tr><td style="color:#666">− ZZZS delavec (6.36%)</td><td class="r" style="color:#666">—</td><td class="r" style="color:#dc2626">−€${p.ee_zzzs.toFixed(2)}</td></tr>
    <tr><td style="color:#666">− Poškodbe (0.14%)</td><td class="r" style="color:#666">—</td><td class="r" style="color:#dc2626">−€${p.ee_injury.toFixed(2)}</td></tr>
    <tr><td style="color:#666">− Brezposelnost (0.14%)</td><td class="r" style="color:#666">—</td><td class="r" style="color:#dc2626">−€${p.ee_unemployment.toFixed(2)}</td></tr>
    <tr><td style="color:#666">− Akontacija dohodnine</td><td class="r" style="color:#666">—</td><td class="r" style="color:#dc2626">−€${p.incomeTax.toFixed(2)}</td></tr>
    ${p.travelAmt > 0 ? `<tr><td style="color:#16a34a">+ Potni stroški</td><td class="r" style="color:#16a34a">—</td><td class="r" style="color:#16a34a">+€${p.travelAmt.toFixed(2)}</td></tr>` : ''}
  </tbody>
</table>

<div class="net-box">
  <span style="font-size:13px">NETO IZPLAČILO</span>
  <span style="font-size:18px;font-weight:bold">€${p.netSalary.toFixed(2)}</span>
</div>

<table>
  <thead><tr><th>Prispevki delodajalca</th><th class="r">Stopnja</th><th class="r">Znesek</th></tr></thead>
  <tbody>
    <tr><td>ZPIZ delodajalec</td><td class="r">8.85%</td><td class="r">€${p.er_piz.toFixed(2)}</td></tr>
    <tr><td>ZZZS delodajalec</td><td class="r">6.56%</td><td class="r">€${p.er_zzzs.toFixed(2)}</td></tr>
    <tr><td>Poškodbe</td><td class="r">0.53%</td><td class="r">€${p.er_injury.toFixed(2)}</td></tr>
    <tr><td>Starševstvo</td><td class="r">0.10%</td><td class="r">€${p.er_parental.toFixed(2)}</td></tr>
    <tr class="total-row"><td>Skupni strošek delodajalca</td><td class="r">—</td><td class="r">€${p.totalCost.toFixed(2)}</td></tr>
  </tbody>
</table>

<div class="sign">
  <div><div class="sign-line">${org.name}</div><div style="font-size:9px;color:#666">Delodajalec</div></div>
  <div><div class="sign-line">${emp.full_name}</div><div style="font-size:9px;color:#666">Delavec</div></div>
</div>

<div class="footer">Plačilna lista je bila generirana z Knjigovodja.si · ${org.name} · ${new Date().getFullYear()}</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
  }

  const gross = parseFloat(calcGross) || 0
  const calcResult = gross >= MIN_WAGE ? calcPayroll(gross, calcDeps, calcExtras) : null

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
          <h1 className="font-semibold text-gray-900 mt-0.5">Plače in zaposleni</h1>
        </div>
        <div className="flex gap-2">
          <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
            {[2024,2025,2026,2027].map(y => <option key={y}>{y}</option>)}
          </select>
          <button onClick={() => setShowCalc(!showCalc)}
            className="border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm">
            🧮 Kalkulator
          </button>
          <Link href="/rek1" className="border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm">
            📋 REK-1
          </Link>
          <button onClick={() => setShowForm(!showForm)}
            className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
            + Dodaj zaposlenega
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Kalkulator */}
        {showCalc && (
          <div className="bg-white rounded-2xl border border-gray-900 p-6 mb-6">
            <h3 className="font-medium text-gray-900 mb-4">Kalkulator bruto → neto</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Bruto plača (€)</label>
                <input type="number" value={calcGross} onChange={e => setCalcGross(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Vzdrževani otroci</label>
                <select value={calcDeps} onChange={e => setCalcDeps(parseInt(e.target.value))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
                  <option value={0}>Brez</option>
                  <option value={1}>1 otrok</option>
                  <option value={2}>2 otroka</option>
                  <option value={3}>3+</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Nadure (št. ur)</label>
                <input type="number" value={calcExtras.overtime}
                  onChange={e => setCalcExtras({...calcExtras, overtime: parseFloat(e.target.value)||0})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Nočno delo (ur)</label>
                <input type="number" value={calcExtras.nightBonus}
                  onChange={e => setCalcExtras({...calcExtras, nightBonus: parseFloat(e.target.value)||0})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Nedeljsko delo (ur)</label>
                <input type="number" value={calcExtras.sundayBonus}
                  onChange={e => setCalcExtras({...calcExtras, sundayBonus: parseFloat(e.target.value)||0})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Praznično delo (ur)</label>
                <input type="number" value={calcExtras.holidayBonus}
                  onChange={e => setCalcExtras({...calcExtras, holidayBonus: parseFloat(e.target.value)||0})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Prevoz (dni)</label>
                <input type="number" value={calcExtras.travelAllowance}
                  onChange={e => setCalcExtras({...calcExtras, travelAllowance: parseFloat(e.target.value)||0})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none" />
              </div>
            </div>

            {calcResult && (
              <div className="bg-gray-900 rounded-xl p-4 text-white">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Delavec dobi</div>
                    <div className="text-2xl font-semibold text-green-400">€{calcResult.netSalary.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Skupaj FURS</div>
                    <div className="text-2xl font-semibold text-orange-400">€{calcResult.totalFurs.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Vaš strošek</div>
                    <div className="text-2xl font-semibold">€{calcResult.totalCost.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Forma za novega zaposlenega */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-900 p-6 mb-6">
            <h3 className="font-medium text-gray-900 mb-4">Dodaj zaposlenega</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Ime in priimek *</label>
                <input value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Davčna številka</label>
                <input value={form.tax_number} onChange={e => setForm({...form, tax_number: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Bruto plača (€) *</label>
                <input type="number" value={form.gross_salary} onChange={e => setForm({...form, gross_salary: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">IBAN delavca</label>
                <input value={form.iban} onChange={e => setForm({...form, iban: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Tip zaposlitve</label>
                <select value={form.employment_type} onChange={e => setForm({...form, employment_type: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
                  <option value="full_time">Polni delovni čas</option>
                  <option value="part_time">Skrajšan delovni čas</option>
                  <option value="student">Študentsko delo</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Vzdrževani otroci</label>
                <select value={form.dependents} onChange={e => setForm({...form, dependents: parseInt(e.target.value)})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
                  <option value={0}>Brez</option>
                  <option value={1}>1 otrok</option>
                  <option value={2}>2 otroka</option>
                  <option value={3}>3+</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleAddEmployee} disabled={saving || !form.full_name || !form.gross_salary}
                className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-40">
                {saving ? 'Shranjujem...' : 'Dodaj zaposlenega'}
              </button>
              <button onClick={() => setShowForm(false)}
                className="border border-gray-200 rounded-xl px-6 py-2.5 text-sm">Prekliči</button>
            </div>
          </div>
        )}

        {/* Regres opomnik */}
        {new Date().getMonth() >= 3 && new Date().getMonth() <= 5 && employees.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-6">
            <div className="font-medium text-yellow-800 text-sm mb-1">💰 Opomnik: Regres za letni dopust</div>
            <div className="text-yellow-700 text-xs">
              Regres mora biti izplačan do <strong>1. julija</strong>.
              Minimalni znesek = minimalna plača <strong>€{MIN_WAGE.toFixed(2)}</strong>.
              Za vsakega zaposlenega posebej.
            </div>
          </div>
        )}

        {/* Seznam zaposlenih */}
        {employees.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-4">👥</div>
            <h3 className="font-semibold text-gray-900 mb-2">Še ni zaposlenih</h3>
            <button onClick={() => setShowForm(true)}
              className="bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-medium mt-4">
              + Dodaj prvega zaposlenega
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {employees.map(emp => {
              const empExtras = getExtras(emp.id)
              const p = calcPayroll(Number(emp.gross_salary), emp.dependents || 0, empExtras)

              return (
                <div key={emp.id} className="bg-white rounded-2xl border border-gray-100 p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="font-semibold text-gray-900">{emp.full_name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {emp.employment_type === 'full_time' ? 'Polni delovni čas' : emp.employment_type === 'part_time' ? 'Skrajšan' : 'Študent'}
                        {emp.tax_number && ` · ${emp.tax_number}`}
                      </div>
                    </div>
                    <button onClick={() => downloadPlacilnaLista(emp)}
                      className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
                      📄 Plačilna lista
                    </button>
                  </div>

                  {/* Dodatki za ta mesec */}
                  <div className="bg-gray-50 rounded-xl p-4 mb-4">
                    <div className="text-xs font-medium text-gray-500 mb-3 uppercase">Dodatki za {MONTHS[selectedMonth]}</div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { key: 'overtime', label: 'Nadure (ur)', placeholder: '0' },
                        { key: 'nightBonus', label: 'Nočno delo (ur)', placeholder: '0' },
                        { key: 'sundayBonus', label: 'Nedelja (ur)', placeholder: '0' },
                        { key: 'holidayBonus', label: 'Praznik (ur)', placeholder: '0' },
                        { key: 'travelAllowance', label: 'Prevoz (dni)', placeholder: '0' },
                      ].map(field => (
                        <div key={field.key}>
                          <label className="text-xs text-gray-500 block mb-1">{field.label}</label>
                          <input type="number" min="0"
                            value={empExtras[field.key] || ''}
                            onChange={e => setEmpExtras(emp.id, field.key, parseFloat(e.target.value)||0)}
                            placeholder={field.placeholder}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Izračun */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-blue-50 rounded-xl p-3 text-center">
                      <div className="text-xs text-blue-600 mb-1">Bruto</div>
                      <div className="font-semibold text-blue-700">€{p.taxableGross.toFixed(2)}</div>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3 text-center">
                      <div className="text-xs text-green-600 mb-1">Neto plača</div>
                      <div className="font-semibold text-green-700">€{p.netSalary.toFixed(2)}</div>
                    </div>
                    <div className="bg-red-50 rounded-xl p-3 text-center">
                      <div className="text-xs text-red-600 mb-1">FURS skupaj</div>
                      <div className="font-semibold text-red-700">€{p.totalFurs.toFixed(2)}</div>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <div className="text-xs text-gray-600 mb-1">Vaš strošek</div>
                      <div className="font-semibold text-gray-900">€{p.totalCost.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              )
            })}

            {employees.length > 1 && (
              <div className="bg-gray-900 rounded-2xl p-5 text-white">
                <div className="text-sm text-gray-400 mb-3">Skupaj {MONTHS[selectedMonth]} {selectedYear}</div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Neto izplačilo</div>
                    <div className="text-xl font-semibold text-green-400">
                      €{employees.reduce((s, e) => s + calcPayroll(Number(e.gross_salary), e.dependents||0, getExtras(e.id)).netSalary, 0).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Skupaj FURS</div>
                    <div className="text-xl font-semibold text-orange-400">
                      €{employees.reduce((s, e) => s + calcPayroll(Number(e.gross_salary), e.dependents||0, getExtras(e.id)).totalFurs, 0).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Skupaj strošek</div>
                    <div className="text-xl font-semibold">
                      €{employees.reduce((s, e) => s + calcPayroll(Number(e.gross_salary), e.dependents||0, getExtras(e.id)).totalCost, 0).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}