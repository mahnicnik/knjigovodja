'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { EMPLOYEE_CONTRIBUTIONS, EMPLOYER_CONTRIBUTIONS, MANDATORY_HEALTH_CONTRIBUTION, GENERAL_RELIEF_MONTH, MIN_WAGE as TC_MIN_WAGE, INCOME_TAX_BRACKETS, REGRES_TAX_FREE_LIMIT } from '@/lib/tax-constants'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'

// POPRAVLJENO (26.7.2026): glej rek1/page.tsx za razlago (isti popravek)
const EE = { piz: EMPLOYEE_CONTRIBUTIONS.piz, zzzs: EMPLOYEE_CONTRIBUTIONS.zzzs, unemployment: EMPLOYEE_CONTRIBUTIONS.unemployment, parental: EMPLOYEE_CONTRIBUTIONS.parental, dolgotrajnaOskrba: EMPLOYEE_CONTRIBUTIONS.longTermCare } // iz lib/tax-constants.ts
const ER = { piz: EMPLOYER_CONTRIBUTIONS.piz, zzzs: EMPLOYER_CONTRIBUTIONS.zzzs, injury: EMPLOYER_CONTRIBUTIONS.injury, unemployment: EMPLOYER_CONTRIBUTIONS.unemployment, parental: EMPLOYER_CONTRIBUTIONS.parental, dolgotrajnaOskrba: EMPLOYER_CONTRIBUTIONS.longTermCare } // iz lib/tax-constants.ts
const OZP_MONTHLY = MANDATORY_HEALTH_CONTRIBUTION // iz lib/tax-constants.ts
const GENERAL_RELIEF_MONTHLY = GENERAL_RELIEF_MONTH // iz lib/tax-constants.ts
const MIN_WAGE = TC_MIN_WAGE // iz lib/tax-constants.ts
// Uradni 2026 davcni razredi (letne meje) - popravljeno 25.7.2026, prej zastareli
const BRACKETS = INCOME_TAX_BRACKETS // iz lib/tax-constants.ts

function r(v: number) { return Math.round(v * 100) / 100 }

function calcPayroll(grossSalary: number, dependents: number = 0, extras: {
  overtime?: number; nightBonus?: number; sundayBonus?: number;
  holidayBonus?: number; travelAllowance?: number; mealAllowance?: number;
} = {}) {
  const overtimeAmt = r(grossSalary / 174 * 1.3 * (extras.overtime || 0))
  const nightAmt = r(grossSalary / 174 * 0.3 * (extras.nightBonus || 0))
  const sundayAmt = r(grossSalary / 174 * 0.5 * (extras.sundayBonus || 0))
  const holidayAmt = r(grossSalary / 174 * 1.0 * (extras.holidayBonus || 0))
  const taxableGross = grossSalary + overtimeAmt + nightAmt + sundayAmt + holidayAmt
  const travelAmt = r((extras.travelAllowance || 0) * 21 * 0.21)
  const ee_piz = r(taxableGross * EE.piz)
  const ee_zzzs = r(taxableGross * EE.zzzs)
  const ee_injury = 0 // zaposlenci ne placujejo poskodb pri delu - samo delodajalec
  const ee_unemployment = r(taxableGross * EE.unemployment)
  const ee_parental = r(taxableGross * EE.parental)
  const ee_dolgotrajna = r(taxableGross * EE.dolgotrajnaOskrba)
  const ee_ozp = OZP_MONTHLY
  const ee_total = r(ee_piz + ee_zzzs + ee_injury + ee_unemployment + ee_parental + ee_dolgotrajna + ee_ozp)
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
  const er_dolgotrajna = r(taxableGross * ER.dolgotrajnaOskrba)
  const er_total = r(er_piz + er_zzzs + er_injury + er_unemployment + er_parental + er_dolgotrajna)
  return {
    baseSalary: grossSalary, overtimeAmt, nightAmt, sundayAmt, holidayAmt,
    taxableGross, travelAmt, ee_piz, ee_zzzs, ee_injury, ee_unemployment, ee_parental, ee_dolgotrajna, ee_ozp, ee_total,
    incomeTax, netSalary, er_piz, er_zzzs, er_injury, er_unemployment, er_parental, er_dolgotrajna, er_total,
    totalCost: r(taxableGross + er_total), totalFurs: r(ee_total + incomeTax + er_total),
  }
}

// Regres je neobdavčen do minimalne plače, nad tem se obdavči
// POPRAVLJENO 30.7.2026 (audit): neobdavcena meja regresa je 100%
// POVPRECNE bruto place RS (~2.606 EUR, gibljivo z objavami SURS), NE
// minimalne place. Prej je funkcija obdavcila regres, ki je neobdavcen.
const REGRES_TAXFREE_LIMIT = REGRES_TAX_FREE_LIMIT // iz lib/tax-constants.ts (⚠️ gibljivo)

