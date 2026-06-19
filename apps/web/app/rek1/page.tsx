'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

const EE = { piz: 0.1550, zzzs: 0.0636, injury: 0.0014, unemployment: 0.0014 }
const ER = { piz: 0.0885, zzzs: 0.0656, injury: 0.0053, unemployment: 0.0014, parental: 0.0010 }
const GENERAL_RELIEF_MONTHLY = 5000 / 12
const BRACKETS = [
  { upTo: 8755, rate: 0.16 }, { upTo: 18488, rate: 0.26 },
  { upTo: 70907, rate: 0.33 }, { upTo: 250000, rate: 0.39 },
  { upTo: Infinity, rate: 0.50 },
]

function calcPayroll(grossSalary: number, dependents: number = 0) {
  const ee_piz = r(grossSalary * EE.piz)
  const ee_zzzs = r(grossSalary * EE.zzzs)
  const ee_injury = r(grossSalary * EE.injury)
  const ee_unemployment = r(grossSalary * EE.unemployment)
  const ee_total = r(ee_piz + ee_zzzs + ee_injury + ee_unemployment)
  const base = grossSalary - ee_total
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
  const netSalary = r(grossSalary - ee_total - incomeTax)
  const er_piz = r(grossSalary * ER.piz)
  const er_zzzs = r(grossSalary * ER.zzzs)
  const er_injury = r(grossSalary * ER.injury)
  const er_unemployment = r(grossSalary * ER.unemployment)
  const er_parental = r(grossSalary * ER.parental)
  const er_total = r(er_piz + er_zzzs + er_injury + er_unemployment + er_parental)
  return { ee_piz, ee_zzzs, ee_injury, ee_unemployment, ee_total, incomeTax, netSalary, er_piz, er_zzzs, er_injury, er_unemployment, er_parental, er_total, totalCost: r(grossSalary + er_total), totalFurs: r(ee_total + incomeTax + er_total) }
}

function r(v: number) { return Math.round(v * 100) / 100 }

const MONTHS = ['Januar','Februar','Marec','April','Maj','Junij','Julij','Avgust','September','Oktober','November','December']

