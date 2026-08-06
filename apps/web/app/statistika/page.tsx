'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import { getActiveMembership } from '@/lib/active-org'

const MONTHS = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Avg','Sep','Okt','Nov','Dec']
const COLORS_CAT = ['#3B6D11','#1D9E75','#EF9F27','#D4537E','#7F77DD','#D85A30','#888780']

function StatCard({ label, value, sub, color }: any) {
  return (
    <div style={{ background:'#fff', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:'12px', padding:'16px 18px' }}>
      <div style={{ fontSize:'10px', color:'#888', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'6px' }}>{label}</div>
      <div style={{ fontSize:'24px', fontWeight:'500', color: color || '#0D1F12', letterSpacing:'-0.5px' }}>{value}</div>
      {sub && <div style={{ fontSize:'11px', color:'#888', marginTop:'4px' }}>{sub}</div>}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background:'#fff', border:'0.5px solid rgba(0,0,0,0.1)', borderRadius:'8px', padding:'10px 14px', fontSize:'12px' }}>
        <div style={{ fontWeight:'500', marginBottom:'6px', color:'#0D1F12' }}>{label}</div>
        {payload.map((p: any) => (
          <div key={p.name} style={{ color: p.color, marginBottom:'2px' }}>
            {p.name}: €{Number(p.value || 0).toFixed(0)}
          </div>
        ))}
      </div>
    )
  }
  return null
}

