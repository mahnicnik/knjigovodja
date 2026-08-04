'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'

const LEAVE_TYPES = [
  { value: 'vacation', label: 'Letni dopust', emoji: '🏖️', paid: true },
  { value: 'sick', label: 'Bolniška (do 30 dni)', emoji: '🤒', paid: true },
  { value: 'sick_child', label: 'Bolniška — nega otroka', emoji: '👶', paid: true },
  { value: 'maternity', label: 'Porodniška', emoji: '🤰', paid: true },
  { value: 'other', label: 'Neplačan dopust', emoji: '📅', paid: false },
]

// DODANO (30.7.2026, audit): slovenski dela prosti dnevi.
// Po ZDR-1 se praznik, ki pade med dopust, NE šteje kot izrabljen dan
// dopusta — prej je workingDays() odštel samo vikende, zato se je
// zaposlenemu odštel dan dopusta preveč za vsak praznik.
//
// Velikonočna in binkoštna NEDELJA sta že zajeti z vikend filtrom,
// zato je od premakljivih praznikov potreben samo velikonočni ponedeljek.

/** Velikonočna nedelja (Meeus/Jones/Butcher) — preverjeno 2024–2027. */
function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

/** Fiksni slovenski dela prosti dnevi (mesec 1–12, dan). */
const FIXED_HOLIDAYS: Array<[number, number]> = [
  [1, 1],   // novo leto
  [1, 2],   // novo leto (2. dan)
  [2, 8],   // Prešernov dan
  [4, 27],  // dan upora proti okupatorju
  [5, 1],   // praznik dela
  [5, 2],   // praznik dela (2. dan)
  [6, 25],  // dan državnosti
  [8, 15],  // Marijino vnebovzetje
  [10, 31], // dan reformacije
  [11, 1],  // dan spomina na mrtve
  [12, 25], // božič
  [12, 26], // dan samostojnosti in enotnosti
]

function isSlovenianHoliday(d: Date): boolean {
  const month = d.getMonth() + 1
  const day = d.getDate()
  if (FIXED_HOLIDAYS.some(([m, dd]) => m === month && dd === day)) return true
  // Velikonočni ponedeljek (premakljiv)
  const easter = easterSunday(d.getFullYear())
  const easterMonday = new Date(easter)
  easterMonday.setDate(easterMonday.getDate() + 1)
  return d.getMonth() === easterMonday.getMonth() && d.getDate() === easterMonday.getDate()
}

