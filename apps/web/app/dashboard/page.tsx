'use client'
import LegalUpdatesWidget from '@/components/LegalUpdatesWidget'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import AppLayout from '@/components/AppLayout'

const MONTHS = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Avg','Sep','Okt','Nov','Dec']

const ALL_QUICK_ACTIONS = [
  { href:'/invoices/new', icon:'📄', label:'Nov račun', sub:'Izstavite takoj' },
  { href:'/scan', icon:'📸', label:'Skeniraj račun', sub:'AI OCR' },
  { href:'/prispevki', icon:'💳', label:'Prispevki QR', sub:'ZPIZ + ZZZS' },
  { href:'/expenses', icon:'🧾', label:'Dodaj strošek', sub:'Prejeti računi' },
  { href:'/ai', icon:'🤖', label:'AI računovodja', sub:'Vprašajte karkoli' },
  { href:'/statistika', icon:'📊', label:'Statistika', sub:'Pregled leta' },
  { href:'/blagajna', icon:'🏧', label:'Blagajna', sub:'POS terminal' },
  { href:'/kpo', icon:'📒', label:'KPO knjiga', sub:'Evidenca' },
  { href:'/ddv', icon:'🔢', label:'DDV obračun', sub:'Mesečni DDV' },
  { href:'/invoices', icon:'📋', label:'Vsi računi', sub:'Pregled' },
  { href:'/rokovnik', icon:'📅', label:'Rokovnik', sub:'Datumi' },
  { href:'/zaloga', icon:'📦', label:'Zaloga', sub:'Upravljanje' },
]

const DEFAULT_QA_HREFS = ['/invoices/new', '/scan', '/prispevki', '/expenses', '/ai', '/statistika']

