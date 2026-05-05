'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import AppLayout from '@/components/AppLayout'

const MONTHS = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Avg','Sep','Okt','Nov','Dec']

export default function DashboardPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    revenue: 0, expenses: 0, vatDue: 0,
    unpaidCount: 0, unpaidAmount: 0,
    overdueInvoices: [] as any[],
    recentInvoices: [] as any[],
    hasEmployees: false,
  })
  const supabase = createClient()
  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()
  const monthStart = `${year}-${String(month+1).padStart(2,'0')}-01`
  const monthEnd = `${year}-${String(month+1).padStart(2,'0')}-${new Date(year,month+1,0).getDate()}`
  const today = now.toISOString().split('T')[0]
  const daysUntil15 = 15 - now.getDate()
  const ddvMonths = [4,7,10,1]
  const showDDVAlert = ddvMonths.includes(month+1)
  const ddvQuarter = Math.ceil((month+1)/3)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: member } = await supabase
      .from('org_members').select('organizations(*)')
      .eq('user_id', user.id).single()
    if (!member) return
    const o = (member as any).organizations
    setOrg(o)
    const [invRes, expRes, empRes] = await Promise.all([
      supabase.from('issued_invoices').select('*').eq('org_id', o.id).neq('status','draft'),
      supabase.from('receipts').select('*').eq('org_id', o.id),
      supabase.from('employees').select('id').eq('org_id', o.id).eq('status','active'),
    ])
    const invoices = invRes.data || []
    const receipts = expRes.data || []
    const monthInv = invoices.filter((i: any) => i.issue_date >= monthStart && i.issue_date <= monthEnd)
    const revenue = monthInv.reduce((s: number, i: any) => s + Number(i.amount_net), 0)
    const expenses = receipts
      .filter((r: any) => r.receipt_date >= monthStart && r.receipt_date <= monthEnd)
      .reduce((s: number, r: any) => s + Number(r.amount_net), 0)
    const vatOut = invoices.reduce((s: number, i: any) => s + Number(i.vat_amount), 0)
    const vatIn = receipts.reduce((s: number, r: any) => s + Number(r.vat_amount), 0)
    const unpaid = invoices.filter((i: any) => i.status === 'sent')
    const overdue = invoices.filter((i: any) => i.status === 'sent' && i.due_date < today)
    const recent = [...invoices]
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 4)
    setData({
      revenue, expenses,
      vatDue: Math.max(0, vatOut - vatIn),
      unpaidCount: unpaid.length,
      unpaidAmount: unpaid.reduce((s: number, i: any) => s + Number(i.amount_total), 0),
      overdueInvoices: overdue.slice(0, 3),
      recentInvoices: recent,
      hasEmployees: (empRes.data || []).length > 0,
    })
    setLoading(false)
  }

  if (loading) return (
    <AppLayout>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
        <div style={{ fontSize:'14px', color:'#888' }}>Nalagam...</div>
      </div>
    </AppLayout>
  )

  return (
    <AppLayout org={org}>
      {/* Topbar */}
      <div style={{ background:'#fff', borderBottom:'0.5px solid rgba(0,0,0,0.08)', padding:'14px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:10 }}>
        <div>
          <div style={{ fontSize:'20px', fontWeight:'500', color:'#0D1F12' }}>
            Dober dan, {org?.name?.split(' ')[0]} 👋
          </div>
          <div style={{ fontSize:'11px', color:'#888', marginTop:'2px' }}>
            {MONTHS[month]} {year} · {org?.name}
          </div>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <Link href="/statistika" style={{ textDecoration:'none' }}>
            <div style={{ background:'#EAF3DE', color:'#27500A', fontSize:'12px', padding:'6px 14px', borderRadius:'20px', fontWeight:'500' }}>
              📊 Statistika
            </div>
          </Link>
          <Link href="/invoices/new" style={{ textDecoration:'none' }}>
            <div style={{ background:'#0D1F12', color:'#fff', fontSize:'12px', padding:'6px 14px', borderRadius:'20px', fontWeight:'500' }}>
              + Nov račun
            </div>
          </Link>
        </div>
      </div>

      {/* Alerts */}
      <div style={{ padding:'0 24px' }}>
        {daysUntil15 >= 0 && daysUntil15 <= 7 && (
          <div style={{ background:'#FEF3C7', border:'0.5px solid #FDE68A', borderRadius:'10px', padding:'9px 14px', display:'flex', alignItems:'center', gap:'10px', marginTop:'14px' }}>
            <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#D97706', flexShrink:0 }}></div>
            <div style={{ fontSize:'12px', color:'#92400E', flex:1 }}>Prispevki s.p. zapadejo v <strong>{daysUntil15} dneh</strong> (15. {MONTHS[month]})</div>
            <Link href="/prispevki" style={{ textDecoration:'none', fontSize:'12px', color:'#D97706', fontWeight:'500' }}>Plačaj →</Link>
          </div>
        )}
        {data.overdueInvoices.length > 0 && (
          <div style={{ background:'#FCEBEB', border:'0.5px solid #F7C1C1', borderRadius:'10px', padding:'9px 14px', display:'flex', alignItems:'center', gap:'10px', marginTop:'8px' }}>
            <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#E24B4A', flexShrink:0 }}></div>
            <div style={{ fontSize:'12px', color:'#7f1d1d', flex:1 }}><strong>{data.overdueInvoices.length} računov</strong> je v zamudi</div>
            <Link href="/opomniki" style={{ textDecoration:'none', fontSize:'12px', color:'#A32D2D', fontWeight:'500' }}>Opomniki →</Link>
          </div>
        )}
        {showDDVAlert && org?.vat_registered && (
          <div style={{ background:'#E6F1FB', border:'0.5px solid #B5D4F4', borderRadius:'10px', padding:'9px 14px', display:'flex', alignItems:'center', gap:'10px', marginTop:'8px' }}>
            <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#378ADD', flexShrink:0 }}></div>
            <div style={{ fontSize:'12px', color:'#042C53', flex:1 }}>DDV-O obračun Q{ddvQuarter} je treba oddati ta mesec</div>
            <Link href="/ddv/evidenca" style={{ textDecoration:'none', fontSize:'12px', color:'#185FA5', fontWeight:'500' }}>Pripravi →</Link>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding:'16px 24px' }}>

        {/* Stats 2x2 */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'14px' }}>
          <div style={{ background:'#fff', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:'12px', padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:'10px', color:'#888', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'6px' }}>Prihodki {MONTHS[month]}</div>
              <div style={{ fontSize:'26px', fontWeight:'500', color:'#27500A', letterSpacing:'-0.5px' }}>€{data.revenue.toFixed(0)}</div>
              <div style={{ fontSize:'11px', color:'#888', marginTop:'4px' }}>Brez DDV</div>
            </div>
            <div style={{ width:'38px', height:'38px', borderRadius:'10px', background:'#EAF3DE', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px' }}>💰</div>
          </div>

          <div style={{ background:'#fff', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:'12px', padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:'10px', color:'#888', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'6px' }}>Odhodki {MONTHS[month]}</div>
              <div style={{ fontSize:'26px', fontWeight:'500', color:'#A32D2D', letterSpacing:'-0.5px' }}>€{data.expenses.toFixed(0)}</div>
              <div style={{ fontSize:'11px', color:'#888', marginTop:'4px' }}>Brez DDV</div>
            </div>
            <div style={{ width:'38px', height:'38px', borderRadius:'10px', background:'#FCEBEB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px' }}>🧾</div>
          </div>

          <div style={{ background:'#0D1F12', borderRadius:'12px', padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'6px' }}>Neplačano</div>
              <div style={{ fontSize:'26px', fontWeight:'500', color:'#9FE1CB', letterSpacing:'-0.5px' }}>€{data.unpaidAmount.toFixed(0)}</div>
              <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)', marginTop:'4px' }}>{data.unpaidCount} računov čaka</div>
            </div>
            <Link href="/invoices" style={{ textDecoration:'none' }}>
              <div style={{ background:'rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.7)', fontSize:'11px', padding:'6px 12px', borderRadius:'20px' }}>Poglej →</div>
            </Link>
          </div>

          <div style={{ background:'#fff', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:'12px', padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:'10px', color:'#888', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'6px' }}>DDV dolg</div>
              <div style={{ fontSize:'26px', fontWeight:'500', color: data.vatDue > 0 ? '#854F0B' : '#27500A', letterSpacing:'-0.5px' }}>€{data.vatDue.toFixed(0)}</div>
              <div style={{ fontSize:'11px', color:'#888', marginTop:'4px' }}>{org?.vat_registered ? 'DDV zavezanec' : 'Ni zavezanec'}</div>
            </div>
            <Link href="/ddv" style={{ textDecoration:'none' }}>
              <div style={{ background:'#F7F6F2', color:'#888', fontSize:'11px', padding:'6px 12px', borderRadius:'20px' }}>DDV →</div>
            </Link>
          </div>
        </div>

        {/* Middle grid */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' }}>

          <div style={{ background:'#fff', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:'12px', padding:'14px 16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
              <div style={{ fontSize:'12px', fontWeight:'500', color:'#0D1F12' }}>Zadnji računi</div>
              <Link href="/invoices" style={{ textDecoration:'none', fontSize:'11px', color:'#3B6D11' }}>Vsi →</Link>
            </div>
            {data.recentInvoices.length === 0 ? (
              <div style={{ textAlign:'center', padding:'16px', color:'#888', fontSize:'12px' }}>
                <div>Ni računov</div>
                <Link href="/invoices/new" style={{ color:'#3B6D11', fontSize:'11px' }}>+ Ustvari prvega</Link>
              </div>
            ) : data.recentInvoices.map((inv: any, i: number) => (
              <div key={inv.id} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'7px 0', borderBottom: i < data.recentInvoices.length-1 ? '0.5px solid rgba(0,0,0,0.05)' : 'none' }}>
                <div style={{ width:'7px', height:'7px', borderRadius:'50%', flexShrink:0, background: inv.status === 'paid' ? '#3B6D11' : inv.due_date < today ? '#E24B4A' : '#EF9F27' }}></div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'12px', color:'#0D1F12', fontWeight:'500', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{inv.client_name}</div>
                  <div style={{ fontSize:'10px', color:'#888' }}>#{inv.invoice_number}</div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:'12px', fontWeight:'500' }}>€{Number(inv.amount_total).toFixed(0)}</div>
                  <div style={{ fontSize:'10px', color: inv.status === 'paid' ? '#3B6D11' : '#854F0B' }}>
                    {inv.status === 'paid' ? 'Plačano' : 'Poslano'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background:'#fff', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:'12px', padding:'14px 16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
              <div style={{ fontSize:'12px', fontWeight:'500', color:'#0D1F12' }}>Roki ta mesec</div>
              <Link href="/rokovnik" style={{ textDecoration:'none', fontSize:'11px', color:'#3B6D11' }}>Vsi →</Link>
            </div>
            {[
              { name:'Prispevki s.p.', date:`15. ${MONTHS[month]}`, days:daysUntil15, href:'/prispevki' },
              { name:'Akontacija dohodnine', date:`15. ${MONTHS[month]}`, days:daysUntil15, href:'/dohodnina' },
              ...(data.hasEmployees ? [{ name:'REK-1 + plača', date:`25. ${MONTHS[month]}`, days:25-now.getDate(), href:'/rek1' }] : []),
              ...(showDDVAlert && org?.vat_registered ? [{ name:`DDV-O Q${ddvQuarter}`, date:`Konec ${MONTHS[month]}`, days:new Date(year,month+1,0).getDate()-now.getDate(), href:'/ddv/evidenca' }] : []),
            ].map((item, i, arr) => (
              <Link key={i} href={item.href} style={{ textDecoration:'none' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0', borderBottom: i < arr.length-1 ? '0.5px solid rgba(0,0,0,0.05)' : 'none' }}>
                  <div>
                    <div style={{ fontSize:'12px', color:'#0D1F12', fontWeight:'500' }}>{item.name}</div>
                    <div style={{ fontSize:'10px', color:'#888' }}>{item.date}</div>
                  </div>
                  <div style={{
                    fontSize:'10px', padding:'3px 9px', borderRadius:'20px', fontWeight:'500',
                    background: item.days <= 3 ? '#FCEBEB' : item.days <= 7 ? '#FAEEDA' : '#EAF3DE',
                    color: item.days <= 3 ? '#A32D2D' : item.days <= 7 ? '#854F0B' : '#27500A',
                  }}>
                    {item.days <= 0 ? 'Danes!' : `${item.days} dni`}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Quick actions — 2 vrstici x 3 */}
        <div style={{ background:'#fff', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:'12px', padding:'14px 16px' }}>
          <div style={{ fontSize:'12px', fontWeight:'500', color:'#0D1F12', marginBottom:'12px' }}>Hitre akcije</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' }}>
            {[
              { href:'/invoices/new', icon:'📄', label:'Nov račun', sub:'Izstavite takoj' },
              { href:'/scan', icon:'📸', label:'Skeniraj račun', sub:'AI OCR' },
              { href:'/prispevki', icon:'💳', label:'Prispevki QR', sub:'ZPIZ + ZZZS' },
              { href:'/expenses', icon:'🧾', label:'Dodaj strošek', sub:'Prejeti računi' },
              { href:'/ai', icon:'🤖', label:'AI računovodja', sub:'Vprašajte karkoli' },
              { href:'/statistika', icon:'📊', label:'Statistika', sub:'Pregled leta' },
            ].map(item => (
              <Link key={item.href} href={item.href} style={{ textDecoration:'none' }}>
                <div style={{ background:'#F7F6F2', border:'0.5px solid rgba(0,0,0,0.06)', borderRadius:'10px', padding:'12px 14px', display:'flex', alignItems:'center', gap:'10px' }}>
                  <div style={{ fontSize:'20px', flexShrink:0 }}>{item.icon}</div>
                  <div>
                    <div style={{ fontSize:'12px', color:'#0D1F12', fontWeight:'500' }}>{item.label}</div>
                    <div style={{ fontSize:'10px', color:'#888', marginTop:'1px' }}>{item.sub}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}