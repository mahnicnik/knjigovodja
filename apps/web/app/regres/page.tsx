'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { MIN_WAGE as TC_MIN_WAGE, MIN_REGRES as TC_MIN_REGRES, REGRES_TAX_FREE_LIMIT } from '@/lib/tax-constants'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'

// 2026 zakonski minimumi — POPRAVLJENO 30.7.2026 (audit)
const MIN_WAGE = TC_MIN_WAGE // iz lib/tax-constants.ts
const MIN_REGRES = TC_MIN_REGRES // iz lib/tax-constants.ts

// NEOBDAVČENA MEJA = 100% POVPREČNE mesečne BRUTO plače RS.
// POPRAVLJENO 30.7.2026: prej 1581,29 z opombo "126% min. plače" — to je
// bila napačna metodologija (vezana na minimalno namesto na povprečno
// plačo) IN prenizka vrednost, zaradi česar je aplikacija obdavčila
// regres, ki je v resnici neobdavčen.
//
// ⚠️ TA VREDNOST SE MESEČNO SPREMINJA (objave SURS). Uporabi se zadnji
// znani podatek NA DAN IZPLAČILA. Pred vsakim izplačilom preveri aktualno
// vrednost na SURS oz. pri računovodji.
// Zadnja znana ob popravku: april 2026 = 2.606,09 €, maj 2026 = 2.678,28 €
const MAX_REGRES_TAXFREE = REGRES_TAX_FREE_LIMIT // iz lib/tax-constants.ts (⚠️ gibljivo - preveri pred izplacilom)

function r(v: number) { return Math.round(v * 100) / 100 }

interface Employee {
  id: string
  name: string
  gross_salary: number
  position: string
  employment_type: string
  start_date: string
  annual_leave_days: number
}

interface RegresEntry {
  id: string
  employee_id: string
  year: number
  amount: number
  paid_at: string | null
  status: 'pending' | 'paid'
}

