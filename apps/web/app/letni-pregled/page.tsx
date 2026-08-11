'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { SP_MIN_CONTRIBUTIONS_YEAR, EMPLOYEE_CONTRIBUTIONS, EMPLOYER_CONTRIBUTIONS } from '@/lib/tax-constants'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'

// POPRAVLJENO 30.7.2026 (audit): stari seznam razredov je imel MOCNO
// zastarele vrednosti (razred 1 = 215 EUR/mes, privzeti razred 8 = 450
// EUR/mes) - oboje POD zakonskim minimumom 2026.
//
// Uradno 2026: minimalna zavarovalna osnova 1.521,62 EUR (60% povprecne
// bruto place 2025), minimalni prispevki 651,04 EUR/mesec.
const SP_MIN_CONTRIBUTIONS_YEAR_2026 = SP_MIN_CONTRIBUTIONS_YEAR // iz lib/tax-constants.ts

// Stari razredi — OHRANJENI SAMO ZA ZDRUZLJIVOST s shranjenimi
// nastavitvami. ⚠️ Vrednosti so zastarele in se NE uporabljajo vec kot
// primarni vir. Prispevki se berejo iz dejanskih nastavitev organizacije.
const SP_CONTRIBUTIONS: Record<number, number> = {
  1: 2584.92, 2: 3012.36, 3: 3439.20, 4: 3866.04, 5: 4293.00,
  6: 4719.84, 7: 5146.68, 8: 5399.76, 9: 6024.24, 10: 6451.08,
  11: 6877.80, 12: 7304.64, 13: 7731.48, 14: 8585.16, 15: 9438.84,
}

/**
 * Letni prispevki s.p. — iz DEJANSKIH nastavitev organizacije, ki jih
 * uporabnik vnese v Nastavitvah (in jih stran /prispevki ze uporablja).
 * Ce niso nastavljene, vrne zakonski minimum 2026 (NE zastarelega razreda).
 */
function getYearlyContributions(org: any): number {
  const monthly =
    Number(org?.contrib_piz ?? 0) +
    Number(org?.contrib_zzzs ?? 0) +
    Number(org?.contrib_zaposlovanje ?? 0) +
    Number(org?.contrib_starsevstvo ?? 0)
  if (monthly > 0) return Math.round(monthly * 12 * 100) / 100
  return SP_MIN_CONTRIBUTIONS_YEAR_2026
}

const BRACKETS = [
  { upTo: 8755, rate: 0.16 },
  { upTo: 18488, rate: 0.26 },
  { upTo: 70907, rate: 0.33 },
  { upTo: 250000, rate: 0.39 },
  { upTo: Infinity, rate: 0.50 },
]

function calcTax(base: number): number {
  if (base <= 0) return 0
  let tax = 0, prev = 0
  for (const b of BRACKETS) {
    if (base <= prev) break
    const t = Math.min(base, b.upTo === Infinity ? base : b.upTo) - prev
    tax += t * b.rate
    prev = b.upTo === Infinity ? base : b.upTo
    if (b.upTo === Infinity) break
  }
  return Math.round(tax * 100) / 100
}

const MONTHS = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Avg','Sep','Okt','Nov','Dec']
const MONTHS_FULL = ['Januar','Februar','Marec','April','Maj','Junij','Julij','Avgust','September','Oktober','November','December']