function workingDays(from: string, to: string): number {
  const start = new Date(from)
  const end = new Date(to)
  let days = 0
  const cur = new Date(start)
  while (cur <= end) {
    const day = cur.getDay()
    if (day !== 0 && day !== 6 && !isSlovenianHoliday(cur)) days++
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

export default function DopustPage() {
  const [org, setOrg] = useState<any>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<string>('')
  const [form, setForm] = useState({
    employee_id: '',
    leave_type: 'vacation',
    from_date: new Date().toISOString().split('T')[0],
    to_date: new Date().toISOString().split('T')[0],
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
        .from('employees')
        .select('*')
        .eq('org_id', o.id)
        .eq('status', 'active')
      setEmployees(emps || [])
      const { data: recs } = await supabase
        .from('leave_records')
        .select('*, employees(full_name)')
        .eq('org_id', o.id)
        .order('from_date', { ascending: false })
      setRecords(recs || [])
    }
    setLoading(false)
  }

  async function handleSave() {
    if (!org || !form.employee_id || !form.from_date || !form.to_date) return
    setSaving(true)
    const days = workingDays(form.from_date, form.to_date)
    const leaveType = LEAVE_TYPES.find(t => t.value === form.leave_type)
    const { error } = await supabase.from('leave_records').insert({
      org_id: org.id,
      employee_id: form.employee_id,
      leave_type: form.leave_type,
      from_date: form.from_date,
      to_date: form.to_date,
      days,
      paid: leaveType?.paid ?? true,
      approved: true,
      notes: form.notes,
    })
    if (error) { alert('Napaka: ' + error.message); setSaving(false); return }
    setShowForm(false)
    setSaving(false)
    load()
  }

  // Statistika po zaposlenih
  function getEmployeeStats(empId: string) {
    const empRecords = records.filter(r => r.employee_id === empId)
    const vacation = empRecords.filter(r => r.leave_type === 'vacation').reduce((s, r) => s + r.days, 0)
    const sick = empRecords.filter(r => r.leave_type === 'sick').reduce((s, r) => s + r.days, 0)
    const unpaid = empRecords.filter(r => r.leave_type === 'other').reduce((s, r) => s + r.days, 0)
    return { vacation, sick, unpaid }
  }

  const days = workingDays(form.from_date, form.to_date)

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
          <h1 className="font-semibold text-gray-900 mt-0.5">Dopust in odsotnosti</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
          + Vnesi odsotnost
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Forma */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-900 p-6 mb-6">
            <h3 className="font-medium text-gray-900 mb-4">Nova odsotnost</h3>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Zaposleni *</label>
                <select value={form.employee_id} onChange={e => setForm({...form, employee_id: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
                  <option value="">Izberite zaposlenega</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Tip odsotnosti *</label>
                <select value={form.leave_type} onChange={e => setForm({...form, leave_type: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
                  {LEAVE_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Od *</label>
                <input type="date" value={form.from_date}
                  onChange={e => setForm({...form, from_date: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Do *</label>
                <input type="date" value={form.to_date}
                  onChange={e => setForm({...form, to_date: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Opomba</label>
                <input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
                  placeholder="npr. letni dopust, bolniška potrditev..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>

            {/* Info o tipu */}
            {form.leave_type && form.from_date && form.to_date && (
              <div className={`rounded-xl p-3 mb-4 text-sm ${
                form.leave_type === 'other' ? 'bg-orange-50 text-orange-800' :
                form.leave_type === 'sick' ? 'bg-blue-50 text-blue-800' :
                'bg-green-50 text-green-800'
              }`}>
                {form.leave_type === 'vacation' && `🏖️ Letni dopust — ${days} delovnih dni. Plača se izplača normalno.`}
                {form.leave_type === 'sick' && `🤒 Bolniška — ${days} delovnih dni. Do 30 dni plačate vi (90% bruto). Od 31. dne plača ZZZS.`}
                {form.leave_type === 'sick_child' && `👶 Nega otroka — ${days} delovnih dni. Prvih 7 dni plačate vi, potem ZZZS.`}
                {form.leave_type === 'maternity' && `🤰 Porodniška — ${days} delovnih dni. Plača ZZZS.`}
                {form.leave_type === 'other' && `📅 Neplačan dopust — ${days} delovnih dni. Plača = €0. Prispevki se ne plačajo za te dni.`}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleSave} disabled={saving || !form.employee_id}
                className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-40">
                {saving ? 'Shranjujem...' : 'Shrani odsotnost'}
              </button>
              <button onClick={() => setShowForm(false)}
                className="border border-gray-200 rounded-xl px-6 py-2.5 text-sm">
                Prekliči
              </button>
            </div>
          </div>
        )}

        {/* Statistika po zaposlenih */}
        {employees.length > 0 && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            {employees.map(emp => {
              const stats = getEmployeeStats(emp.id)
              const vacationLeft = (emp.vacation_days_per_year || 24) - stats.vacation
              return (
                <div key={emp.id} className="bg-white rounded-2xl border border-gray-100 p-5">
                  <div className="font-medium text-gray-900 mb-3">{emp.full_name}</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center bg-green-50 rounded-xl p-2">
                      <div className="text-lg font-semibold text-green-600">{vacationLeft}</div>
                      <div className="text-xs text-green-600">Dopust ostalo</div>
                    </div>
                    <div className="text-center bg-blue-50 rounded-xl p-2">
                      <div className="text-lg font-semibold text-blue-600">{stats.sick}</div>
                      <div className="text-xs text-blue-600">Bolniška dni</div>
                    </div>
                    <div className="text-center bg-orange-50 rounded-xl p-2">
                      <div className="text-lg font-semibold text-orange-600">{stats.unpaid}</div>
                      <div className="text-xs text-orange-600">Neplačan</div>
                    </div>
                  </div>
                  {stats.sick > 20 && (
                    <div className="mt-2 text-xs text-orange-600 bg-orange-50 rounded-lg p-2">
                      ⚠️ {stats.sick} dni bolniške — kmalu preseže 30 dni → ZZZS prevzame
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {/* Opozorilo bolniška > 30 dni */}
{employees.map(emp => {
  const sickDays = records
    .filter(r => r.employee_id === emp.id && r.leave_type === 'sick')
    .reduce((s, r) => s + r.days, 0)
  if (sickDays < 20) return null
  return (
    <div key={`sick-${emp.id}`} className={`rounded-2xl p-4 mb-4 border ${sickDays >= 30 ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}>
      <div className={`font-medium text-sm mb-1 ${sickDays >= 30 ? 'text-red-800' : 'text-orange-800'}`}>
        {sickDays >= 30 ? '🚨' : '⚠️'} Bolniška — {emp.full_name}: <strong>{sickDays} dni</strong>
      </div>
      <div className={`text-xs leading-relaxed ${sickDays >= 30 ? 'text-red-700' : 'text-orange-700'}`}>
        {sickDays >= 30
          ? `Zaposleni je presegl 30 dni bolniške! Od 31. dne naprej plača ZZZS — ne vi. 
             Predložite potrdilo ZZZS in ustavite izplačilo nadomestila iz svojega žepa.
             Kontaktirajte ZZZS: 080 27 47`
          : `Zaposleni se bliža 30 dnem bolniške (${30 - sickDays} dni do meje). 
             Po 30 dneh plačilo prevzame ZZZS. Pripravite dokumentacijo.`
        }
      </div>
      {sickDays >= 30 && (
        <div className="mt-2 bg-red-100 rounded-xl p-2 text-xs text-red-800">
          <strong>Akcija:</strong> Izpolnite obrazec ZZZS — Zahtevek za refundacijo nadomestila plače.
          Rok za vlogo: 6 mesecev od prvega dne bolniške.
        </div>
      )}
    </div>
  )
})}

        {/* Seznam odsotnosti */}
        {records.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-4">📅</div>
            <h3 className="font-semibold text-gray-900 mb-2">Še ni evidenc odsotnosti</h3>
            <p className="text-gray-500 text-sm mb-6">Vnesite dopust, bolniško ali drugo odsotnost</p>
            <button onClick={() => setShowForm(true)}
              className="bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-medium">
              + Vnesi odsotnost
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50 border-b border-gray-100">
              <div className="col-span-3 text-xs font-medium text-gray-500">Zaposleni</div>
              <div className="col-span-3 text-xs font-medium text-gray-500">Tip</div>
              <div className="col-span-2 text-xs font-medium text-gray-500">Od</div>
              <div className="col-span-2 text-xs font-medium text-gray-500">Do</div>
              <div className="col-span-1 text-xs font-medium text-gray-500 text-center">Dni</div>
              <div className="col-span-1 text-xs font-medium text-gray-500 text-center">Plačano</div>
            </div>
            {records.map((rec, i) => {
              const type = LEAVE_TYPES.find(t => t.value === rec.leave_type)
              return (
                <div key={rec.id} className={`grid grid-cols-12 gap-2 px-6 py-3 items-center text-sm ${i < records.length-1 ? 'border-b border-gray-50' : ''}`}>
                  <div className="col-span-3 font-medium text-gray-900 text-xs truncate">
                    {(rec.employees as any)?.full_name}
                  </div>
                  <div className="col-span-3 text-xs text-gray-600">
                    {type?.emoji} {type?.label}
                  </div>
                  <div className="col-span-2 text-xs text-gray-500">
                    {new Date(rec.from_date).toLocaleDateString('sl-SI')}
                  </div>
                  <div className="col-span-2 text-xs text-gray-500">
                    {new Date(rec.to_date).toLocaleDateString('sl-SI')}
                  </div>
                  <div className="col-span-1 text-center">
                    <span className="text-xs font-semibold">{rec.days}</span>
                  </div>
                  <div className="col-span-1 text-center">
                    {rec.paid
                      ? <span className="text-xs text-green-600">✓</span>
                      : <span className="text-xs text-orange-500">✗</span>
                    }
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