export default function RegresPage() {
  const router = useRouter()
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [entries, setEntries] = useState<RegresEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [customAmounts, setCustomAmounts] = useState<Record<string, number>>({})

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500) }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
      if (!member) return
      setOrgId(member.org_id)

      const [empRes, entryRes] = await Promise.all([
        supabase.from('employees').select('*').eq('org_id', member.org_id).eq('status', 'active').order('full_name'), // POPRAVLJENO 30.7.2026: stolpec je 'full_name', ne 'name' - poizvedba je bila zaradi tega zavrnjena s 400
        supabase.from('regres_entries').select('*').eq('org_id', member.org_id).eq('year', year),
      ])

      setEmployees(empRes.data ?? [])
      setEntries(entryRes.data ?? [])

      // Nastavi default zneske
      const defaults: Record<string, number> = {}
      ;(empRes.data ?? []).forEach((e: Employee) => {
        defaults[e.id] = MAX_REGRES_TAXFREE
      })
      setCustomAmounts(defaults)
      setLoading(false)
    }
    load()
  }, [router, supabase, year])

  // Izračun za posameznega zaposlenega
  function calcRegres(emp: Employee, amount: number) {
    // Proporcionalen izračun glede na čas zaposlitve v letu
    const startDate = new Date(emp.start_date)
    const yearStart = new Date(year, 0, 1)
    const yearEnd = new Date(year, 11, 31)
    const employedFrom = startDate > yearStart ? startDate : yearStart
    const daysEmployed = Math.floor((yearEnd.getTime() - employedFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const daysInYear = 365
    const ratio = Math.min(1, daysEmployed / daysInYear)
    const proportional = r(amount * ratio)
    const taxable = Math.max(0, r(proportional - MAX_REGRES_TAXFREE))
    const taxFree = Math.min(proportional, MAX_REGRES_TAXFREE)
    return { amount: proportional, taxable, taxFree, ratio, fullYear: ratio >= 1 }
  }

  async function saveAll() {
    if (!orgId) return
    // POPRAVLJENO (17.8.2026): varovalka pred DVOJNIM KLIKOM. Stanje "saving" se
    // je nastavljalo, a se NI preverjalo - dvojni klik je torej ustvaril DVA
    // zapisa. Pri stornu, vracilu in prodaji paketa to pomeni podvojen davcni
    // dokument oziroma dvakrat odsteto stanje.
    if (saving) return
    setSaving(true)
    try {
      for (const emp of employees) {
        const existing = entries.find(e => e.employee_id === emp.id)
        const amount = customAmounts[emp.id] ?? MAX_REGRES_TAXFREE
        const calc = calcRegres(emp, amount)

        if (existing) {
          const { error: regUpdErr } = await supabase.from('regres_entries').update({ amount: calc.amount }).eq('id', existing.id)
        if (regUpdErr) throw new Error('Regresa ni bilo mogoče posodobiti: ' + regUpdErr.message)
        } else {
          await supabase.from('regres_entries').insert({
            org_id: orgId,
            employee_id: emp.id,
            year,
            amount: calc.amount,
            status: 'pending',
          })
        }
      }

      const { data } = await supabase.from('regres_entries').select('*').eq('org_id', orgId).eq('year', year)
      setEntries(data ?? [])
      showToast('Regres shranjen')
    } catch (e: any) { showToast(e.message) }
    setSaving(false)
  }

  async function markPaid(employeeId: string) {
    const entry = entries.find(e => e.employee_id === employeeId)
    if (!entry) return
    const { error: regPaidErr } = await supabase.from('regres_entries').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', entry.id)
    // POPRAVLJENO (16.8.2026): prej brez preverbe - regres je ostal neplacan,
    // na zaslonu pa je pisalo, da je placan.
    if (regPaidErr) { showToast('Regresa ni bilo mogoče označiti kot plačanega: ' + regPaidErr.message); return }
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'paid', paid_at: new Date().toISOString() } : e))
    showToast('Regres označen kot plačan')
  }

  const totalRegres = employees.reduce((s, emp) => {
    const amount = customAmounts[emp.id] ?? MAX_REGRES_TAXFREE
    return s + calcRegres(emp, amount).amount
  }, 0)

  const paidCount = entries.filter(e => e.status === 'paid').length

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>Nalagam...</div>

  return (
    <AppLayout>
    <div style={{ minHeight: '100vh', background: '#F7F6F2' }}>
      {/* HEADER */}
      <div style={{ background: '#0D1F12', padding: '20px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#E8B547', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>RAČUNKO · Kadri</div>
            <div style={{ fontSize: 20, color: '#fff', fontWeight: 500, marginTop: 4 }}>Regres {year}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 0, borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y} style={{ color: '#000' }}>{y}</option>)}
            </select>
            <Link href="/rek1" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', padding: '8px 16px', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>← Plače</Link>
          </div>
        </div>

        <div style={{ maxWidth: 900, margin: '16px auto 0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Zaposlenih', value: employees.length, color: '#fff' },
            { label: 'Skupaj regres', value: `€${Math.round(totalRegres)}`, color: '#E8B547' },
            { label: 'Min. regres 2026', value: `€${MIN_REGRES.toFixed(2)}`, color: '#6EE7B7' },
            { label: 'Plačano', value: `${paidCount}/${employees.length}`, color: paidCount === employees.length ? '#6EE7B7' : '#FCD34D' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

        {/* INFO */}
        <div style={{ background: '#E1F5EE', borderRadius: 12, padding: '14px 18px', marginBottom: 16, fontSize: 13, color: '#0E5E3B', lineHeight: 1.6 }}>
          💡 <strong>Regres 2026:</strong> Minimalni regres = minimalna plača (€{MIN_REGRES.toFixed(2)}). Neobdavčen do €{MAX_REGRES_TAXFREE.toFixed(2)} (100% povprečne bruto plače RS) — <strong>ta meja se mesečno spreminja</strong>, pred izplačilom preverite aktualni podatek SURS. Rok izplačila: <strong>do 1. julija</strong> (ali 1. novembra za sezonska dela).
        </div>

        {employees.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', border: '0.5px solid rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0D1F12', marginBottom: 8 }}>Ni aktivnih zaposlenih</div>
            <Link href="/rek1" style={{ background: '#0D1F12', color: '#fff', padding: '12px 24px', borderRadius: 10, fontSize: 14, textDecoration: 'none' }}>Dodaj zaposlenega →</Link>
          </div>
        ) : (
          <>
            <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F7F6F2', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                    {['Zaposleni', 'Zaposleni od', 'Delež leta', 'Znesek regresa', 'Neobdavčeno', 'Obdavčeno', 'Status', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#888', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => {
                    const amount = customAmounts[emp.id] ?? MAX_REGRES_TAXFREE
                    const calc = calcRegres(emp, amount)
                    const entry = entries.find(e => e.employee_id === emp.id)
                    const isPaid = entry?.status === 'paid'
                    return (
                      <tr key={emp.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                        <td style={{ padding: '14px 14px' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0D1F12' }}>{emp.name}</div>
                          <div style={{ fontSize: 11, color: '#888' }}>{emp.position}</div>
                        </td>
                        <td style={{ padding: '14px 14px', fontSize: 12, color: '#666' }}>
                          {new Date(emp.start_date).toLocaleDateString('sl-SI')}
                        </td>
                        <td style={{ padding: '14px 14px' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: calc.fullYear ? '#1D9E75' : '#D97706' }}>
                            {Math.round(calc.ratio * 100)}%
                          </div>
                          {!calc.fullYear && <div style={{ fontSize: 11, color: '#aaa' }}>proporcionalno</div>}
                        </td>
                        <td style={{ padding: '14px 14px' }}>
                          <input
                            type="number" onFocus={e => e.target.select()}
                            step="1"
                            min={MIN_REGRES}
                            value={amount}
                            onChange={e => setCustomAmounts(prev => ({ ...prev, [emp.id]: Number(e.target.value) }))}
                            style={{ width: 100, padding: '6px 8px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13, fontWeight: 600 }}
                            disabled={isPaid}
                          />
                          {amount < MIN_REGRES && (
                            <div style={{ fontSize: 10, color: '#DC2626', marginTop: 2 }}>⚠️ Pod minimumom!</div>
                          )}
                        </td>
                        <td style={{ padding: '14px 14px', fontSize: 13, color: '#1D9E75', fontWeight: 600 }}>
                          €{calc.taxFree.toFixed(2)}
                        </td>
                        <td style={{ padding: '14px 14px', fontSize: 13, color: calc.taxable > 0 ? '#DC2626' : '#888' }}>
                          {calc.taxable > 0 ? `€${calc.taxable.toFixed(2)}` : '—'}
                        </td>
                        <td style={{ padding: '14px 14px' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: isPaid ? '#E1F5EE' : '#FEF3C7', color: isPaid ? '#0E5E3B' : '#D97706' }}>
                            {isPaid ? '✓ Plačan' : 'Čaka'}
                          </span>
                          {entry?.paid_at && <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{new Date(entry.paid_at).toLocaleDateString('sl-SI')}</div>}
                        </td>
                        <td style={{ padding: '14px 10px' }}>
                          {!isPaid && entry && (
                            <button onClick={() => markPaid(emp.id)} style={{ fontSize: 11, fontWeight: 600, color: '#1D9E75', background: '#E1F5EE', border: 0, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              ✓ Plačano
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#F7F6F2', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                    <td colSpan={3} style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: '#0D1F12' }}>SKUPAJ</td>
                    <td style={{ padding: '12px 14px', fontSize: 15, fontWeight: 700, color: '#0D1F12' }}>€{totalRegres.toFixed(2)}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={saveAll} disabled={saving} style={{ background: '#0D1F12', color: '#fff', border: 0, borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Shranjujem...' : '✓ Shrani vse'}
              </button>
            </div>
          </>
        )}

        {/* Zakonske informacije */}
        <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: 20, marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0D1F12', marginBottom: 12 }}>📋 Zakonske obveznosti</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { label: 'Minimalni regres', value: `€${MIN_REGRES.toFixed(2)}`, desc: 'Minimalna plača 2026' },
              { label: 'Neobdavčeni del', value: `€${MAX_REGRES_TAXFREE.toFixed(2)}`, desc: '126% minimalne plače' },
              { label: 'Rok izplačila', value: '1. julij 2026', desc: 'Za sezonske do 1. nov.' },
            ].map(item => (
              <div key={item.label} style={{ background: '#F7F6F2', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0D1F12' }}>{item.value}</div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#0D1F12', color: '#fff', padding: '12px 20px', borderRadius: 999, fontSize: 13, fontWeight: 500, zIndex: 3000 }}>✓ {toast}</div>
      )}
    </div>
    </AppLayout>
  )
}