function calcRegres(grossSalary: number): { amount: number; taxFree: number; taxable: number; netAmount: number } {
  const amount = Math.max(MIN_WAGE, grossSalary) // vsaj minimalna plača
  const taxFree = Math.min(amount, REGRES_TAXFREE_LIMIT)
  const taxable = Math.max(0, amount - taxFree)
  // Davek samo na obdavčljivi del (dohodnina ~27% povprečno)
  const tax = r(taxable * 0.27)
  const netAmount = r(amount - tax)
  return { amount, taxFree, taxable, netAmount }
}

const MONTHS = ['Januar','Februar','Marec','April','Maj','Junij','Julij','Avgust','September','Oktober','November','December']

export default function PlacePage() {
  const [org, setOrg] = useState<any>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showCalc, setShowCalc] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [extras, setExtras] = useState<Record<string, any>>({})
  const [regresModal, setRegresModal] = useState<any>(null)
  const [regresIzplacila, setRegresIzplacila] = useState<Record<string, any>>({})

  const [calcGross, setCalcGross] = useState('1800')
  const [calcDeps, setCalcDeps] = useState(0)
  const [calcExtras, setCalcExtras] = useState({ overtime: 0, nightBonus: 0, sundayBonus: 0, holidayBonus: 0, travelAllowance: 0, mealAllowance: 0 })

  // ── Nalaganje plačilne liste od računovodje (25.7.2026) ──
  const [showUpload, setShowUpload] = useState(false)
  const [uploadScanning, setUploadScanning] = useState(false)
  const [uploadSaving, setUploadSaving] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadBase64, setUploadBase64] = useState('')
  const [uploadParsed, setUploadParsed] = useState<any>(null)
  const [uploadEmployeeId, setUploadEmployeeId] = useState('')
  const [uploadPassword, setUploadPassword] = useState('')
  const [uploadNeedsPassword, setUploadNeedsPassword] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const [form, setForm] = useState({
    full_name: '', tax_number: '', iban: '', gross_salary: '',
    employment_type: 'full_time', start_date: new Date().toISOString().split('T')[0], dependents: 0,
    annual_leave_days: 20,
  })
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null)

  function emptyForm() {
    return { full_name: '', tax_number: '', iban: '', gross_salary: '', employment_type: 'full_time', start_date: new Date().toISOString().split('T')[0], dependents: 0, annual_leave_days: 20 }
  }

  function startEdit(emp: any) {
    setEditingEmployeeId(emp.id)
    setForm({
      full_name: emp.full_name || '', tax_number: emp.tax_number || '', iban: emp.iban || '',
      gross_salary: String(emp.gross_salary ?? ''), employment_type: emp.employment_type || 'full_time',
      start_date: emp.start_date || new Date().toISOString().split('T')[0],
      dependents: emp.dependents || 0, annual_leave_days: emp.annual_leave_days ?? 20,
    })
    setShowForm(true)
  }

  async function deleteEmployee(emp: any) {
    if (!confirm(`Izbrišem zaposlenega "${emp.full_name}"? Zgodovina plač/regresa ostane ohranjena, a se oseba ne bo več prikazovala v seznamu.`)) return
    await supabase.from('employees').update({ status: 'inactive' }).eq('id', emp.id)
    load()
  }

  const supabase = createClient()

  // Varna base64 pretvorba za vecje PDF-je (25.7.2026) - glej enak
  // popravek na /scan in /banka strani (izogne se "Maximum call stack
  // size exceeded" pri spread operatorju na velikih datotekah).
  function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)) as any)
    }
    return btoa(binary)
  }

  async function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFile(file)
    setUploadScanning(true)
    setUploadParsed(null)
    setUploadEmployeeId('')
    setUploadNeedsPassword(false)
    setUploadError('')
    try {
      const arrayBuffer = await file.arrayBuffer()
      const base64 = arrayBufferToBase64(arrayBuffer)
      setUploadBase64(base64)
      await tryParsePayslip(base64, file.type || 'application/pdf')
    } catch (err: any) {
      setUploadError('Napaka: ' + err.message)
    }
    setUploadScanning(false)
  }

  // Locena funkcija (25.7.2026), da jo lahko poklicemo ponovno z geslom,
  // ne da bi uporabnik moral znova izbrati datoteko.
  async function tryParsePayslip(base64: string, mediaType: string) {
    const res = await fetch('/api/place/parse-payslip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64: base64, mediaType }),
    })
    const data = await res.json()
    if (!res.ok || data.error) {
      setUploadError(data.error || 'Napaka pri branju plačilne liste')
      return
    }
    setUploadError('')
    setUploadParsed(data)
    const match = employees.find(emp =>
      emp.full_name?.toLowerCase().trim() === (data.employee_name || '').toLowerCase().trim()
    )
    if (match) setUploadEmployeeId(match.id)
  }


  async function savePayslipUpload() {
    if (!org || !uploadParsed) return
    setUploadSaving(true)
    const p = uploadParsed
    // KLJUCNO: employer_total_cost ("Skupaj strosek v breme podjetja") je
    // DEJANSKI strosek - ce ga AI ni zaznal, opozorimo in uporabimo bruto
    // kot skrajno rezervo (z opozorilom, da preveri rocno).
    const bookAmount = p.employer_total_cost ?? p.gross_amount
    const usedFallback = p.employer_total_cost == null

    // POPRAVLJENO (25.7.2026): prava imena stolpcev (gross_salary/
    // net_salary/income_tax, month+year namesto period_start/period_end)
    const periodDate = p.period_end ? new Date(p.period_end) : new Date()
    // Polna razclenitev (25.7.2026) - omogoca /rek1 strani uporabo RESNICNIH
    // stevilk namesto ocene kalkulatorja.
    const { error } = await supabase.from('payslips').insert({
      org_id: org.id,
      employee_id: uploadEmployeeId || null,
      employee_name_raw: p.employee_name || null,
      type: 'monthly',
      month: periodDate.getMonth() + 1,
      year: periodDate.getFullYear(),
      gross_salary: p.gross_amount,
      net_salary: p.net_amount,
      income_tax: p.tax_amount,
      income_tax_base: p.income_tax_base ?? null,
      general_relief: p.general_relief ?? null,
      dependent_relief: p.dependent_relief ?? 0,
      ee_piz: p.ee_piz ?? 0,
      ee_zzzs: p.ee_zzzs ?? 0,
      ee_unemployment: p.ee_unemployment ?? 0,
      ee_injury: p.ee_injury ?? 0,
      ee_total: p.ee_total ?? 0,
      er_piz: p.er_piz ?? 0,
      er_zzzs: p.er_zzzs ?? 0,
      er_unemployment: p.er_unemployment ?? 0,
      er_injury: p.er_injury ?? 0,
      er_parental: p.er_parental ?? 0,
      er_total: p.er_total ?? 0,
      employer_total_cost: p.employer_total_cost,
      total_cost: p.employer_total_cost ?? p.gross_amount,
      status: 'paid',
      paid_at: new Date().toISOString(),
      attachment_base64: uploadBase64,
      attachment_type: uploadFile?.type?.startsWith('image/') ? 'image' : 'pdf',
      notes: 'Naložena plačilna lista (AI branje)',
    })
    if (error) {
      alert('Napaka pri shranjevanju: ' + error.message)
      setUploadSaving(false)
      return
    }

    // Poknjizi v KPO - uporabi employer_total_cost (DEJANSKI strosek), ne
    // samo bruto placo.
    await supabase.from('kpo_entries').insert({
      org_id: org.id,
      entry_date: p.period_end,
      description: `Plača ${p.employee_name || ''} — ${p.period_start} do ${p.period_end}`,
      entry_type: 'expense',
      income: 0,
      expense: bookAmount,
      vat_in: 0,
      vat_out: 0,
      category: 'Plače',
      notes: usedFallback
        ? `Nalozena plac. lista - OPOZORILO: "Skupaj strosek v breme podjetja" ni bil zaznan, uporabljena bruto placa namesto tega - preveri rocno!`
        : `Naložena plačilna lista (skupaj strošek v breme podjetja)`,
    })

    setUploadSaving(false)
    setShowUpload(false)
    setUploadFile(null)
    setUploadBase64('')
    setUploadParsed(null)
    setUploadEmployeeId('')
    load()
  }

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
    if (member) {
      const o = (member as any).organizations
      setOrg(o)
      const { data } = await supabase.from('employees').select('*').eq('org_id', o.id).eq('status', 'active')
      setEmployees(data || [])
      // Naloži regres izplačila za ta leto (POPRAVLJENO 26.7.2026: prej
      // gte('period_start', ...) - stolpec ne obstaja, poizvedba je vracala
      // 400 in nikoli ni najsla obstojecih izplacil)
      const { data: regres } = await supabase.from('payslips')
        .select('*').eq('org_id', o.id).eq('type', 'regres')
        .eq('year', new Date().getFullYear())
      const regresMap: Record<string, any> = {}
      for (const r of regres || []) {
        regresMap[r.employee_id] = r
      }
      setRegresIzplacila(regresMap)
    }
    setLoading(false)
  }

  async function handleAddEmployee() {
    if (!org || !form.full_name || !form.gross_salary) return
    setSaving(true)
    // try/finally (26.7.2026): setSaving(false) se zdaj VEDNO izvede, tudi
    // ob napaki - prej bi napaka pustila gumb trajno onemogocen do
    // ponovnega nalaganja strani.
    try {
      const payload = {
        full_name: form.full_name, tax_number: form.tax_number,
        iban: form.iban, gross_salary: parseFloat(form.gross_salary),
        employment_type: form.employment_type, start_date: form.start_date,
        dependents: form.dependents, annual_leave_days: form.annual_leave_days,
      }
      let saveError
      if (editingEmployeeId) {
        const { error } = await supabase.from('employees').update(payload).eq('id', editingEmployeeId)
        saveError = error
      } else {
        const { error } = await supabase.from('employees').insert({ org_id: org.id, ...payload, status: 'active' })
        saveError = error
      }
      if (saveError) {
        alert('Napaka pri shranjevanju: ' + saveError.message)
        return
      }
      setForm(emptyForm())
      setEditingEmployeeId(null)
      setShowForm(false)
      load()
    } catch (err: any) {
      alert('Napaka: ' + (err.message || 'Neznana napaka'))
    } finally {
      setSaving(false)
    }
  }

  async function izplačajRegres(emp: any, amount: number) {
    if (!org) return
    const regres = calcRegres(Number(emp.gross_salary))
    // POPRAVLJENO 26.7.2026: prava imena stolpcev
    await supabase.from('payslips').insert({
      org_id: org.id,
      employee_id: emp.id,
      type: 'regres',
      month: 7,
      year: new Date().getFullYear(),
      gross_salary: regres.amount,
      net_salary: regres.netAmount,
      income_tax: r(regres.amount - regres.netAmount),
      status: 'paid',
      paid_at: new Date().toISOString(),
    })
    setRegresModal(null)
    load()
  }

  function downloadRegresLista(emp: any) {
    const regres = calcRegres(Number(emp.gross_salary))
    const year = new Date().getFullYear()
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
  .legal{background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:10px 12px;margin:12px 0;font-size:9px;color:#92400e}
  .sign{margin-top:30px;display:flex;justify-content:space-between}
  .sign-line{border-top:1px solid #111;width:200px;padding-top:4px;font-size:9px;color:#666}
  .footer{margin-top:20px;font-size:8px;color:#aaa;text-align:center}
</style></head><body>
<div class="header">
  <div>
    <div class="company">${org.name}</div>
    <div style="font-size:9px;color:#666;margin-top:4px">${org.address || ''}, ${org.city || ''}<br>Davčna: ${org.tax_number}</div>
  </div>
  <div style="text-align:right;font-size:9px;color:#666">Regres za letni dopust<br>${year}</div>
</div>

<div class="title">Regres za letni dopust ${year}</div>

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
    <div class="info-label">Datum izplačila</div>
    <div class="info-val">${new Date().toLocaleDateString('sl-SI')}</div>
  </div>
  <div class="info-box">
    <div class="info-label">Zakonski rok</div>
    <div class="info-val">1. julij ${year}</div>
  </div>
</div>

<div class="legal">
  ⚖️ Pravna podlaga: 131. člen ZDR-1 — Regres za letni dopust mora biti izplačan najkasneje do 1. julija tekočega leta. Minimalni znesek je enak minimalni plači (€${MIN_WAGE.toFixed(2)}).
</div>

<table>
  <thead><tr><th>Postavka</th><th class="r">Znesek</th><th class="r">Opomba</th></tr></thead>
  <tbody>
    <tr><td>Regres za letni dopust ${year}</td><td class="r">€${regres.amount.toFixed(2)}</td><td class="r">Bruto znesek</td></tr>
    <tr><td style="color:#16a34a">Neobdavčeni del (do min. plače)</td><td class="r" style="color:#16a34a">€${regres.taxFree.toFixed(2)}</td><td class="r" style="color:#16a34a">Neobdavčeno</td></tr>
    ${regres.taxable > 0 ? `<tr><td style="color:#666">Obdavčljivi del</td><td class="r" style="color:#666">€${regres.taxable.toFixed(2)}</td><td class="r" style="color:#666">—</td></tr>
    <tr><td style="color:#dc2626">− Dohodnina (~27%)</td><td class="r" style="color:#dc2626">−€${r(regres.taxable * 0.27).toFixed(2)}</td><td class="r" style="color:#dc2626">Akontacija</td></tr>` : ''}
  </tbody>
</table>

<div class="net-box">
  <span style="font-size:13px">NETO IZPLAČILO</span>
  <span style="font-size:18px;font-weight:bold">€${regres.netAmount.toFixed(2)}</span>
</div>

${emp.iban ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px 12px;margin:8px 0;font-size:10px">
  <strong>Nakazilo na:</strong> ${emp.iban}
</div>` : ''}

<div class="sign">
  <div><div class="sign-line">${org.name}</div><div style="font-size:9px;color:#666">Delodajalec — podpis in žig</div></div>
  <div><div class="sign-line">${emp.full_name}</div><div style="font-size:9px;color:#666">Delavec — podpis</div></div>
</div>

<div class="footer">Dokument je bil generiran z Računko · ${org.name} · ${year}</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
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
  <div><div class="company">${org.name}</div>
    <div style="font-size:9px;color:#666;margin-top:4px">${org.address || ''}, ${org.city || ''}<br>Davčna: ${org.tax_number}</div>
  </div>
  <div style="text-align:right;font-size:9px;color:#666">Plačilna lista<br>${month} ${selectedYear}</div>
</div>
<div class="title">Plačilna lista — ${month} ${selectedYear}</div>
<div class="info-grid">
  <div class="info-box"><div class="info-label">Delavec</div><div class="info-val">${emp.full_name}</div><div style="font-size:9px;color:#666;margin-top:2px">Davčna: ${emp.tax_number || '—'}</div></div>
  <div class="info-box"><div class="info-label">Delodajalec</div><div class="info-val">${org.name}</div><div style="font-size:9px;color:#666;margin-top:2px">Davčna: ${org.tax_number}</div></div>
  <div class="info-box"><div class="info-label">Vrsta zaposlitve</div><div class="info-val">${emp.employment_type === 'full_time' ? 'Polni delovni čas' : emp.employment_type === 'part_time' ? 'Krajši delovni čas' : 'Študentsko delo'}</div></div>
  <div class="info-box"><div class="info-label">Datum izplačila</div><div class="info-val">${new Date().toLocaleDateString('sl-SI')}</div></div>
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
    <tr><td style="color:#666">− Brezposelnost (0.14%)</td><td class="r" style="color:#666">—</td><td class="r" style="color:#dc2626">−€${p.ee_unemployment.toFixed(2)}</td></tr>
    <tr><td style="color:#666">− Starševsko varstvo (0.10%)</td><td class="r" style="color:#666">—</td><td class="r" style="color:#dc2626">−€${p.ee_parental.toFixed(2)}</td></tr>
    <tr><td style="color:#666">− Dolgotrajna oskrba (1.00%)</td><td class="r" style="color:#666">—</td><td class="r" style="color:#dc2626">−€${p.ee_dolgotrajna.toFixed(2)}</td></tr>
    <tr><td style="color:#666">− Obvezni zdravstveni prispevek</td><td class="r" style="color:#666">—</td><td class="r" style="color:#dc2626">−€${p.ee_ozp.toFixed(2)}</td></tr>
    <tr><td style="color:#666">− Akontacija dohodnine</td><td class="r" style="color:#666">—</td><td class="r" style="color:#dc2626">−€${p.incomeTax.toFixed(2)}</td></tr>
    ${p.travelAmt > 0 ? `<tr><td style="color:#16a34a">+ Potni stroški</td><td class="r" style="color:#16a34a">—</td><td class="r" style="color:#16a34a">+€${p.travelAmt.toFixed(2)}</td></tr>` : ''}
  </tbody>
</table>
<div class="net-box"><span style="font-size:13px">NETO IZPLAČILO</span><span style="font-size:18px;font-weight:bold">€${p.netSalary.toFixed(2)}</span></div>
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
<div class="footer">Plačilna lista je bila generirana z Računko · ${org.name} · ${new Date().getFullYear()}</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
  }

  function getExtras(empId: string) {
    return extras[empId] || { overtime: 0, nightBonus: 0, sundayBonus: 0, holidayBonus: 0, travelAllowance: 0, mealAllowance: 0 }
  }
  function setEmpExtras(empId: string, field: string, value: number) {
    setExtras((prev: any) => ({ ...prev, [empId]: { ...getExtras(empId), [field]: value } }))
  }

  const gross = parseFloat(calcGross) || 0
  const calcResult = gross >= MIN_WAGE ? calcPayroll(gross, calcDeps, calcExtras) : null
  const now = new Date()
  const daysToJuly = Math.ceil((new Date(now.getFullYear(), 6, 1).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const showRegresAlert = employees.length > 0 && daysToJuly > 0 && daysToJuly <= 60

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
          <h1 className="font-semibold text-gray-900 mt-0.5">Plače in zaposleni</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
            {[2024,2025,2026,2027].map(y => <option key={y}>{y}</option>)}
          </select>
          <button onClick={() => setShowCalc(!showCalc)} className="border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm">🧮 Kalkulator</button>
          <button onClick={() => setShowUpload(true)} className="border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm">📄 Naloži plačilno listo</button>
          <Link href="/rek1" className="border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm">📋 REK-1</Link>
          <button onClick={() => setShowForm(!showForm)} className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">+ Dodaj zaposlenega</button>
        </div>
      </div>

      {showUpload && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 className="font-medium text-gray-900 mb-1">Naloži plačilno listo</h3>
            <p className="text-gray-500 text-sm mb-4">AI bo prebral PDF od računovodje in izluščil podatke — vključno s "Skupaj strošek v breme podjetja", ki se poknjiži v KPO.</p>

            {!uploadParsed && (
              <div
                onClick={() => document.getElementById('payslip-file-input')?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-gray-300"
              >
                {uploadScanning ? (
                  <div className="text-sm text-gray-500">⟳ Berem plačilno listo...</div>
                ) : (
                  <>
                    <div className="text-3xl mb-2">📄</div>
                    <div className="bg-gray-900 text-white px-5 py-2 rounded-xl text-sm font-medium inline-block">Izberi PDF ali sliko</div>
                    <p className="text-xs text-gray-400 mt-3">Če je PDF zaščiten z geslom, naredite posnetek zaslona (Cmd+Shift+4) in naložite sliko.</p>
                  </>
                )}
                <input id="payslip-file-input" type="file" accept="application/pdf,.pdf,image/*" className="hidden" disabled={uploadScanning} onChange={handleUploadFile} />
              </div>
            )}

            {uploadError && (
              <p className="text-sm mt-3 mb-1" style={{ color: '#DC2626' }}>{uploadError}</p>
            )}

            {uploadParsed && (
              <div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Zaposleni (prebrano: {uploadParsed.employee_name || '?'})</label>
                    <select value={uploadEmployeeId} onChange={e => setUploadEmployeeId(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                      <option value="">— ni povezano —</option>
                      {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Obdobje</label>
                    <input type="text" readOnly value={`${uploadParsed.period_start || '?'} — ${uploadParsed.period_end || '?'}`} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Bruto plača (€)</label>
                    <input type="number" value={uploadParsed.gross_amount ?? ''} onChange={e => setUploadParsed({ ...uploadParsed, gross_amount: parseFloat(e.target.value) || 0 })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Neto plača (€)</label>
                    <input type="number" value={uploadParsed.net_amount ?? ''} onChange={e => setUploadParsed({ ...uploadParsed, net_amount: parseFloat(e.target.value) || 0 })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 block mb-1">
                      Skupaj strošek v breme podjetja (€) — <strong>to se poknjiži v KPO</strong>
                    </label>
                    <input
                      type="number"
                      value={uploadParsed.employer_total_cost ?? ''}
                      onChange={e => setUploadParsed({ ...uploadParsed, employer_total_cost: parseFloat(e.target.value) || null })}
                      className="w-full border rounded-xl px-3 py-2 text-sm"
                      style={{ borderColor: uploadParsed.employer_total_cost == null ? '#D97706' : '#e5e7eb' }}
                    />
                    {uploadParsed.employer_total_cost == null && (
                      <p className="text-xs mt-1" style={{ color: '#D97706' }}>⚠️ Ni zaznano na dokumentu — prosim vnesite ročno (sicer bo uporabljena bruto plača).</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setUploadParsed(null); setUploadFile(null) }} className="flex-1 border border-gray-200 text-gray-700 rounded-xl py-2.5 text-sm">← Naloži drugo</button>
                  <button onClick={savePayslipUpload} disabled={uploadSaving} className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-40">
                    {uploadSaving ? 'Shranjujem...' : 'Shrani in poknjiži'}
                  </button>
                </div>
              </div>
            )}

            {!uploadScanning && (
              <button onClick={() => { setShowUpload(false); setUploadParsed(null); setUploadFile(null) }} className="text-gray-400 text-xs mt-4 block mx-auto">Prekliči</button>
            )}
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Kalkulator */}
        {showCalc && (
          <div className="bg-white rounded-2xl border border-gray-900 p-6 mb-6">
            <h3 className="font-medium text-gray-900 mb-4">Kalkulator bruto → neto</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                { label:'Bruto plača (€)', val:calcGross, set:(v:string)=>setCalcGross(v), type:'number' },
              ].map((f,i) => (
                <div key={i}><label className="text-xs text-gray-500 block mb-1">{f.label}</label>
                  <input type={f.type} value={f.val} onChange={e=>f.set(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
              ))}
              <div><label className="text-xs text-gray-500 block mb-1">Vzdrževani otroci</label>
                <select value={calcDeps} onChange={e=>setCalcDeps(parseInt(e.target.value))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
                  <option value={0}>Brez</option><option value={1}>1 otrok</option><option value={2}>2 otroka</option><option value={3}>3+</option>
                </select></div>
              <div><label className="text-xs text-gray-500 block mb-1">Nadure (ur)</label>
                <input type="number" value={calcExtras.overtime} onChange={e=>setCalcExtras({...calcExtras,overtime:parseFloat(e.target.value)||0})} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none" /></div>
            </div>
            {calcResult && (
              <div className="bg-gray-900 rounded-xl p-4 text-white">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div><div className="text-xs text-gray-400 mb-1">Delavec dobi</div><div className="text-2xl font-semibold text-green-400">€{calcResult.netSalary.toFixed(2)}</div></div>
                  <div><div className="text-xs text-gray-400 mb-1">Skupaj FURS</div><div className="text-2xl font-semibold text-orange-400">€{calcResult.totalFurs.toFixed(2)}</div></div>
                  <div><div className="text-xs text-gray-400 mb-1">Vaš strošek</div><div className="text-2xl font-semibold">€{calcResult.totalCost.toFixed(2)}</div></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Nova zaposlitev forma */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-900 p-6 mb-6">
            <h3 className="font-medium text-gray-900 mb-4">Dodaj zaposlenega</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              {[
                { label:'Ime in priimek *', key:'full_name', type:'text' },
                { label:'Davčna številka', key:'tax_number', type:'text' },
                { label:'Bruto plača (€) *', key:'gross_salary', type:'number' },
                { label:'IBAN delavca', key:'iban', type:'text' },
              ].map(f => (
                <div key={f.key}><label className="text-xs text-gray-500 block mb-1">{f.label}</label>
                  <input type={f.type} value={(form as any)[f.key]} onChange={e=>setForm({...form,[f.key]:e.target.value})} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
              ))}
              <div><label className="text-xs text-gray-500 block mb-1">Tip zaposlitve</label>
                <select value={form.employment_type} onChange={e=>setForm({...form,employment_type:e.target.value})} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
                  <option value="full_time">Polni delovni čas</option><option value="part_time">Skrajšan delovni čas</option><option value="student">Študentsko delo</option>
                </select></div>
              <div><label className="text-xs text-gray-500 block mb-1">Vzdrževani otroci</label>
                <select value={form.dependents} onChange={e=>setForm({...form,dependents:parseInt(e.target.value)})} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
                  <option value={0}>Brez</option><option value={1}>1 otrok</option><option value={2}>2 otroka</option><option value={3}>3+</option>
                </select></div>
              <div><label className="text-xs text-gray-500 block mb-1">Letni dopust (dni)</label>
                <input type="number" min={20} value={form.annual_leave_days} onChange={e=>setForm({...form,annual_leave_days:parseInt(e.target.value)||20})} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none" /></div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleAddEmployee} disabled={saving||!form.full_name||!form.gross_salary} className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-40">
                {saving ? 'Shranjujem...' : 'Dodaj zaposlenega'}
              </button>
              <button onClick={() => { setShowForm(false); setEditingEmployeeId(null); setForm(emptyForm()) }} className="border border-gray-200 rounded-xl px-6 py-2.5 text-sm">Prekliči</button>
            </div>
          </div>
        )}

        {/* Regres opomnik */}
        {showRegresAlert && (
          <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:'12px', padding:'14px 18px', marginBottom:'20px', display:'flex', alignItems:'flex-start', gap:'12px' }}>
            <div style={{ fontSize:'20px', flexShrink:0 }}>💰</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'13px', fontWeight:'500', color:'#92400E', marginBottom:'4px' }}>
                Regres za letni dopust — rok čez <strong>{daysToJuly} dni</strong> (1. julij)
              </div>
              <div style={{ fontSize:'12px', color:'#92400E' }}>
                Minimalni znesek: <strong>€{MIN_WAGE.toFixed(2)}</strong> za vsakega zaposlenega.
                {Object.keys(regresIzplacila).length > 0 && ` Izplačano: ${Object.keys(regresIzplacila).length}/${employees.length} zaposlenih.`}
              </div>
            </div>
          </div>
        )}

        {/* Zaposleni */}
        {employees.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-4">👥</div>
            <h3 className="font-semibold text-gray-900 mb-2">Še ni zaposlenih</h3>
            <button onClick={() => setShowForm(true)} className="bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-medium mt-4">+ Dodaj prvega zaposlenega</button>
          </div>
        ) : (
          <div className="space-y-6">
            {employees.length > 3 && (
              <input
                type="text"
                value={employeeSearch}
                onChange={e => setEmployeeSearch(e.target.value)}
                placeholder="🔍 Išči zaposlenega po imenu…"
                style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none' }}
              />
            )}
            {employees.filter(emp => emp.full_name?.toLowerCase().includes(employeeSearch.toLowerCase())).map(emp => {
              const empExtras = getExtras(emp.id)
              const p = calcPayroll(Number(emp.gross_salary), emp.dependents || 0, empExtras)
              const regres = calcRegres(Number(emp.gross_salary))
              const regresIzplacen = !!regresIzplacila[emp.id]

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
                    <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
                      {/* Regres gumb */}
                      <button
                        onClick={() => setRegresModal({ emp, regres })}
                        style={{
                          fontSize:'12px', padding:'6px 12px', borderRadius:'10px', cursor:'pointer', border:'none', fontWeight:'500',
                          background: regresIzplacen ? '#EAF3DE' : '#FFFBEB',
                          color: regresIzplacen ? '#27500A' : '#92400E',
                        }}
                      >
                        {regresIzplacen ? '✓ Regres izplačan' : '💰 Regres'}
                      </button>
                      <button onClick={() => downloadPlacilnaLista(emp)} className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
                        📄 Plačilna lista
                      </button>
                      <button onClick={() => startEdit(emp)} className="border border-gray-200 text-gray-700 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">
                        ✏️ Uredi
                      </button>
                      <button onClick={() => deleteEmployee(emp)} className="border border-gray-200 text-red-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-red-50">
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* Dodatki */}
                  <div className="bg-gray-50 rounded-xl p-4 mb-4">
                    <div className="text-xs font-medium text-gray-500 mb-3 uppercase">Dodatki za {MONTHS[selectedMonth]}</div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { key:'overtime', label:'Nadure (ur)' },
                        { key:'nightBonus', label:'Nočno delo (ur)' },
                        { key:'sundayBonus', label:'Nedelja (ur)' },
                        { key:'holidayBonus', label:'Praznik (ur)' },
                        { key:'travelAllowance', label:'Prevoz (dni)' },
                      ].map(field => (
                        <div key={field.key}>
                          <label className="text-xs text-gray-500 block mb-1">{field.label}</label>
                          <input type="number" min="0" value={empExtras[field.key] || ''} onChange={e => setEmpExtras(emp.id, field.key, parseFloat(e.target.value)||0)}
                            placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
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
                  <div><div className="text-xs text-gray-400 mb-1">Neto izplačilo</div><div className="text-xl font-semibold text-green-400">€{employees.reduce((s,e)=>s+calcPayroll(Number(e.gross_salary),e.dependents||0,getExtras(e.id)).netSalary,0).toFixed(2)}</div></div>
                  <div><div className="text-xs text-gray-400 mb-1">Skupaj FURS</div><div className="text-xl font-semibold text-orange-400">€{employees.reduce((s,e)=>s+calcPayroll(Number(e.gross_salary),e.dependents||0,getExtras(e.id)).totalFurs,0).toFixed(2)}</div></div>
                  <div><div className="text-xs text-gray-400 mb-1">Skupaj strošek</div><div className="text-xl font-semibold">€{employees.reduce((s,e)=>s+calcPayroll(Number(e.gross_salary),e.dependents||0,getExtras(e.id)).totalCost,0).toFixed(2)}</div></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* REGRES MODAL */}
      {regresModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setRegresModal(null) }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'16px' }}>
          <div style={{ background:'#fff', borderRadius:'16px', width:'100%', maxWidth:'420px', overflow:'hidden' }}>
            <div style={{ background:'#FFFBEB', padding:'20px 24px', borderBottom:'0.5px solid #FDE68A' }}>
              <div style={{ fontSize:'16px', fontWeight:'500', color:'#92400E', marginBottom:'4px' }}>💰 Regres za letni dopust</div>
              <div style={{ fontSize:'12px', color:'#A16207' }}>{regresModal.emp.full_name} · {new Date().getFullYear()}</div>
            </div>
            <div style={{ padding:'20px 24px' }}>
              <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginBottom:'20px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', padding:'8px 0', borderBottom:'0.5px solid #f5f5f5' }}>
                  <span style={{ color:'#666' }}>Bruto plača zaposlenega</span>
                  <span style={{ fontWeight:'500' }}>€{Number(regresModal.emp.gross_salary).toFixed(2)}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', padding:'8px 0', borderBottom:'0.5px solid #f5f5f5' }}>
                  <span style={{ color:'#666' }}>Minimalni regres (= min. plača)</span>
                  <span style={{ fontWeight:'500' }}>€{MIN_WAGE.toFixed(2)}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', padding:'8px 0', borderBottom:'0.5px solid #f5f5f5' }}>
                  <span style={{ color:'#16a34a' }}>Neobdavčeni del</span>
                  <span style={{ color:'#16a34a', fontWeight:'500' }}>€{regresModal.regres.taxFree.toFixed(2)}</span>
                </div>
                {regresModal.regres.taxable > 0 && (
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', padding:'8px 0', borderBottom:'0.5px solid #f5f5f5' }}>
                    <span style={{ color:'#dc2626' }}>Dohodnina (~27%)</span>
                    <span style={{ color:'#dc2626', fontWeight:'500' }}>−€{r(regresModal.regres.taxable * 0.27).toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'15px', padding:'10px 14px', background:'#0D1F12', borderRadius:'10px', marginTop:'4px' }}>
                  <span style={{ color:'rgba(255,255,255,0.7)' }}>Neto izplačilo</span>
                  <span style={{ color:'#9FE1CB', fontWeight:'500' }}>€{regresModal.regres.netAmount.toFixed(2)}</span>
                </div>
              </div>
              <div style={{ background:'#EAF3DE', borderRadius:'8px', padding:'10px 12px', marginBottom:'16px', fontSize:'11px', color:'#27500A' }}>
                ⚖️ Zakonski rok: <strong>1. julij {new Date().getFullYear()}</strong> · Pravna podlaga: 131. člen ZDR-1
              </div>
              <div style={{ display:'flex', gap:'10px' }}>
                <button onClick={() => downloadRegresLista(regresModal.emp)} style={{ flex:1, padding:'10px', borderRadius:'10px', border:'0.5px solid rgba(0,0,0,0.1)', background:'#fff', fontSize:'13px', cursor:'pointer', color:'#0D1F12' }}>
                  📄 Natisni listo
                </button>
                {!regresIzplacila[regresModal.emp.id] && (
                  <button onClick={() => izplačajRegres(regresModal.emp, regresModal.regres.amount)} style={{ flex:1, padding:'10px', borderRadius:'10px', border:'none', background:'#1D9E75', color:'#fff', fontSize:'13px', fontWeight:'500', cursor:'pointer' }}>
                    ✓ Označi kot izplačan
                  </button>
                )}
                {regresIzplacila[regresModal.emp.id] && (
                  <div style={{ flex:1, padding:'10px', borderRadius:'10px', background:'#EAF3DE', color:'#27500A', fontSize:'13px', fontWeight:'500', textAlign:'center' }}>
                    ✓ Že izplačano
                  </div>
                )}
              </div>
              <button onClick={() => setRegresModal(null)} style={{ width:'100%', marginTop:'8px', padding:'8px', border:'none', background:'none', color:'#888', fontSize:'12px', cursor:'pointer' }}>Zapri</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AppLayout>
  )
}
