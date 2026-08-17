'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'
import { lastWorkingDayOfMonth } from '@/lib/slovenian-holidays'
import { MIN_REGRES , lokalniDatum} from '@/lib/tax-constants'
import AppLayout from '@/components/AppLayout'

interface Deadline {
  id: string
  date: string
  title: string
  description: string
  category: 'ddv' | 'prispevki' | 'dohodnina' | 'placa' | 'porocilo'
  link?: string
  done?: boolean
}

function getDeadlines(year: number, month: number, isVatRegistered: boolean, hasEmployees: boolean): Deadline[] {
  const deadlines: Deadline[] = []
  const m = String(month).padStart(2, '0')
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const nm = String(nextMonth).padStart(2, '0')

  // Prispevki s.p. — do 20. v NASLEDNJEM mesecu (POPRAVLJENO 16.8.2026)
  deadlines.push({
    id: `prispevki-${year}-${m}`,
    date: `${year}-${m}-20`,
    title: 'Prispevki s.p.',
    description: 'Plačilo ZPIZ + ZZZS prispevkov do 20. v naslednjem mesecu',
    category: 'prispevki',
    link: '/prispevki',
  })

  // Akontacija dohodnine — do 20. v NASLEDNJEM mesecu (POPRAVLJENO 16.8.2026)
  deadlines.push({
    id: `akontacija-${year}-${m}`,
    date: `${year}-${m}-20`,
    title: 'Akontacija dohodnine',
    description: 'Mesečna akontacija dohodnine (če je določena v odločbi)',
    category: 'dohodnina',
    link: '/dohodnina',
  })

  // REK-1 + plača — pred izplačilom
  if (hasEmployees) {
    deadlines.push({
      id: `reki-${year}-${m}`,
      date: `${year}-${m}-25`,
      title: 'REK-1 + plača',
      description: 'Oddajte REK-1 na eDavki PRED izplačilom plače',
      category: 'placa',
      link: '/rek1',
    })
  }

  // DDV obračun — četrtletno
  const dueMonths: Record<number, { q: number; period: string }> = {
    4: { q: 1, period: 'Q1 (jan–mar)' },
    7: { q: 2, period: 'Q2 (apr–jun)' },
    10: { q: 3, period: 'Q3 (jul–sep)' },
    1: { q: 4, period: 'Q4 (okt–dec)' },
  }
  if (isVatRegistered && dueMonths[month]) {
    // POPRAVLJENO (30.7.2026, audit): rok za DDV-O je zadnji DELOVNI dan,
    // ne zadnji koledarski. Prej bi za maj 2026 pokazalo 31. (nedelja),
    // dejanski rok pa je 29. (petek) -> uporabnik bi ZAMUDIL rok.
    const lastDay = lastWorkingDayOfMonth(year, month)
    deadlines.push({
      id: `ddv-${year}-${m}`,
      date: `${year}-${m}-${lastDay}`,
      title: `DDV-O obračun ${dueMonths[month].period}`,
      description: `Oddaja DDV-O obrazca na eDavki za ${dueMonths[month].period}`,
      category: 'ddv',
      link: '/ddv/evidenca',
    })
  }

  // Regres — do 1. julija
  if (hasEmployees && month === 7) {
    deadlines.push({
      id: `regres-${year}`,
      date: `${year}-07-01`,
      title: 'Regres za letni dopust',
      description: `Obvezno izplačilo regresa — minimum = minimalna plača (€${MIN_REGRES.toFixed(2)})`,
      category: 'placa',
      link: '/place',
    })
  }

  // DDD — dohodninska napoved iz dejavnosti — do 31. marca
  if (month === 3) {
    deadlines.push({
      id: `ddd-${year}`,
      date: `${year}-03-31`,
      title: 'DDD — dohodninska napoved',
      description: 'Oddaja dohodninske napovedi iz dejavnosti na eDavki',
      category: 'dohodnina',
      link: '/letni-pregled',
    })
  }

  // Letni popis zaloge — 31. december
  if (month === 12) {
    deadlines.push({
      id: `popis-${year}`,
      date: `${year}-12-31`,
      title: 'Popis zaloge',
      description: 'Letni popis zaloge na dan 31.12. — potrebno za DDD',
      category: 'porocilo',
      link: '/zaloge', // POPRAVLJENO 26.7.2026: /zaloga (localStorage) odstranjena, /zaloge je prava (baza)
    })
  }

  return deadlines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

const CATEGORY_COLORS: Record<string, string> = {
  ddv: 'bg-orange-100 text-orange-700 border-orange-200',
  prispevki: 'bg-blue-100 text-blue-700 border-blue-200',
  dohodnina: 'bg-purple-100 text-purple-700 border-purple-200',
  placa: 'bg-green-100 text-green-700 border-green-200',
  porocilo: 'bg-gray-100 text-gray-700 border-gray-200',
}

const CATEGORY_LABELS: Record<string, string> = {
  ddv: 'DDV',
  prispevki: 'Prispevki',
  dohodnina: 'Dohodnina',
  placa: 'Plača',
  porocilo: 'Poročilo',
}

const MONTHS = ['Januar','Februar','Marec','April','Maj','Junij','Julij','Avgust','September','Oktober','November','December']

export default function RokovnikPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [done, setDone] = useState<Record<string, boolean>>({})
  // DODANO (30.7.2026): "legenda" nad seznamom je bila samo vizualna
  // (brez onClick) - a ker izgleda kot filter, je zdaj dejansko funkcionalna.
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [hasEmployees, setHasEmployees] = useState(false)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (org) {
      const dl = getDeadlines(selectedYear, selectedMonth, org.vat_registered, hasEmployees)
      setDeadlines(dl)
    }
  }, [org, selectedMonth, selectedYear, hasEmployees])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
    if (member) {
      const o = (member as any).organizations
      setOrg(o)
      const { data: emps } = await supabase
        .from('employees').select('id').eq('org_id', o.id).eq('status', 'active')
      setHasEmployees((emps || []).length > 0)

      // Naloži opravljene
      const stored = localStorage.getItem(`rokovnik_done_${o.id}`)
      // POPRAVLJENO (17.8.2026): branje iz shrambe brskalnika brez varovalke.
      // Ce se zapis pokvari (prekinjena seja, sprememba oblike, rocni poseg),
      // razclenjevanje vrze napako in stran se sploh ne nalozi - uporabnik
      // obtici na beli strani brez izhoda. Zdaj se pokvarjen zapis preprosto
      // preskoci.
      if (stored) { try { setDone(JSON.parse(stored)) } catch { /* pokvarjen zapis - preskoci */ } }
    }
    setLoading(false)
  }

  function toggleDone(id: string) {
    if (!org) return
    const updated = { ...done, [id]: !done[id] }
    setDone(updated)
    localStorage.setItem(`rokovnik_done_${org.id}`, JSON.stringify(updated))
  }

  const today = new Date()
  const todayStr = lokalniDatum(today)

  function getDaysLeft(dateStr: string) {
    const d = new Date(dateStr)
    const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  function getUrgency(dateStr: string, isDone: boolean) {
    if (isDone) return 'done'
    const days = getDaysLeft(dateStr)
    if (days < 0) return 'overdue'
    if (days <= 3) return 'urgent'
    if (days <= 7) return 'soon'
    return 'ok'
  }

  const urgencyStyles: Record<string, string> = {
    done: 'opacity-50 bg-gray-50',
    overdue: 'border-l-4 border-l-red-500 bg-red-50',
    urgent: 'border-l-4 border-l-orange-500 bg-orange-50',
    soon: 'border-l-4 border-l-yellow-400 bg-yellow-50',
    ok: 'bg-white',
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Nalagam...</p>
    </div>
  )

  const overdueCount = deadlines.filter(d => getUrgency(d.date, done[d.id]) === 'overdue').length
  const doneCount = deadlines.filter(d => done[d.id]).length

  return (
    <AppLayout org={org}>
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="font-semibold text-gray-900 mt-0.5">Davčni rokovnik</h1>
        </div>
        <div className="flex gap-2 items-center">
          {overdueCount > 0 && (
            <span className="bg-red-100 text-red-700 text-xs px-3 py-1.5 rounded-xl font-medium">
              ⚠️ {overdueCount} zamujenih
            </span>
          )}
          <span className="text-xs text-gray-500">{doneCount}/{deadlines.length} opravljenih</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* Izbira meseca */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <div className="flex gap-3">
            <select value={selectedMonth}
              onChange={e => setSelectedMonth(parseInt(e.target.value))}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none flex-1">
              {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
            <select value={selectedYear}
              onChange={e => setSelectedYear(parseInt(e.target.value))}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none w-28">
              {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* DODANO (30.7.2026): legenda -> dejanski filter po kategoriji */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSelectedCategory(prev => prev === key ? null : key)}
              className={`text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-all ${CATEGORY_COLORS[key]} ${selectedCategory === key ? 'ring-2 ring-offset-1 ring-gray-900 font-semibold' : 'opacity-70 hover:opacity-100'}`}
            >
              {label}
            </button>
          ))}
          {selectedCategory && (
            <button onClick={() => setSelectedCategory(null)} className="text-xs px-2.5 py-1 rounded-full border border-gray-300 text-gray-500 hover:bg-gray-50">
              ✕ Prikaži vse
            </button>
          )}
        </div>

        {/* Seznam rokov */}
        {(() => {
          const filteredDeadlines = selectedCategory
            ? deadlines.filter(d => d.category === selectedCategory)
            : deadlines
          return filteredDeadlines.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-4">✅</div>
            <h3 className="font-semibold text-gray-900 mb-2">Ni rokov ta mesec</h3>
            <p className="text-gray-500 text-sm">Ta mesec ni posebnih davčnih obveznosti</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDeadlines.map(deadline => {
              const isDone = done[deadline.id] || false
              const urgency = getUrgency(deadline.date, isDone)
              const daysLeft = getDaysLeft(deadline.date)

              return (
                <div key={deadline.id}
                  className={`rounded-2xl border border-gray-100 p-5 transition-all ${urgencyStyles[urgency]}`}>
                  <div className="flex items-start gap-4">
                    {/* Checkbox */}
                    <button onClick={() => toggleDone(deadline.id)}
                      className={`w-6 h-6 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${isDone ? 'bg-gray-900 border-gray-900' : 'border-gray-300 hover:border-gray-500'}`}>
                      {isDone && <span className="text-white text-xs">✓</span>}
                    </button>

                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className={`font-medium text-sm ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                            {deadline.title}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">{deadline.description}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`text-xs font-mono font-medium ${
                            urgency === 'overdue' ? 'text-red-600' :
                            urgency === 'urgent' ? 'text-orange-600' :
                            urgency === 'soon' ? 'text-yellow-700' :
                            'text-gray-500'
                          }`}>
                            {new Date(deadline.date).toLocaleDateString('sl-SI')}
                          </div>
                          <div className={`text-xs mt-0.5 ${
                            urgency === 'overdue' ? 'text-red-500' :
                            urgency === 'urgent' ? 'text-orange-500' :
                            urgency === 'done' ? 'text-gray-400' :
                            'text-gray-400'
                          }`}>
                            {isDone ? 'Opravljeno' :
                             urgency === 'overdue' ? `${Math.abs(daysLeft)} dni zamude!` :
                             daysLeft === 0 ? 'Danes!' :
                             `${daysLeft} dni`}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[deadline.category]}`}>
                          {CATEGORY_LABELS[deadline.category]}
                        </span>
                        {deadline.link && !isDone && (
                          <Link href={deadline.link}
                            className="text-xs text-gray-500 hover:text-gray-900 underline">
                            Odpri →
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
        })()}

        {/* Letni pregled rokov */}
        <div className="bg-gray-900 rounded-2xl p-5 mt-6 text-white">
          <div className="font-medium text-sm mb-3">📅 Ključni letni roki</div>
          <div className="space-y-2 text-xs text-gray-400">
            <div className="flex justify-between">
              <span>Prispevki s.p.</span>
              <span className="text-white">Do 15. vsak mesec</span>
            </div>
            <div className="flex justify-between">
              <span>Akontacija dohodnine</span>
              <span className="text-white">Do 15. vsak mesec</span>
            </div>
            {hasEmployees && (
              <div className="flex justify-between">
                <span>REK-1 + plača</span>
                <span className="text-white">Pred vsako izplačilom</span>
              </div>
            )}
            {org?.vat_registered && (
              <>
                <div className="flex justify-between">
                  <span>DDV-O Q1</span>
                  <span className="text-white">Do 30. aprila</span>
                </div>
                <div className="flex justify-between">
                  <span>DDV-O Q2</span>
                  <span className="text-white">Do 31. julija</span>
                </div>
                <div className="flex justify-between">
                  <span>DDV-O Q3</span>
                  <span className="text-white">Do 31. oktobra</span>
                </div>
                <div className="flex justify-between">
                  <span>DDV-O Q4</span>
                  <span className="text-white">Do 31. januarja</span>
                </div>
              </>
            )}
            {hasEmployees && (
              <div className="flex justify-between">
                <span>Regres</span>
                <span className="text-white">Do 1. julija</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>DDD napoved</span>
              <span className="text-white">Do 31. marca</span>
            </div>
            <div className="flex justify-between">
              <span>Popis zaloge</span>
              <span className="text-white">31. december</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    </AppLayout>
  )
}