export default function DashboardPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showQAModal, setShowQAModal] = useState(false)
  const [qaHrefs, setQaHrefs] = useState<string[]>(DEFAULT_QA_HREFS)
  const [qaHrefsDraft, setQaHrefsDraft] = useState<string[]>(DEFAULT_QA_HREFS)
  const [savingQA, setSavingQA] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
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

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }
      setUserId(user.id)
      
      const { data: member, error: memberErr } = await supabase
        .from('org_members').select('organizations(*)')
        .eq('user_id', user.id).maybeSingle()
      
      if (memberErr) {
        console.error('Member load error:', memberErr)
        setLoading(false)
        return
      }
      
      if (!member || !(member as any).organizations) {
        // User exists but no org — should not happen anymore (trigger fixed)
        // Fallback: redirect to onboarding to create org manually
        console.warn('User has no organization, redirecting to onboarding')
        window.location.href = '/onboarding'
        return
      }
      
      const o = (member as any).organizations
      setOrg(o)
      
      const { data: prefs } = await supabase
        .from('user_preferences').select('quick_actions')
        .eq('user_id', user.id).maybeSingle()
      if (prefs?.quick_actions && prefs.quick_actions.length > 0) {
        setQaHrefs(prefs.quick_actions)
        setQaHrefsDraft(prefs.quick_actions)
      }
      
      const [invRes, expRes, empRes] = await Promise.all([
        supabase.from('issued_invoices').select('*').eq('org_id', o.id).neq('status','draft'),
        supabase.from('receipts').select('*').eq('org_id', o.id),
        supabase.from('employees').select('id').eq('org_id', o.id).eq('status','active'),
      ])
      const invoices = invRes.data || []
      const receipts = expRes.data || []
      const monthInv = invoices.filter((i: any) => i.issue_date >= monthStart && i.issue_date <= monthEnd)
      const revenue = monthInv.reduce((s: number, i: any) => s + Number(i.amount_net), 0)
      const expenses = receipts.filter((r: any) => r.receipt_date >= monthStart && r.receipt_date <= monthEnd).reduce((s: number, r: any) => s + Number(r.amount_net), 0)
      const vatOut = invoices.reduce((s: number, i: any) => s + Number(i.vat_amount), 0)
      const vatIn = receipts.reduce((s: number, r: any) => s + Number(r.vat_amount), 0)
      const unpaid = invoices.filter((i: any) => i.status === 'sent')
      const overdue = invoices.filter((i: any) => i.status === 'sent' && i.due_date < today)
      const recent = [...invoices].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 4)
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
    } catch (err) {
      console.error('Dashboard load failed:', err)
      setLoading(false)
    }
  }

  function toggleDraftQA(href: string) {
    setQaHrefsDraft(prev => prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href])
  }

  async function saveQA() {
    if (!userId) return
    setSavingQA(true)
    await supabase.from('user_preferences').upsert({ user_id: userId, quick_actions: qaHrefsDraft, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    setQaHrefs(qaHrefsDraft)
    setSavingQA(false)
    setShowQAModal(false)
  }

  const activeQA = qaHrefs.map(href => ALL_QUICK_ACTIONS.find(a => a.href === href)).filter(Boolean) as typeof ALL_QUICK_ACTIONS

  const p = isMobile ? '0 14px' : '0 24px'
  const cp = isMobile ? '14px' : '16px 24px'

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
      <div style={{ background:'#fff', borderBottom:'0.5px solid rgba(0,0,0,0.08)', padding: isMobile ? '12px 16px' : '14px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:10 }}>
        <div>
          <div style={{ fontSize: isMobile ? '16px' : '20px', fontWeight:'500', color:'#0D1F12' }}>
            Dober dan, {org?.name?.split(' ')[0]} 👋
          </div>
          <div style={{ fontSize:'11px', color:'#888', marginTop:'2px' }}>
            {MONTHS[month]} {year} · {org?.name}
          </div>
        </div>
        {!isMobile && (
          <div style={{ display:'flex', gap:'8px' }}>
            <Link href="/statistika" style={{ textDecoration:'none' }}>
              <div style={{ background:'#EAF3DE', color:'#27500A', fontSize:'12px', padding:'6px 14px', borderRadius:'20px', fontWeight:'500' }}>📊 Statistika</div>
            </Link>
            <Link href="/invoices/new" style={{ textDecoration:'none' }}>
              <div style={{ background:'#0D1F12', color:'#fff', fontSize:'12px', padding:'6px 14px', borderRadius:'20px', fontWeight:'500' }}>+ Nov račun</div>
            </Link>
          </div>
        )}
      </div>

      {/* Alerts */}
      <div style={{ padding: p }}>
        {daysUntil15 >= 0 && daysUntil15 <= 7 && (
          <div style={{ background:'#FEF3C7', border:'0.5px solid #FDE68A', borderRadius:'10px', padding:'9px 14px', display:'flex', alignItems:'center', gap:'10px', marginTop:'12px' }}>
            <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#D97706', flexShrink:0 }}></div>
            <div style={{ fontSize:'12px', color:'#92400E', flex:1 }}>Prispevki zapadejo čez <strong>{daysUntil15} dni</strong></div>
            <Link href="/prispevki" style={{ textDecoration:'none', fontSize:'12px', color:'#D97706', fontWeight:'500', whiteSpace:'nowrap' }}>Plačaj →</Link>
          </div>
        )}
        {data.overdueInvoices.length > 0 && (
          <div style={{ background:'#FCEBEB', border:'0.5px solid #F7C1C1', borderRadius:'10px', padding:'9px 14px', display:'flex', alignItems:'center', gap:'10px', marginTop:'8px' }}>
            <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#E24B4A', flexShrink:0 }}></div>
            <div style={{ fontSize:'12px', color:'#7f1d1d', flex:1 }}><strong>{data.overdueInvoices.length} računov</strong> v zamudi</div>
            <Link href="/opomniki" style={{ textDecoration:'none', fontSize:'12px', color:'#A32D2D', fontWeight:'500' }}>Opomniki →</Link>
          </div>
        )}
        {showDDVAlert && org?.vat_registered && (
          <div style={{ background:'#E6F1FB', border:'0.5px solid #B5D4F4', borderRadius:'10px', padding:'9px 14px', display:'flex', alignItems:'center', gap:'10px', marginTop:'8px' }}>
            <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#378ADD', flexShrink:0 }}></div>
            <div style={{ fontSize:'12px', color:'#042C53', flex:1 }}>DDV-O Q{ddvQuarter} ta mesec</div>
            <Link href="/ddv/evidenca" style={{ textDecoration:'none', fontSize:'12px', color:'#185FA5', fontWeight:'500' }}>Pripravi →</Link>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: cp }}>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: isMobile ? '8px' : '12px', marginBottom: isMobile ? '10px' : '14px' }}>
          {[
            { label:`Prihodki ${MONTHS[month]}`, value:`€${data.revenue.toFixed(0)}`, sub:'Brez DDV', color:'#27500A', bg:'#EAF3DE', icon:'💰', dark:false },
            { label:`Odhodki ${MONTHS[month]}`, value:`€${data.expenses.toFixed(0)}`, sub:'Brez DDV', color:'#A32D2D', bg:'#FCEBEB', icon:'🧾', dark:false },
            { label:'Neplačano', value:`€${data.unpaidAmount.toFixed(0)}`, sub:`${data.unpaidCount} računov`, color:'#9FE1CB', bg:'rgba(255,255,255,0.1)', icon:null, dark:true, href:'/invoices' },
            { label:'DDV dolg', value:`€${data.vatDue.toFixed(0)}`, sub: org?.vat_registered ? 'DDV zavezanec' : 'Ni zavezanec', color: data.vatDue > 0 ? '#854F0B' : '#27500A', bg:'#F7F6F2', icon:null, dark:false, href:'/ddv' },
          ].map((card, i) => (
            <div key={i} style={{ background: card.dark ? '#0D1F12' : '#fff', border: card.dark ? 'none' : '0.5px solid rgba(0,0,0,0.08)', borderRadius:'12px', padding: isMobile ? '12px 14px' : '14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:'10px', color: card.dark ? 'rgba(255,255,255,0.4)' : '#888', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'4px' }}>{card.label}</div>
                <div style={{ fontSize: isMobile ? '22px' : '26px', fontWeight:'500', color: card.color, letterSpacing:'-0.5px' }}>{card.value}</div>
                <div style={{ fontSize:'10px', color: card.dark ? 'rgba(255,255,255,0.35)' : '#888', marginTop:'3px' }}>{card.sub}</div>
              </div>
              {card.icon && (
                <div style={{ width:'34px', height:'34px', borderRadius:'10px', background: card.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', flexShrink:0 }}>{card.icon}</div>
              )}
              {card.href && !card.icon && (
                <Link href={card.href} style={{ textDecoration:'none' }}>
                  <div style={{ background: card.dark ? 'rgba(255,255,255,0.1)' : '#F7F6F2', color: card.dark ? 'rgba(255,255,255,0.7)' : '#888', fontSize:'11px', padding:'5px 10px', borderRadius:'20px', whiteSpace:'nowrap' }}>→</div>
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Middle grid */}
        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '8px' : '12px', marginBottom: isMobile ? '10px' : '12px' }}>

          <div style={{ background:'#fff', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:'12px', padding:'14px 16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
              <div style={{ fontSize:'12px', fontWeight:'500', color:'#0D1F12' }}>Zadnji računi</div>
              <Link href="/invoices" style={{ textDecoration:'none', fontSize:'11px', color:'#3B6D11' }}>Vsi →</Link>
            </div>
            {data.recentInvoices.length === 0 ? (
              <div style={{ textAlign:'center', padding:'12px', color:'#888', fontSize:'12px' }}>
                <div>Ni računov</div>
                <Link href="/invoices/new" style={{ color:'#3B6D11', fontSize:'11px' }}>+ Ustvari prvega</Link>
              </div>
            ) : data.recentInvoices.slice(0, isMobile ? 3 : 4).map((inv: any, i: number) => (
              <div key={inv.id} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'7px 0', borderBottom: i < (isMobile ? 2 : data.recentInvoices.length-1) ? '0.5px solid rgba(0,0,0,0.05)' : 'none' }}>
                <div style={{ width:'7px', height:'7px', borderRadius:'50%', flexShrink:0, background: inv.status === 'paid' ? '#3B6D11' : inv.due_date < today ? '#E24B4A' : '#EF9F27' }}></div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'12px', color:'#0D1F12', fontWeight:'500', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{inv.client_name}</div>
                  <div style={{ fontSize:'10px', color:'#888' }}>#{inv.invoice_number}</div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:'12px', fontWeight:'500' }}>€{Number(inv.amount_total).toFixed(0)}</div>
                  <div style={{ fontSize:'10px', color: inv.status === 'paid' ? '#3B6D11' : '#854F0B' }}>{inv.status === 'paid' ? 'Plačano' : 'Poslano'}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background:'#fff', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:'12px', padding:'14px 16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
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
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ fontSize:'12px', color:'#0D1F12', fontWeight:'500', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</div>
                    <div style={{ fontSize:'10px', color:'#888' }}>{item.date}</div>
                  </div>
                  <div style={{ fontSize:'10px', padding:'3px 9px', borderRadius:'20px', fontWeight:'500', flexShrink:0, marginLeft:'8px', background: item.days <= 3 ? '#FCEBEB' : item.days <= 7 ? '#FAEEDA' : '#EAF3DE', color: item.days <= 3 ? '#A32D2D' : item.days <= 7 ? '#854F0B' : '#27500A' }}>
                    {item.days <= 0 ? 'Danes!' : `${item.days} dni`}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Hitre akcije */}
        <div style={{ background:'#fff', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:'12px', padding:'14px 16px', marginBottom: isMobile ? '10px' : '0' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
            <div style={{ fontSize:'12px', fontWeight:'500', color:'#0D1F12' }}>Hitre akcije</div>
            <button onClick={() => { setQaHrefsDraft(qaHrefs); setShowQAModal(true) }} style={{ background:'#F7F6F2', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:'20px', padding:'4px 12px', fontSize:'11px', color:'#888', cursor:'pointer' }}>
              ✏️ Uredi
            </button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap:'8px' }}>
            {activeQA.map(item => (
              <Link key={item.href} href={item.href} style={{ textDecoration:'none' }}>
                <div style={{ background:'#F7F6F2', border:'0.5px solid rgba(0,0,0,0.06)', borderRadius:'10px', padding: isMobile ? '10px 12px' : '12px 14px', display:'flex', alignItems:'center', gap:'8px' }}>
                  <div style={{ fontSize: isMobile ? '18px' : '20px', flexShrink:0 }}>{item.icon}</div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:'12px', color:'#0D1F12', fontWeight:'500', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.label}</div>
                    <div style={{ fontSize:'10px', color:'#888', marginTop:'1px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.sub}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div style={{ marginTop: isMobile ? '10px' : '12px' }}>
          <LegalUpdatesWidget />
        </div>
      </div>

      {/* MODAL */}
      {showQAModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowQAModal(false) }} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'16px' }}>
          <div style={{ background:'#fff', borderRadius:'12px', width:'100%', maxWidth:'380px', maxHeight:'80vh', overflowY:'auto', border:'0.5px solid rgba(0,0,0,0.1)' }}>
            <div style={{ padding:'16px 18px', borderBottom:'0.5px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:'14px', fontWeight:'500', color:'#1a1a1a' }}>Uredi hitre akcije</span>
              <button onClick={() => setShowQAModal(false)} style={{ background:'none', border:'none', fontSize:'18px', cursor:'pointer', color:'#888', lineHeight:1 }}>✕</button>
            </div>
            <div style={{ padding:'12px 18px' }}>
              <div style={{ fontSize:'11px', color:'#999', marginBottom:'10px' }}>Izberite akcije ki jih želite videti</div>
              {ALL_QUICK_ACTIONS.map(item => (
                <div key={item.href} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 4px', borderBottom:'0.5px solid #f5f5f5' }}>
                  <span style={{ display:'flex', alignItems:'center', gap:'10px', fontSize:'13px', color:'#1a1a1a' }}>
                    <span style={{ fontSize:'16px' }}>{item.icon}</span>
                    <span>
                      <div style={{ fontWeight:'500' }}>{item.label}</div>
                      <div style={{ fontSize:'11px', color:'#888' }}>{item.sub}</div>
                    </span>
                  </span>
                  <div onClick={() => toggleDraftQA(item.href)} style={{ width:'32px', height:'18px', borderRadius:'9px', cursor:'pointer', background: qaHrefsDraft.includes(item.href) ? '#1D9E75' : '#ddd', position:'relative', transition:'background .2s', flexShrink:0 }}>
                    <div style={{ position:'absolute', top:'2px', left: qaHrefsDraft.includes(item.href) ? '14px' : '2px', width:'14px', height:'14px', borderRadius:'50%', background:'#fff', transition:'left .2s' }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding:'12px 18px 16px' }}>
              <button onClick={saveQA} disabled={savingQA} style={{ width:'100%', padding:'10px', borderRadius:'8px', background:'#1D9E75', color:'#fff', border:'none', fontSize:'13px', fontWeight:'500', cursor:'pointer', opacity: savingQA ? 0.7 : 1 }}>
                {savingQA ? 'Shranjujem...' : 'Shrani'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}