export default function LentniPregledPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [contributionClass, setContributionClass] = useState(8)
  const [data, setData] = useState<any>(null)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
    if (member) {
      const o = (member as any).organizations
      setOrg(o)
      if (o.contribution_class) setContributionClass(o.contribution_class)
    }
    setLoading(false)
  }

  async function generateReport() {
    if (!org) return
    setGenerating(true)

    const yearStart = `${selectedYear}-01-01`
    const yearEnd = `${selectedYear}-12-31`

    const [invoicesRes, receiptsRes, kpoRes, employeesRes] = await Promise.all([
      supabase.from('issued_invoices').select('*').eq('org_id', org.id)
        .neq('status', 'draft').gte('issue_date', yearStart).lte('issue_date', yearEnd),
      supabase.from('receipts').select('*').eq('org_id', org.id)
        .gte('receipt_date', yearStart).lte('receipt_date', yearEnd),
      supabase.from('kpo_entries').select('*').eq('org_id', org.id)
        .gte('entry_date', yearStart).lte('entry_date', yearEnd),
      supabase.from('employees').select('*').eq('org_id', org.id),
    ])

    const invoices = invoicesRes.data || []
    const receipts = receiptsRes.data || []
    const kpo = kpoRes.data || []
    const employees = employeesRes.data || []
    // POPRAVLJENO (30.7.2026): 'kpo' se je doslej pridobil, a NIKOLI ni
    // vplival na izracun - prihodki so bili v resnici samo izdani racuni.
    // SAMO brez invoice_id (ta so placila ze prestetih racunov - izognemo
    // se dvojnemu stetju, ista varovalka kot na /kpo, /porocila, /izvoz).
    const kpoIncomeOnly = kpo.filter((e: any) => e.entry_type === 'income' && !e.invoice_id)
    // DODANO (30.7.2026): KPO stroski - simetricno s prihodki zgoraj.
    // SAMO brez receipt_id, da se ze rocno vneseni stroski (receipts) ne
    // stejejo dvakrat.
    const kpoExpenseOnly = kpo.filter((e: any) => e.entry_type === 'expense' && !e.receipt_id)

    // Mesečni pregled
    const monthly = Array.from({length: 12}, (_, i) => {
      const m = String(i+1).padStart(2,'0')
      const monthInv = invoices.filter((inv: any) => inv.issue_date?.startsWith(`${selectedYear}-${m}`))
      const monthExp = receipts.filter((r: any) => r.receipt_date?.startsWith(`${selectedYear}-${m}`))
      const monthKpo = kpoIncomeOnly.filter((e: any) => e.entry_date?.startsWith(`${selectedYear}-${m}`))
      const monthKpoExp = kpoExpenseOnly.filter((e: any) => e.entry_date?.startsWith(`${selectedYear}-${m}`))
      const revenue = monthInv.reduce((s: number, i: any) => s + Number(i.amount_net), 0)
        + monthKpo.reduce((s: number, e: any) => s + Number(e.income || 0), 0)
      const expenses = monthExp.reduce((s: number, r: any) => s + Number(r.amount_net), 0)
        + monthKpoExp.reduce((s: number, e: any) => s + Number(e.expense || 0), 0)
      const vatOut = monthInv.reduce((s: number, i: any) => s + Number(i.vat_amount), 0)
      const vatIn = monthExp.reduce((s: number, r: any) => s + Number(r.vat_amount), 0)
        + monthKpoExp.reduce((s: number, e: any) => s + Number(e.vat_in || 0), 0)
      return { month: i, revenue, expenses, vatOut, vatIn, profit: revenue - expenses }
    })

    // Stroški po kategorijah
    const expensesByCategory: Record<string, number> = {}
    receipts.forEach((r: any) => {
      const cat = r.category || 'Drugo'
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + Number(r.amount_net)
    })

    // Letni seštevki
    const totalRevenue = invoices.reduce((s: number, i: any) => s + Number(i.amount_net), 0)
      + kpoIncomeOnly.reduce((s: number, e: any) => s + Number(e.income || 0), 0)
    const totalExpenses = receipts.reduce((s: number, r: any) => s + Number(r.amount_net), 0)
      + kpoExpenseOnly.reduce((s: number, e: any) => s + Number(e.expense || 0), 0)
    const totalVatOut = invoices.reduce((s: number, i: any) => s + Number(i.vat_amount), 0)
    const totalVatIn = receipts.reduce((s: number, r: any) => s + Number(r.vat_amount), 0)
      + kpoExpenseOnly.reduce((s: number, e: any) => s + Number(e.vat_in || 0), 0)

    // Prispevki s.p.
    // POPRAVLJENO 30.7.2026: dejanske nastavitve namesto zastarelega razreda
    const annualContributions = getYearlyContributions(org)

    // Plače strošek
    const EE = EMPLOYEE_CONTRIBUTIONS.piz + EMPLOYEE_CONTRIBUTIONS.zzzs + EMPLOYEE_CONTRIBUTIONS.unemployment + EMPLOYEE_CONTRIBUTIONS.parental // iz lib/tax-constants.ts
    const ER = EMPLOYER_CONTRIBUTIONS.piz + EMPLOYER_CONTRIBUTIONS.zzzs + EMPLOYER_CONTRIBUTIONS.injury + EMPLOYER_CONTRIBUTIONS.unemployment + EMPLOYER_CONTRIBUTIONS.parental // iz lib/tax-constants.ts
    const salaryExpense = employees.filter((e: any) => e.status === 'active')
      .reduce((s: number, e: any) => s + Number(e.gross_salary) * (1 + ER) * 12, 0)

    // DDD izračun
    const taxableBase = Math.max(0, totalRevenue - totalExpenses - annualContributions - salaryExpense)
    const generalRelief = 5000
    const adjustedBase = Math.max(0, taxableBase - generalRelief)
    const incomeTax = calcTax(adjustedBase)
    const netIncome = totalRevenue - totalExpenses - annualContributions - salaryExpense - incomeTax
    const vatDue = totalVatOut - totalVatIn

    setData({
      invoices, receipts, kpo, employees, monthly,
      expensesByCategory, totalRevenue, totalExpenses,
      totalVatOut, totalVatIn, vatDue,
      annualContributions, salaryExpense,
      taxableBase, adjustedBase, incomeTax, netIncome,
      generalRelief,
    })
    setGenerating(false)
  }

  function downloadPDF() {
    if (!data || !org) return

    const html = `<!DOCTYPE html>
<html lang="sl">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 10px; color: #111; padding: 20px 30px; }
  h1 { font-size: 20px; font-weight: bold; margin-bottom: 2px; }
  .sub { color: #666; font-size: 10px; margin-bottom: 20px; }
  h2 { font-size: 13px; font-weight: bold; margin: 20px 0 8px; border-bottom: 2px solid #111; padding-bottom: 4px; }
  h3 { font-size: 11px; font-weight: bold; margin: 12px 0 6px; color: #444; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 9px; }
  th { background: #f5f5f5; padding: 5px 8px; text-align: left; font-size: 8px; text-transform: uppercase; color: #666; }
  th.r { text-align: right; }
  td { padding: 5px 8px; border-bottom: 1px solid #f5f5f5; }
  td.r { text-align: right; }
  .total-row td { font-weight: bold; background: #f0f0f0; }
  .ddd-box { background: #111; color: white; padding: 16px; border-radius: 6px; margin: 12px 0; }
  .ddd-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; }
  .ddd-row.total { font-size: 14px; font-weight: bold; border-top: 1px solid #444; padding-top: 8px; margin-top: 4px; }
  .ddd-label { color: #aaa; }
  .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 12px 0; }
  .s-box { background: #f9f9f9; border-radius: 4px; padding: 8px 10px; }
  .s-title { font-size: 8px; color: #666; text-transform: uppercase; margin-bottom: 3px; }
  .s-val { font-size: 14px; font-weight: bold; }
  .green { color: #16a34a; } .red { color: #dc2626; } .orange { color: #ea580c; }
  .footer { margin-top: 30px; font-size: 8px; color: #aaa; text-align: center; border-top: 1px solid #f0f0f0; padding-top: 10px; }
  @page { margin: 10mm; }
</style>
</head>
<body>

<h1>LETNI PREGLED ${selectedYear}</h1>
<div class="sub">${org.name} · Davčna številka: ${org.tax_number} · ${org.vat_registered ? `ID za DDV: SI${org.tax_number}` : 'Ni DDV zavezanec'} · Pripravljeno: ${new Date().toLocaleDateString('sl-SI')}</div>

<div class="summary-grid">
  <div class="s-box"><div class="s-title">Letni prihodki</div><div class="s-val green">€${data.totalRevenue.toFixed(2)}</div></div>
  <div class="s-box"><div class="s-title">Letni odhodki</div><div class="s-val red">€${data.totalExpenses.toFixed(2)}</div></div>
  <div class="s-box"><div class="s-title">Letni dobiček</div><div class="s-val ${data.totalRevenue - data.totalExpenses >= 0 ? 'green' : 'red'}">€${(data.totalRevenue - data.totalExpenses).toFixed(2)}</div></div>
</div>

<h2>1. PRIHODKI PO MESECIH</h2>
<table>
  <thead><tr><th>Mesec</th><th class="r">Prihodki</th><th class="r">Odhodki</th><th class="r">DDV izhod</th><th class="r">DDV vhod</th><th class="r">Dobiček</th></tr></thead>
  <tbody>
    ${data.monthly.map((m: any) => `
      <tr>
        <td>${MONTHS_FULL[m.month]}</td>
        <td class="r ${m.revenue > 0 ? 'green' : ''}">${m.revenue > 0 ? `€${m.revenue.toFixed(2)}` : '—'}</td>
        <td class="r ${m.expenses > 0 ? 'red' : ''}">${m.expenses > 0 ? `€${m.expenses.toFixed(2)}` : '—'}</td>
        <td class="r">${m.vatOut > 0 ? `€${m.vatOut.toFixed(2)}` : '—'}</td>
        <td class="r">${m.vatIn > 0 ? `€${m.vatIn.toFixed(2)}` : '—'}</td>
        <td class="r ${m.profit >= 0 ? 'green' : 'red'}">€${m.profit.toFixed(2)}</td>
      </tr>
    `).join('')}
    <tr class="total-row">
      <td>SKUPAJ</td>
      <td class="r">€${data.totalRevenue.toFixed(2)}</td>
      <td class="r">€${data.totalExpenses.toFixed(2)}</td>
      <td class="r">€${data.totalVatOut.toFixed(2)}</td>
      <td class="r">€${data.totalVatIn.toFixed(2)}</td>
      <td class="r">€${(data.totalRevenue - data.totalExpenses).toFixed(2)}</td>
    </tr>
  </tbody>
</table>

<h2>2. ODHODKI PO KATEGORIJAH</h2>
<table>
  <thead><tr><th>Kategorija</th><th class="r">Znesek</th><th class="r">Delež</th></tr></thead>
  <tbody>
    ${Object.entries(data.expensesByCategory).sort((a: any, b: any) => b[1] - a[1]).map(([cat, amt]: any) => `
      <tr>
        <td>${cat}</td>
        <td class="r">€${amt.toFixed(2)}</td>
        <td class="r">${data.totalExpenses > 0 ? ((amt/data.totalExpenses)*100).toFixed(1) : 0}%</td>
      </tr>
    `).join('')}
    <tr class="total-row"><td>SKUPAJ</td><td class="r">€${data.totalExpenses.toFixed(2)}</td><td class="r">100%</td></tr>
  </tbody>
</table>

<h2>3. DDV OBRAČUN ${selectedYear}</h2>
<table>
  <thead><tr><th>Postavka</th><th class="r">Znesek</th></tr></thead>
  <tbody>
    <tr><td>Izhodni DDV (od prodaj)</td><td class="r">€${data.totalVatOut.toFixed(2)}</td></tr>
    <tr><td>Vhodni DDV (od nakupov)</td><td class="r">−€${data.totalVatIn.toFixed(2)}</td></tr>
    <tr class="total-row"><td>DDV dolg FURS</td><td class="r">€${data.vatDue.toFixed(2)}</td></tr>
  </tbody>
</table>

<h2>4. DDD — OSNOVA ZA DOHODNINSKO NAPOVED</h2>
<div class="ddd-box">
  <div class="ddd-row"><span class="ddd-label">Skupni prihodki</span><span>+ €${data.totalRevenue.toFixed(2)}</span></div>
  <div class="ddd-row"><span class="ddd-label">Skupni odhodki</span><span>− €${data.totalExpenses.toFixed(2)}</span></div>
  <div class="ddd-row"><span class="ddd-label">Prispevki s.p. (razred ${contributionClass})</span><span>− €${data.annualContributions.toFixed(2)}</span></div>
  ${data.salaryExpense > 0 ? `<div class="ddd-row"><span class="ddd-label">Strošek plač</span><span>− €${data.salaryExpense.toFixed(2)}</span></div>` : ''}
  <div class="ddd-row"><span class="ddd-label">Davčna osnova</span><span>€${data.taxableBase.toFixed(2)}</span></div>
  <div class="ddd-row"><span class="ddd-label">Splošna olajšava</span><span>− €${data.generalRelief.toFixed(2)}</span></div>
  <div class="ddd-row"><span class="ddd-label">Osnova za dohodnino</span><span>€${data.adjustedBase.toFixed(2)}</span></div>
  <div class="ddd-row"><span class="ddd-label">Dohodnina</span><span>− €${data.incomeTax.toFixed(2)}</span></div>
  <div class="ddd-row total"><span>NETO LETNI ZASLUŽEK</span><span style="color:#4ade80">€${data.netIncome.toFixed(2)}</span></div>
</div>

${data.invoices.length > 0 ? `
<h2>5. SEZNAM IZDANIH RAČUNOV</h2>
<table>
  <thead><tr><th>Datum</th><th>Številka</th><th>Stranka</th><th class="r">Osnova</th><th class="r">DDV</th><th class="r">Skupaj</th><th>Status</th></tr></thead>
  <tbody>
    ${data.invoices.map((inv: any) => `
      <tr>
        <td>${new Date(inv.issue_date).toLocaleDateString('sl-SI')}</td>
        <td>${inv.invoice_number}</td>
        <td>${inv.client_name}</td>
        <td class="r">€${Number(inv.amount_net).toFixed(2)}</td>
        <td class="r">€${Number(inv.vat_amount).toFixed(2)}</td>
        <td class="r">€${Number(inv.amount_total).toFixed(2)}</td>
        <td>${inv.status === 'paid' ? 'Plačano' : 'Poslano'}</td>
      </tr>
    `).join('')}
    <tr class="total-row">
      <td colspan="3">SKUPAJ</td>
      <td class="r">€${data.totalRevenue.toFixed(2)}</td>
      <td class="r">€${data.totalVatOut.toFixed(2)}</td>
      <td class="r">€${(data.totalRevenue + data.totalVatOut).toFixed(2)}</td>
      <td></td>
    </tr>
  </tbody>
</table>
` : ''}

${data.receipts.length > 0 ? `
<h2>6. SEZNAM PREJETIH RAČUNOV</h2>
<table>
  <thead><tr><th>Datum</th><th>Dobavitelj</th><th>Kategorija</th><th class="r">Osnova</th><th class="r">DDV</th><th class="r">Skupaj</th></tr></thead>
  <tbody>
    ${data.receipts.map((r: any) => `
      <tr>
        <td>${new Date(r.receipt_date).toLocaleDateString('sl-SI')}</td>
        <td>${r.vendor}</td>
        <td>${r.category || '—'}</td>
        <td class="r">€${Number(r.amount_net).toFixed(2)}</td>
        <td class="r">€${Number(r.vat_amount).toFixed(2)}</td>
        <td class="r">€${Number(r.amount_total).toFixed(2)}</td>
      </tr>
    `).join('')}
    <tr class="total-row">
      <td colspan="3">SKUPAJ</td>
      <td class="r">€${data.totalExpenses.toFixed(2)}</td>
      <td class="r">€${data.totalVatIn.toFixed(2)}</td>
      <td class="r">€${(data.totalExpenses + data.totalVatIn).toFixed(2)}</td>
    </tr>
  </tbody>
</table>
` : ''}

<div class="footer">
  Letni pregled ${selectedYear} · ${org.name} · Generirano z Računko · ${new Date().toLocaleString('sl-SI')}
</div>

<script>window.onload=function(){window.print()}</script>
</body>
</html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
  }

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
          <h1 className="font-semibold text-gray-900 mt-0.5">Letni pregled</h1>
        </div>
        {data && (
          <button onClick={downloadPDF}
            className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
            ⬇ Prenesi PDF
          </button>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <h3 className="font-medium text-gray-900 mb-4">Izberite leto in prispevni razred</h3>
          <div className="flex gap-3 mb-4">
            <select value={selectedYear}
              onChange={e => { setSelectedYear(parseInt(e.target.value)); setData(null) }}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none w-32">
              {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
            </select>
            <select value={contributionClass}
              onChange={e => { setContributionClass(parseInt(e.target.value)); setData(null) }}
              // POPRAVLJENO (30.7.2026): dodan min-w-0 - flex elementi imajo
              // privzeto min-width:auto, kar preprecuje skrcitev pod
              // vsebinsko sirino (najdaljso <option>) - to je povleklo
              // celo stran v horizontalno drsenje na mobilnem.
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none flex-1 min-w-0">
              {Array.from({length: 15}, (_, i) => i+1).map(c => (
                <option key={c} value={c}>
                  Prispevni razred {c} — €{(SP_CONTRIBUTIONS[c]/12).toFixed(0)}/mes (€{SP_CONTRIBUTIONS[c].toFixed(2)}/leto)
                </option>
              ))}
            </select>
          </div>
          <button onClick={generateReport} disabled={generating}
            className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40">
            {generating ? 'Generiram...' : `📊 Generiraj letni pregled ${selectedYear}`}
          </button>
        </div>

        {data && (
          <>
            {/* Povzetek */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="text-xs text-gray-500 mb-1">Letni prihodki</div>
                <div className="text-xl font-semibold text-green-600">€{data.totalRevenue.toFixed(2)}</div>
                <div className="text-xs text-gray-400 mt-1">{data.invoices.length} računov</div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="text-xs text-gray-500 mb-1">Letni odhodki</div>
                <div className="text-xl font-semibold text-red-500">€{data.totalExpenses.toFixed(2)}</div>
                <div className="text-xs text-gray-400 mt-1">{data.receipts.length} stroškov</div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="text-xs text-gray-500 mb-1">DDV dolg letno</div>
                <div className="text-xl font-semibold text-orange-500">€{data.vatDue.toFixed(2)}</div>
              </div>
            </div>

            {/* DDD povzetek */}
            <div className="bg-gray-900 rounded-2xl p-6 mb-6 text-white">
              <div className="text-sm text-gray-400 mb-4 font-medium">DDD — OSNOVA ZA DOHODNINSKO NAPOVED</div>
              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between">
                  <span className="text-gray-400">Prihodki</span>
                  <span>+ €{data.totalRevenue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Odhodki</span>
                  <span>− €{data.totalExpenses.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Prispevki s.p.</span>
                  <span>− €{data.annualContributions.toFixed(2)}</span>
                </div>
                {data.salaryExpense > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Strošek plač</span>
                    <span>− €{data.salaryExpense.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">Splošna olajšava</span>
                  <span>− €{data.generalRelief.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Dohodnina</span>
                  <span>− €{data.incomeTax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-semibold border-t border-gray-700 pt-3 mt-2">
                  <span>Neto letni zaslužek</span>
                  <span className="text-green-400">€{data.netIncome.toFixed(2)}</span>
                </div>
              </div>
              <div className="text-xs text-gray-500 bg-gray-800 rounded-xl p-3">
                💡 Te podatke posredujte računovodkinji za pripravo DDD obrazca.
                FURS bo napoved predizpolnil — vi jo samo preverite in potrdite.
              </div>
            </div>

            {/* Mesečni graf */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
              <h3 className="font-medium text-gray-900 mb-4">Prihodki po mesecih</h3>
              <div className="space-y-2">
                {data.monthly.map((m: any) => {
                  const maxRevenue = Math.max(...data.monthly.map((x: any) => x.revenue))
                  const pct = maxRevenue > 0 ? (m.revenue / maxRevenue) * 100 : 0
                  return (
                    <div key={m.month} className="flex items-center gap-3">
                      <div className="w-8 text-xs text-gray-500 text-right">{MONTHS[m.month]}</div>
                      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                        <div
                          className="h-full bg-gray-900 rounded-full flex items-center justify-end pr-2 transition-all"
                          style={{width: `${Math.max(pct, m.revenue > 0 ? 5 : 0)}%`}}
                        >
                          {m.revenue > 0 && <span className="text-white text-xs font-medium">€{m.revenue.toFixed(0)}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <button onClick={downloadPDF}
              className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-medium">
              ⬇ Prenesi PDF — za računovodkinjo / DDD pregled
            </button>
          </>
        )}
      </div>
    </div>
    </AppLayout>
  )
}