export default function REK1Page() {
  const [org, setOrg] = useState<any>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [grossOverrides, setGrossOverrides] = useState<Record<string, number>>({})
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

  function generateREK1(emp: any, grossSalaryOverride?: number) {
    const effectiveGross = grossSalaryOverride !== undefined ? grossSalaryOverride : Number(emp.gross_salary)
    emp = { ...emp, gross_salary: effectiveGross }
    const p = calcPayroll(Number(emp.gross_salary), emp.dependents || 0)
    const monthStr = String(selectedMonth + 1).padStart(2, '0')
    const dateFrom = `${selectedYear}-${monthStr}-01`
    const dateTo = new Date(selectedYear, selectedMonth + 1, 0).toISOString().split('T')[0]

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<REK1 xmlns="http://edavki.durs.si/Documents/Schemas/REK_1_2.xsd">
  <Zavezanec>
    <DavcnaStevilka>${org.tax_number}</DavcnaStevilka>
    <Naziv>${org.name}</Naziv>
    <Naslov>${org.address || ''}</Naslov>
    <PostnaStevilka>${org.post_code || ''}</PostnaStevilka>
    <Kraj>${org.city || ''}</Kraj>
  </Zavezanec>
  <Prejemnik>
    <DavcnaStevilka>${emp.tax_number}</DavcnaStevilka>
    <Naziv>${emp.full_name}</Naziv>
    <VrstaDohodka>1101</VrstaDohodka>
  </Prejemnik>
  <ObdobjeOd>${dateFrom}</ObdobjeOd>
  <ObdobjeDo>${dateTo}</ObdobjeDo>
  <BrutoPrejemek>${emp.gross_salary}</BrutoPrejemek>
  <OsnovaPriznanihOdhodkov>${p.ee_total}</OsnovaPriznanihOdhodkov>
  <DavcnaOsnova>${r(Number(emp.gross_salary) - p.ee_total)}</DavcnaOsnova>
  <AkontacijaDohodnineTakoj>${p.incomeTax}</AkontacijaDohodnineTakoj>
  <PrispevekZa_PIZ_Zaposlenega>${p.ee_piz}</PrispevekZa_PIZ_Zaposlenega>
  <PrispevekZa_ZZ_Zaposlenega>${p.ee_zzzs}</PrispevekZa_ZZ_Zaposlenega>
  <PrispevekZa_PIZ_Delodajalca>${p.er_piz}</PrispevekZa_PIZ_Delodajalca>
  <PrispevekZa_ZZ_Delodajalca>${p.er_zzzs}</PrispevekZa_ZZ_Delodajalca>
  <PrispevekZaStarsevstvoDelodajalca>${p.er_parental}</PrispevekZaStarsevstvoDelodajalca>
  <PrispevekZaBrezposelnostDelodajalca>${p.er_unemployment}</PrispevekZaBrezposelnostDelodajalca>
  <IzplacanoNeto>${p.netSalary}</IzplacanoNeto>
</REK1>`
    return xml
  }

  function downloadREK1(emp: any) {
    const xml = generateREK1(emp, grossOverrides[emp.id])
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `REK1-${emp.full_name.replace(' ', '_')}-${selectedYear}-${String(selectedMonth+1).padStart(2,'0')}.xml`
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadAllREK1() {
    employees.forEach(emp => downloadREK1(emp))
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
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Domov</Link>
          <h1 className="font-semibold text-gray-900 mt-0.5">REK-1 obrazci</h1>
        </div>
        {employees.length > 0 && (
          <button onClick={downloadAllREK1}
            className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
            ⬇ Prenesi vse REK-1
          </button>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Izbira meseca */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <h3 className="font-medium text-gray-900 mb-3 text-sm">Izberite obdobje</h3>
          <div className="flex gap-3">
            <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none flex-1">
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none w-32">
              {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Navodilo */}
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-6">
          <div className="font-medium text-orange-800 text-sm mb-1">⚠️ Kako oddati REK-1</div>
          <div className="text-orange-700 text-xs leading-relaxed">
            1. Prenesite XML datoteko za vsakega zaposlenega<br/>
            2. Pojdite na <strong>edavki.durs.si</strong> → Vloge → REK-1<br/>
            3. Naložite XML datoteko<br/>
            4. Preverite in oddajte<br/>
            5. <strong>Šele po oddaji REK-1 smete izplačati plačo!</strong>
          </div>
        </div>

        {employees.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-4">📋</div>
            <h3 className="font-semibold text-gray-900 mb-2">Ni zaposlenih</h3>
            <p className="text-gray-500 text-sm mb-4">Najprej dodajte zaposlenega</p>
            <Link href="/place" className="bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-medium">
              → Dodaj zaposlenega
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {employees.map(emp => {
              const grossOverride = grossOverrides[emp.id]
              const grossSalary = grossOverride !== undefined ? grossOverride : Number(emp.gross_salary)
              const p = calcPayroll(grossSalary, emp.dependents || 0)
              return (
                <div key={emp.id} className="bg-white rounded-2xl border border-gray-100 p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="font-semibold text-gray-900">{emp.full_name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {MONTHS[selectedMonth]} {selectedYear} · Davčna: {emp.tax_number}
                      </div>
                    </div>
                    <button onClick={() => downloadREK1(emp)}
                      className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2">
                      ⬇ REK-1 XML
                    </button>
                  </div>

                  {/* Pregled podatkov */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-gray-50 rounded-xl p-4">
                      <div className="text-xs font-medium text-gray-500 mb-2 uppercase">Delojemalec</div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between items-center"><span className="text-gray-600">Bruto plača</span>
                          <input
                            type="number"
                            step="0.01"
                            value={grossSalary || ''}
                            onChange={e => setGrossOverrides(prev => ({ ...prev, [emp.id]: e.target.value === '' ? 0 : Number(e.target.value) }))}
                            className="w-24 text-right font-medium border border-gray-200 rounded-lg px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
                          />
                        </div>
                        <div className="flex justify-between"><span className="text-gray-600">ZPIZ (15.50%)</span><span>−€{p.ee_piz.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">ZZZS (6.36%)</span><span>−€{p.ee_zzzs.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">Dohodnina</span><span>−€{p.incomeTax.toFixed(2)}</span></div>
                        <div className="flex justify-between font-semibold border-t border-gray-200 pt-1.5 mt-1">
                          <span>Neto plača</span><span className="text-green-600">€{p.netSalary.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4">
                      <div className="text-xs font-medium text-gray-500 mb-2 uppercase">Delodajalec (FURS)</div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between"><span className="text-gray-600">ZPIZ (8.85%)</span><span>€{p.er_piz.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">ZZZS (6.56%)</span><span>€{p.er_zzzs.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">Poškodbe (0.53%)</span><span>€{p.er_injury.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">Starševstvo (0.10%)</span><span>€{p.er_parental.toFixed(2)}</span></div>
                        <div className="flex justify-between font-semibold border-t border-gray-200 pt-1.5 mt-1">
                          <span>Skupaj FURS</span><span className="text-red-500">€{p.totalFurs.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* UPN QR — en QR za vse FURS plačilo */}
                  <div className="bg-gray-900 rounded-xl p-4 text-white">
                    <div className="text-xs text-gray-400 mb-2 font-medium">SKUPNA PLAČILNA NALOGA — FURS</div>
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-xs text-gray-400">Dohodnina + prispevki EE + prispevki ER</div>
                        <div className="text-xl font-semibold text-orange-400 mt-1">€{p.totalFurs.toFixed(2)}</div>
                        <div className="text-xs text-gray-500 mt-1 font-mono">SI56 0110 0888 1000 030</div>
                        <div className="text-xs text-gray-500 font-mono">
                          Sklic: SI19 {org?.tax_number} PD{String(selectedMonth+1).padStart(2,'0')}{String(selectedYear).slice(-2)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-400 mb-1">Neto delavcu</div>
                        <div className="text-lg font-semibold text-green-400">€{p.netSalary.toFixed(2)}</div>
                        {emp.iban && <div className="text-xs text-gray-500 font-mono mt-1">{emp.iban}</div>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}