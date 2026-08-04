'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'

function fmt(n: number) { return `€${Math.abs(Number(n)).toFixed(2)}` }
function fmtN(n: number) { return n >= 0 ? `€${n.toFixed(2)}` : `-€${Math.abs(n).toFixed(2)}` }

const MONTHS = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Avg','Sep','Okt','Nov','Dec']
const MONTHS_LONG = ['Januar','Februar','Marec','April','Maj','Junij','Julij','Avgust','September','Oktober','November','December']

interface MonthData {
  month: number
  revenue: number
  expenses: number
  profit: number
  vatOut: number
  vatIn: number
}

export default function PoslovnaPorocila() {
  const router = useRouter()
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [tab, setTab] = useState<'izkaz'|'mesecno'|'stranke'|'kategorije'>('izkaz')

  const [monthlyData, setMonthlyData] = useState<MonthData[]>([])
  const [clientData, setClientData] = useState<{ name: string; revenue: number; invoices: number }[]>([])
  const [categoryData, setCategoryData] = useState<{ category: string; amount: number; count: number }[]>([])
  const [totals, setTotals] = useState({ revenue: 0, expenses: 0, profit: 0, vatOut: 0, vatIn: 0, vatDue: 0 })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
      if (!member) return
      setOrgId(member.org_id)

      const { data: orgData } = await supabase.from('organizations').select('*').eq('id', member.org_id).single()
      setOrg(orgData)

      const yearStart = `${year}-01-01`
      const yearEnd = `${year}-12-31`

      const [invRes, expRes] = await Promise.all([
        supabase.from('issued_invoices').select('*').eq('org_id', member.org_id).gte('issue_date', yearStart).lte('issue_date', yearEnd).neq('status', 'draft'),
        supabase.from('receipts').select('*').eq('org_id', member.org_id).gte('receipt_date', yearStart).lte('receipt_date', yearEnd),
      ])

      const invoices = invRes.data ?? []
      const receipts = expRes.data ?? []

      // Mesečni podatki
      const monthly: MonthData[] = Array.from({ length: 12 }, (_, i) => {
        const monthStr = String(i + 1).padStart(2, '0')
        const monthInv = invoices.filter(inv => inv.issue_date.startsWith(`${year}-${monthStr}`))
        const monthExp = receipts.filter(r => r.receipt_date.startsWith(`${year}-${monthStr}`))
        const revenue = monthInv.reduce((s, i) => s + Number(i.amount_net), 0)
        const expenses = monthExp.reduce((s, r) => s + Number(r.amount_net ?? 0), 0)
        const vatOut = monthInv.reduce((s, i) => s + Number(i.vat_amount), 0)
        const vatIn = monthExp.reduce((s, r) => s + Number(r.vat_amount ?? 0), 0)
        return { month: i, revenue, expenses, profit: revenue - expenses, vatOut, vatIn }
      })
      setMonthlyData(monthly)

      // Skupni seštevki
      const totalRevenue = monthly.reduce((s, m) => s + m.revenue, 0)
      const totalExpenses = monthly.reduce((s, m) => s + m.expenses, 0)
      const totalVatOut = monthly.reduce((s, m) => s + m.vatOut, 0)
      const totalVatIn = monthly.reduce((s, m) => s + m.vatIn, 0)
      setTotals({
        revenue: totalRevenue,
        expenses: totalExpenses,
        profit: totalRevenue - totalExpenses,
        vatOut: totalVatOut,
        vatIn: totalVatIn,
        vatDue: Math.max(0, totalVatOut - totalVatIn),
      })

      // Po strankah
      const clientMap: Record<string, { revenue: number; invoices: number }> = {}
      invoices.forEach(inv => {
        const name = inv.client_name ?? 'Neznana stranka'
        if (!clientMap[name]) clientMap[name] = { revenue: 0, invoices: 0 }
        clientMap[name].revenue += Number(inv.amount_net)
        clientMap[name].invoices += 1
      })
      setClientData(Object.entries(clientMap).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.revenue - a.revenue))

      // Po kategorijah stroški
      const catMap: Record<string, { amount: number; count: number }> = {}
      receipts.forEach(r => {
        const cat = r.category ?? 'Ostalo'
        if (!catMap[cat]) catMap[cat] = { amount: 0, count: 0 }
        catMap[cat].amount += Number(r.amount_net ?? 0)
        catMap[cat].count += 1
      })
      setCategoryData(Object.entries(catMap).map(([category, d]) => ({ category, ...d })).sort((a, b) => b.amount - a.amount))

      setLoading(false)
    }
    load()
  }, [router, supabase, year])

  const maxMonthRevenue = Math.max(...monthlyData.map(m => Math.max(m.revenue, m.expenses)), 1)

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>Nalagam...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#F7F6F2' }}>
      {/* HEADER */}
      <div style={{ background: '#0D1F12', padding: '20px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#E8B547', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>RAČUNKO · Analitika</div>
            <div style={{ fontSize: 20, color: '#fff', fontWeight: 500, marginTop: 4 }}>Poslovna poročila {year}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 0, borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
              {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y} style={{ color: '#000' }}>{y}</option>)}
            </select>
            <button onClick={() => router.back()} style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', padding: '8px 16px', borderRadius: 8, fontSize: 13, border: 'none', cursor: 'pointer' }}>← Nazaj</button>
          </div>
        </div>

        {/* KPI kartice */}
        <div style={{ maxWidth: 1000, margin: '16px auto 0', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {[
            { label: 'Prihodki', value: fmt(totals.revenue), color: '#6EE7B7' },
            { label: 'Odhodki', value: fmt(totals.expenses), color: '#FCA5A5' },
            { label: 'Dobiček', value: fmtN(totals.profit), color: totals.profit >= 0 ? '#E8B547' : '#FCA5A5' },
            { label: 'DDV dolgovan', value: fmt(totals.vatDue), color: '#FCD34D' },
            { label: 'Marža', value: totals.revenue > 0 ? `${Math.round((totals.profit / totals.revenue) * 100)}%` : '—', color: '#A78BFA' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* TABS */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex' }}>
          {([
            { id: 'izkaz', label: '📊 Izkaz P&L' },
            { id: 'mesecno', label: '📅 Mesečno' },
            { id: 'stranke', label: '👥 Po strankah' },
            { id: 'kategorije', label: '🗂 Po kategorijah' },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ background: 'none', border: 0, borderBottom: tab === t.id ? '2.5px solid #0D1F12' : '2.5px solid transparent', padding: '14px 20px', fontSize: 13, fontWeight: tab === t.id ? 600 : 400, color: tab === t.id ? '#0D1F12' : '#888', cursor: 'pointer' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>

        {/* IZKAZ P&L */}
        {tab === 'izkaz' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Prihodki */}
            <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              <div style={{ background: '#0D1F12', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#E8B547', textTransform: 'uppercase', letterSpacing: '.04em' }}>Prihodki</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#6EE7B7' }}>{fmt(totals.revenue)}</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    { label: 'Prihodki od prodaje (neto)', amount: totals.revenue },
                    { label: 'DDV na prihodke', amount: totals.vatOut },
                    { label: 'Bruto prihodki', amount: totals.revenue + totals.vatOut },
                  ].map((row, i) => (
                    <tr key={i} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)', background: i === 2 ? '#F7F6F2' : '#fff' }}>
                      <td style={{ padding: '12px 20px', fontSize: 13, color: '#666' }}>{row.label}</td>
                      <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: i === 2 ? 700 : 400, textAlign: 'right', color: '#0D1F12' }}>{fmt(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Odhodki */}
            <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              <div style={{ background: '#4A1515', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#FCA5A5', textTransform: 'uppercase', letterSpacing: '.04em' }}>Odhodki</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#FCA5A5' }}>{fmt(totals.expenses)}</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    { label: 'Poslovni stroški (neto)', amount: totals.expenses },
                    { label: 'DDV na stroške (odbitek)', amount: totals.vatIn },
                    { label: 'Bruto stroški', amount: totals.expenses + totals.vatIn },
                  ].map((row, i) => (
                    <tr key={i} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)', background: i === 2 ? '#FEF2F2' : '#fff' }}>
                      <td style={{ padding: '12px 20px', fontSize: 13, color: '#666' }}>{row.label}</td>
                      <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: i === 2 ? 700 : 400, textAlign: 'right', color: '#0D1F12' }}>{fmt(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Rezultat */}
            <div style={{ background: totals.profit >= 0 ? '#0D1F12' : '#4A1515', borderRadius: 14, padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Poslovni izid {year}</span>
                <span style={{ fontSize: 28, fontWeight: 700, color: totals.profit >= 0 ? '#E8B547' : '#FCA5A5' }}>{fmtN(totals.profit)}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {[
                  { label: 'Marža', value: totals.revenue > 0 ? `${Math.round((totals.profit / totals.revenue) * 100)}%` : '—' },
                  { label: 'DDV dolgovan FURS', value: fmt(totals.vatDue) },
                  { label: 'Povp. mesečni dobiček', value: fmtN(totals.profit / 12) },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MESEČNO */}
        {tab === 'mesecno' && (
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            {/* Graf */}
            <div style={{ padding: '20px 24px 8px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1F12', marginBottom: 16 }}>Prihodki vs Odhodki {year}</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 140 }}>
                {monthlyData.map((m, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', gap: 2, alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div style={{ width: '45%', background: '#1D9E75', borderRadius: '2px 2px 0 0', height: `${Math.max(2, (m.revenue / maxMonthRevenue) * 120)}px` }} title={`Prihodki: ${fmt(m.revenue)}`} />
                    <div style={{ width: '45%', background: '#FCA5A5', borderRadius: '2px 2px 0 0', height: `${Math.max(2, (m.expenses / maxMonthRevenue) * 120)}px` }} title={`Stroški: ${fmt(m.expenses)}`} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {monthlyData.map((m, i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: '#aaa', marginTop: 4 }}>{MONTHS[i]}</div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: '#888' }}>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#1D9E75', borderRadius: 2, marginRight: 4 }} />Prihodki</span>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#FCA5A5', borderRadius: 2, marginRight: 4 }} />Odhodki</span>
              </div>
            </div>

            {/* Tabela */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
              <thead>
                <tr style={{ background: '#F7F6F2', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                  {['Mesec', 'Prihodki', 'Odhodki', 'Dobiček', 'Marža', 'DDV'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#888', textAlign: h === 'Mesec' ? 'left' : 'right', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((m, i) => (
                  <tr key={i} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)', background: m.profit < 0 ? '#FEF2F2' : '#fff' }}>
                    <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500 }}>{MONTHS_LONG[i]}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, textAlign: 'right', color: '#1D9E75', fontWeight: m.revenue > 0 ? 600 : 400 }}>{m.revenue > 0 ? fmt(m.revenue) : '—'}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, textAlign: 'right', color: m.expenses > 0 ? '#DC2626' : '#888' }}>{m.expenses > 0 ? fmt(m.expenses) : '—'}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, textAlign: 'right', fontWeight: 600, color: m.profit >= 0 ? '#0D1F12' : '#DC2626' }}>
                      {m.revenue > 0 || m.expenses > 0 ? fmtN(m.profit) : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, textAlign: 'right', color: '#888' }}>
                      {m.revenue > 0 ? `${Math.round((m.profit / m.revenue) * 100)}%` : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, textAlign: 'right', color: '#888' }}>
                      {m.vatOut > 0 ? fmt(Math.max(0, m.vatOut - m.vatIn)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#0D1F12', color: '#fff' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#fff' }}>SKUPAJ</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, textAlign: 'right', fontWeight: 700, color: '#6EE7B7' }}>{fmt(totals.revenue)}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, textAlign: 'right', fontWeight: 700, color: '#FCA5A5' }}>{fmt(totals.expenses)}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, textAlign: 'right', fontWeight: 700, color: totals.profit >= 0 ? '#E8B547' : '#FCA5A5' }}>{fmtN(totals.profit)}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, textAlign: 'right', color: 'rgba(255,255,255,0.6)' }}>
                    {totals.revenue > 0 ? `${Math.round((totals.profit / totals.revenue) * 100)}%` : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, textAlign: 'right', color: '#FCD34D' }}>{fmt(totals.vatDue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* PO STRANKAH */}
        {tab === 'stranke' && (
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            {clientData.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#aaa', fontSize: 14 }}>Ni podatkov za {year}</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F7F6F2', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                    {['#', 'Stranka', 'Prihodki', 'Računi', 'Delež', ''].map(h => (
                      <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#888', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientData.map((c, i) => {
                    const pct = totals.revenue > 0 ? (c.revenue / totals.revenue) * 100 : 0
                    return (
                      <tr key={i} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#aaa', width: 32 }}>{i + 1}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#0D1F12' }}>{c.name}</td>
                        <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 700, color: '#1D9E75' }}>{fmt(c.revenue)}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{c.invoices}</td>
                        <td style={{ padding: '12px 16px', minWidth: 160 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: '#F7F6F2', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: '#1D9E75', borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 12, color: '#888', width: 36, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 11, color: '#aaa' }}>
                          {fmt(c.revenue / c.invoices)}/račun
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* PO KATEGORIJAH */}
        {tab === 'kategorije' && (
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            {categoryData.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#aaa', fontSize: 14 }}>Ni kategorij stroškov za {year}</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F7F6F2', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                    {['Kategorija', 'Znesek', 'Dokumentov', 'Delež stroškov'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#888', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categoryData.map((c, i) => {
                    const pct = totals.expenses > 0 ? (c.amount / totals.expenses) * 100 : 0
                    return (
                      <tr key={i} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#0D1F12' }}>
                          {c.category === 'material' ? '🔧 Material' : c.category === 'storitve' ? '💼 Storitve' : c.category === 'prevoz' ? '🚗 Prevoz' : c.category === 'pisarna' ? '🏢 Pisarna' : c.category === 'reprezentanca' ? '🍽 Reprezentanca' : c.category === 'spletna_prodaja' ? '🛒 Spletna prodaja' : `📋 ${c.category}`}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 700, color: '#DC2626' }}>{fmt(c.amount)}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{c.count}</td>
                        <td style={{ padding: '12px 16px', minWidth: 200 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: '#F7F6F2', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: '#DC2626', borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 12, color: '#888', width: 36, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#F7F6F2', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700 }}>SKUPAJ</td>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 700, color: '#DC2626' }}>{fmt(totals.expenses)}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{categoryData.reduce((s, c) => s + c.count, 0)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