export default function StatistikaPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'3m'|'ytd'|'year'>('ytd')
  const [monthlyData, setMonthlyData] = useState<any[]>([])
  const [categoryData, setCategoryData] = useState<any[]>([])
  const [pieData, setPieData] = useState<any[]>([])
  const [invoiceStats, setInvoiceStats] = useState({ total:0, paid:0, unpaid:0, overdue:0 })
  const [totals, setTotals] = useState({ revenue:0, expenses:0, profit:0, avgMonth:0 })
  const supabase = createClient()
  const now = new Date()
  const currentYear = now.getFullYear()

  useEffect(() => { load() }, [period])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
    if (!member) return
    const o = (member as any).organizations
    setOrg(o)

    const yearStart = `${currentYear}-01-01`
    const yearEnd = `${currentYear}-12-31`
    const today = now.toISOString().split('T')[0]

    const [invRes, expRes, kpoIncRes, kpoExpRes] = await Promise.all([
      supabase.from('issued_invoices').select('*').eq('org_id', o.id)
        .neq('status','draft').gte('issue_date', yearStart).lte('issue_date', yearEnd),
      supabase.from('receipts').select('*').eq('org_id', o.id)
        .gte('receipt_date', yearStart).lte('receipt_date', yearEnd),
      // DODANO (30.7.2026): KPO prihodki (POS, banka, kartice...) - SAMO
      // brez invoice_id (izognemo se dvojnemu stetju s placili ze
      // prestetih racunov, ista varovalka kot povsod drugod danes).
      supabase.from('kpo_entries').select('income, entry_date').eq('org_id', o.id)
        .eq('entry_type', 'income').is('invoice_id', null)
        .gte('entry_date', yearStart).lte('entry_date', yearEnd),
      // DODANO (30.7.2026): KPO stroski, simetricno - SAMO brez receipt_id.
      supabase.from('kpo_entries').select('expense, entry_date').eq('org_id', o.id)
        .eq('entry_type', 'expense').is('receipt_id', null)
        .gte('entry_date', yearStart).lte('entry_date', yearEnd),
    ])

    const invoices = invRes.data || []
    const receipts = expRes.data || []
    const kpoIncomeOnly = kpoIncRes.data || []
    const kpoExpenseOnly = kpoExpRes.data || []

    // Mesečni podatki
    const allMonthly = MONTHS.map((name, i) => {
      const m = String(i+1).padStart(2,'0')
      const monthStr = `${currentYear}-${m}`
      const rev = invoices
        .filter((inv: any) => inv.issue_date?.startsWith(monthStr))
        .reduce((s: number, inv: any) => s + Number(inv.amount_net), 0)
        + kpoIncomeOnly
        .filter((e: any) => e.entry_date?.startsWith(monthStr))
        .reduce((s: number, e: any) => s + Number(e.income || 0), 0)
      const exp = receipts
        .filter((r: any) => r.receipt_date?.startsWith(monthStr))
        .reduce((s: number, r: any) => s + Number(r.amount_net), 0)
        + kpoExpenseOnly
        .filter((e: any) => e.entry_date?.startsWith(monthStr))
        .reduce((s: number, e: any) => s + Number(e.expense || 0), 0)
      return {
        name,
        Prihodki: Math.round(rev),
        Odhodki: Math.round(exp),
        Dobiček: Math.round(rev - exp),
        isFuture: i > now.getMonth(),
      }
    })

    let filtered = allMonthly
    if (period === '3m') {
      const start = Math.max(0, now.getMonth() - 2)
      filtered = allMonthly.slice(start, now.getMonth() + 1)
    } else if (period === 'ytd') {
      filtered = allMonthly.slice(0, now.getMonth() + 1)
    }
    setMonthlyData(filtered)

    // Kategorije
    const catMap: Record<string, number> = {}
    receipts.forEach((r: any) => {
      const cat = r.category || 'Drugo'
      catMap[cat] = (catMap[cat] || 0) + Number(r.amount_net)
    })
    setCategoryData(
      Object.entries(catMap)
        .map(([name, value]) => ({ name, value: Math.round(value as number) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6)
    )

    // Invoice stats
    const totalAmt = invoices.reduce((s: number, i: any) => s + Number(i.amount_total), 0)
    const paidAmt = invoices.filter((i: any) => i.status === 'paid').reduce((s: number, i: any) => s + Number(i.amount_total), 0)
    const overdueAmt = invoices.filter((i: any) => i.status === 'sent' && i.due_date < today).reduce((s: number, i: any) => s + Number(i.amount_total), 0)
    const unpaidAmt = invoices.filter((i: any) => i.status === 'sent').reduce((s: number, i: any) => s + Number(i.amount_total), 0)
    setInvoiceStats({ total: Math.round(totalAmt), paid: Math.round(paidAmt), unpaid: Math.round(unpaidAmt), overdue: Math.round(overdueAmt) })
    setPieData([
      { name:'Plačano', value: Math.round(paidAmt), color:'#3B6D11' },
      { name:'Čaka', value: Math.round(unpaidAmt - overdueAmt), color:'#EF9F27' },
      { name:'Zamuda', value: Math.round(overdueAmt), color:'#E24B4A' },
    ].filter(d => d.value > 0))

    // Skupno
    const totalRev = filtered.reduce((s, m) => s + m.Prihodki, 0)
    const totalExp = filtered.reduce((s, m) => s + m.Odhodki, 0)
    const monthCount = filtered.length
    setTotals({
      revenue: Math.round(totalRev),
      expenses: Math.round(totalExp),
      profit: Math.round(totalRev - totalExp),
      avgMonth: monthCount > 0 ? Math.round(totalRev / monthCount) : 0,
    })

    setLoading(false)
  }

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#f9fafb"}}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
        <div style={{ fontSize:'14px', color:'#888' }}>Nalagam...</div>
      </div>
    </div>
  )

  return (
    <div style={{minHeight:"100vh",background:"#f9fafb"}}>
      {/* Topbar */}
      <div style={{ background:'#fff', borderBottom:'0.5px solid rgba(0,0,0,0.08)', padding:'16px 28px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:10 }}>
        <div>
          <a href='/dashboard' style={{ display:'inline-flex', alignItems:'center', gap:'6px', fontSize:'13px', color:'var(--rk-ink-3)', textDecoration:'none', marginBottom:'6px', fontFamily:'var(--rk-font-mono)' }}>← Domov</a>
          <div style={{ fontSize:'22px', fontWeight:'500', color:'#0D1F12' }}>Statistika</div>
          <div style={{ fontSize:'12px', color:'#888', marginTop:'2px' }}>{org?.name} · {currentYear}</div>
        </div>
        <div style={{ display:'flex', gap:'4px', background:'#F7F6F2', borderRadius:'8px', padding:'3px' }}>
          {(['3m','ytd','year'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              fontSize:'12px', padding:'5px 14px', borderRadius:'6px', border:'none', cursor:'pointer',
              background: period === p ? '#fff' : 'transparent',
              color: period === p ? '#0D1F12' : '#888',
              fontWeight: period === p ? '500' : '400',
            }}>
              {p === '3m' ? '3M' : p === 'ytd' ? 'YTD' : 'Leto'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:'24px 28px' }}>

        {/* Summary cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px', marginBottom:'24px' }}>
          <StatCard label="Prihodki" value={`€${totals.revenue.toLocaleString()}`} sub="Brez DDV" color="#27500A" />
          <StatCard label="Odhodki" value={`€${totals.expenses.toLocaleString()}`} sub="Brez DDV" color="#A32D2D" />
          <StatCard label="Dobiček" value={`€${totals.profit.toLocaleString()}`} sub="Prihodki − odhodki" color={totals.profit >= 0 ? '#0D1F12' : '#A32D2D'} />
          <StatCard label="Povprečje/mes" value={`€${totals.avgMonth.toLocaleString()}`} sub="Prihodki" color="#0D1F12" />
        </div>

        {/* Bar chart */}
        <div style={{ background:'#fff', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:'12px', padding:'20px', marginBottom:'16px' }}>
          <div style={{ fontSize:'13px', fontWeight:'500', color:'#0D1F12', marginBottom:'20px' }}>
            Prihodki in odhodki po mesecih
          </div>
          {monthlyData.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px', color:'#888', fontSize:'12px' }}>Ni podatkov</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} barGap={2} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize:11, fill:'#888' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:11, fill:'#888' }} axisLine={false} tickLine={false} tickFormatter={v => `€${v}`} width={55} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize:'11px', paddingTop:'8px' }} />
                <Bar dataKey="Prihodki" fill="#3B6D11" radius={[3,3,0,0]} maxBarSize={24} />
                <Bar dataKey="Odhodki" fill="#F09595" radius={[3,3,0,0]} maxBarSize={24} />
                <Bar dataKey="Dobiček" fill="#EF9F27" radius={[3,3,0,0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bottom grid */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>

          {/* Categories */}
          <div style={{ background:'#fff', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:'12px', padding:'20px' }}>
            <div style={{ fontSize:'13px', fontWeight:'500', color:'#0D1F12', marginBottom:'16px' }}>Odhodki po kategorijah</div>
            {categoryData.length === 0 ? (
              <div style={{ textAlign:'center', padding:'30px', color:'#888', fontSize:'12px' }}>Ni stroškov</div>
            ) : (
              categoryData.map((cat, i) => {
                const max = categoryData[0].value
                const pct = Math.round((cat.value / max) * 100)
                return (
                  <div key={cat.name} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'7px 0', borderBottom: i < categoryData.length-1 ? '0.5px solid rgba(0,0,0,0.05)' : 'none' }}>
                    <div style={{ width:'8px', height:'8px', borderRadius:'2px', background: COLORS_CAT[i], flexShrink:0 }}></div>
                    <div style={{ fontSize:'12px', flex:1 }}>{cat.name}</div>
                    <div style={{ width:'80px', height:'4px', background:'#F1EFE8', borderRadius:'2px' }}>
                      <div style={{ width:`${pct}%`, height:'4px', background: COLORS_CAT[i], borderRadius:'2px' }}></div>
                    </div>
                    <div style={{ fontSize:'12px', fontWeight:'500', minWidth:'50px', textAlign:'right' }}>€{cat.value}</div>
                  </div>
                )
              })
            )}
          </div>

          {/* Invoice pie */}
          <div style={{ background:'#fff', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:'12px', padding:'20px' }}>
            <div style={{ fontSize:'13px', fontWeight:'500', color:'#0D1F12', marginBottom:'16px' }}>Pregled računov {currentYear}</div>
            {invoiceStats.total === 0 ? (
              <div style={{ textAlign:'center', padding:'30px', color:'#888', fontSize:'12px' }}>Ni računov</div>
            ) : (
              <div style={{ display:'flex', gap:'20px', alignItems:'center' }}>
                <PieChart width={130} height={130}>
                  <Pie data={pieData} cx={60} cy={60} innerRadius={38} outerRadius={58} dataKey="value" strokeWidth={0}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
                <div style={{ flex:1 }}>
                  <div style={{ marginBottom:'12px' }}>
                    <div style={{ fontSize:'10px', color:'#888', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'2px' }}>Skupaj fakturirano</div>
                    <div style={{ fontSize:'18px', fontWeight:'500' }}>€{invoiceStats.total.toLocaleString()}</div>
                  </div>
                  {pieData.map((d, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'5px' }}>
                      <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:d.color, flexShrink:0 }}></div>
                      <div style={{ fontSize:'11px', color:'#888', flex:1 }}>{d.name}</div>
                      <div style={{ fontSize:'11px', fontWeight:'500' }}>€{d.value.toLocaleString()}</div>
                    </div>
                  ))}
                  {invoiceStats.overdue > 0 && (
                    <div style={{ marginTop:'8px', background:'#FCEBEB', borderRadius:'6px', padding:'5px 8px', fontSize:'10px', color:'#A32D2D' }}>
                      ⚠️ €{invoiceStats.overdue.toLocaleString()} v zamudi
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}