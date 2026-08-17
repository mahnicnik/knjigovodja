'use client'

import { useEffect, useState, useRef } from 'react'
import { lokalniDatum } from '@/lib/tax-constants'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'


interface Message {
  role: 'user' | 'assistant'
  content: string
  actions?: Action[]
}

interface Action {
  label: string
  href: string
  icon: string
}

const QUICK_QUESTIONS = [
  { icon: '💰', text: 'Koliko dohodnine bom plačal letos?' },
  { icon: '📅', text: 'Kdaj moram plačati prispevke?' },
  { icon: '🧾', text: 'Kateri stroški so davčno priznavni?' },
  { icon: '📊', text: 'Analiziraj moje poslovanje' },
  { icon: '🔄', text: 'Ali mi bolj ustreza s.p. ali d.o.o.?' },
  { icon: '⚠️', text: 'Kaj moram narediti ta mesec?' },
]

function getActionsForResponse(text: string): Action[] {
  const actions: Action[] = []
  if (text.includes('račun') || text.includes('faktur')) actions.push({ label: 'Nov račun', href: '/invoices/new', icon: '📄' })
  if (text.includes('strošek') || text.includes('stroški')) actions.push({ label: 'Dodaj strošek', href: '/expenses', icon: '🧾' })
  if (text.includes('prispevk')) actions.push({ label: 'Plačaj prispevke', href: '/prispevki', icon: '💳' })
  if (text.includes('DDV') || text.includes('ddv')) actions.push({ label: 'DDV obračun', href: '/ddv', icon: '📊' })
  if (text.includes('plač') && text.includes('zaposleni')) actions.push({ label: 'Obračun plač', href: '/place', icon: '👥' })
  if (text.includes('dohodnin')) actions.push({ label: 'Dohodnina', href: '/dohodnina', icon: '💰' })
  if (text.includes('statistik') || text.includes('analiz')) actions.push({ label: 'Statistika', href: '/statistika', icon: '📈' })
  return actions.slice(0, 3)
}

export default function AIPage() {
  const [org, setOrg] = useState<any>(null)
  const [orgData, setOrgData] = useState<any>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => { loadData() }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)

    if (!member) return
    const o = (member as any).organizations
    setOrg(o)

    const now = new Date()
    const year = now.getFullYear()
    const monthStart = `${year}-01-01`
    const today = lokalniDatum(now)

    const [invRes, expRes, empRes, kpoRes] = await Promise.all([
      supabase.from('issued_invoices').select('amount_net,vat_amount,amount_total,status,due_date').eq('org_id', o.id).neq('status','draft').or('zoi.is.null,zoi.not.like.DEMO-%'),
      supabase.from('receipts').select('amount_net,vat_amount').eq('org_id', o.id),
      supabase.from('employees').select('id').eq('org_id', o.id).eq('status','active'),
      // DODANO (16.8.2026): promet in stroski iz knjige (POS blagajna, banka,
      // kartice, place). Prej je AI videl SAMO izdane racune, zato bi na
      // vprasanje o prihodkih ali DDV odgovoril prenizko - gostinski promet
      // ne gre prek izdanih racunov. Filter invoice_id/receipt_id prepreci
      // dvojno stetje ze zajetih racunov.
      supabase.from('kpo_entries').select('income,expense,vat_out,vat_in,entry_type,invoice_id,receipt_id').eq('org_id', o.id),
    ])

    const invoices = invRes.data || []
    const receipts = expRes.data || []
    const kpo = (kpoRes.data || []).filter((e: any) => !e.invoice_id && !e.receipt_id)
    const kpoIncome = kpo.filter((e: any) => e.entry_type === 'income')
    const kpoExpense = kpo.filter((e: any) => e.entry_type === 'expense')
    const revenue = invoices.reduce((s: number, i: any) => s + Number(i.amount_net), 0)
      + kpoIncome.reduce((s: number, e: any) => s + Number(e.income || 0), 0)
    const expenses = receipts.reduce((s: number, r: any) => s + Number(r.amount_net), 0)
      + kpoExpense.reduce((s: number, e: any) => s + Number(e.expense || 0), 0)
    const vatOut = invoices.reduce((s: number, i: any) => s + Number(i.vat_amount), 0)
      + kpoIncome.reduce((s: number, e: any) => s + Number(e.vat_out || 0), 0)
    const vatIn = receipts.reduce((s: number, r: any) => s + Number(r.vat_amount), 0)
      + kpoExpense.reduce((s: number, e: any) => s + Number(e.vat_in || 0), 0)
    const unpaid = invoices.filter((i: any) => i.status === 'sent')
    const overdue = invoices.filter((i: any) => i.status === 'sent' && i.due_date < today)

    const data = {
      name: o.name,
      vat_registered: o.vat_registered,
      revenue,
      expenses,
      vatDue: Math.max(0, vatOut - vatIn),
      unpaidCount: unpaid.length,
      unpaidAmount: unpaid.reduce((s: number, i: any) => s + Number(i.amount_total), 0),
      overdueCount: overdue.length,
      hasEmployees: (empRes.data || []).length > 0,
    }

    setOrgData(data)

    // Generiraj personaliziran pozdrav na podlagi podatkov
    const greetingParts = []
    if (overdue.length > 0) greetingParts.push(`⚠️ Imate ${overdue.length} računov v zamudi za €${overdue.reduce((s:number,i:any)=>s+Number(i.amount_total),0).toFixed(0)}.`)
    if (unpaid.length > 0) greetingParts.push(`📬 ${unpaid.length} računov čaka na plačilo (€${unpaid.reduce((s:number,i:any)=>s+Number(i.amount_total),0).toFixed(0)}).`)

    const now2 = new Date()
    const daysUntil15 = 15 - now2.getDate()
    if (daysUntil15 >= 0 && daysUntil15 <= 7) greetingParts.push(`⏰ Prispevki zapadejo čez ${daysUntil15} dni.`)

    const greeting = greetingParts.length > 0
      ? `Pozdravljeni! Vaše stanje:\n\n${greetingParts.join('\n')}\n\nLetni prihodki: €${revenue.toFixed(0)}, odhodki: €${expenses.toFixed(0)}. Vprašajte me karkoli! 💼`
      : `Pozdravljeni! Vaši letni prihodki so €${revenue.toFixed(0)}, odhodki €${expenses.toFixed(0)}. Dobiček: €${(revenue-expenses).toFixed(0)}. Vprašajte me karkoli o davkih ali poslovanju! 💼`

    setMessages([{ role: 'assistant', content: greeting }])
    setLoadingData(false)
  }

  async function sendMessage(text?: string) {
    const userMessage = text || input.trim()
    if (!userMessage || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages.slice(1), { role: 'user', content: userMessage }],
          orgData,
        }),
      })

      const data = await response.json()
      // POPRAVLJENO (30.7.2026): prej se ni preverilo response.ok - ce
      // backend vrne napako (npr. 403 "samo Pro paket"), je bilo
      // sporocilo tiho izgubljeno namesto prikazano uporabniku.
      if (!response.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.error || 'Prišlo je do napake. Poskusite znova.' }])
        setLoading(false)
        return
      }
      const actions = getActionsForResponse(data.response || '')
      setMessages(prev => [...prev, { role: 'assistant', content: data.response, actions }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Oprostite, prišlo je do napake. Poskusite znova.' }])
    }
    setLoading(false)
  }

  const now = new Date()
  const daysUntil15 = 15 - now.getDate()
  const month = now.getMonth()
  const ddvMonths = [4,7,10,1]

  return (
    <AppLayout org={org}>
    <div style={{minHeight:"100vh",background:"#f9fafb"}}>
      <div style={{ display:'flex', flexDirection:'column', height:'100vh', maxHeight:'100vh' }}>

        {/* Header */}
        <div style={{ background:'#fff', borderBottom:'0.5px solid rgba(0,0,0,0.08)', padding:'14px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:'16px', fontWeight:'500', color:'#0D1F12' }}>🤖 AI računovodja</div>
            <div style={{ fontSize:'11px', color:'#888', marginTop:'1px' }}>Pozna vaše podatke · Slovensko davčno pravo 2026</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#1D9E75' }}></div>
            <span style={{ fontSize:'11px', color:'#888' }}>Online</span>
          </div>
        </div>

        {/* Kontekst strip */}
        {orgData && (
          <div style={{ background:'#EAF3DE', borderBottom:'0.5px solid rgba(0,0,0,0.06)', padding:'8px 24px', display:'flex', gap:'20px', fontSize:'11px', color:'#27500A', flexShrink:0, flexWrap:'wrap' }}>
            <span>💰 Prihodki YTD: <strong>€{orgData.revenue?.toFixed(0)}</strong></span>
            <span>💸 Odhodki: <strong>€{orgData.expenses?.toFixed(0)}</strong></span>
            <span>📈 Dobiček: <strong>€{((orgData.revenue||0)-(orgData.expenses||0)).toFixed(0)}</strong></span>
            {orgData.unpaidCount > 0 && <span style={{ color:'#854F0B' }}>⏳ Neplačano: <strong>€{orgData.unpaidAmount?.toFixed(0)}</strong></span>}
            {orgData.overdueCount > 0 && <span style={{ color:'#A32D2D' }}>⚠️ Zamude: <strong>{orgData.overdueCount}</strong></span>}
            {daysUntil15 >= 0 && daysUntil15 <= 7 && <span style={{ color:'#854F0B' }}>⏰ Prispevki: <strong>čez {daysUntil15} dni</strong></span>}
            {ddvMonths.includes(month+1) && orgData.vat_registered && <span style={{ color:'#A32D2D' }}>🔴 <strong>DDV-O ta mesec!</strong></span>}
          </div>
        )}

        {/* Sporočila */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
          <div style={{ maxWidth:'700px', margin:'0 auto' }}>

            {/* Hitra vprašanja */}
            {messages.length <= 1 && !loadingData && (
              <div style={{ marginBottom:'20px' }}>
                <div style={{ fontSize:'11px', color:'#aaa', marginBottom:'10px', letterSpacing:'.05em' }}>POGOSTA VPRAŠANJA</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                  {QUICK_QUESTIONS.map((q, i) => (
                    <button key={i} onClick={() => sendMessage(q.text)} style={{
                      textAlign:'left', fontSize:'12px', background:'#fff',
                      border:'0.5px solid rgba(0,0,0,0.1)', borderRadius:'10px',
                      padding:'10px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:'8px',
                      color:'#0D1F12', transition:'border-color .15s',
                    }}>
                      <span style={{ fontSize:'16px' }}>{q.icon}</span>
                      {q.text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Sporočila */}
            {messages.map((msg, i) => (
              <div key={i} style={{ marginBottom:'16px', display:'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {msg.role === 'assistant' && (
                  <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:'#0D1F12', display:'flex', alignItems:'center', justifyContent:'center', color:'#9FE1CB', fontSize:'10px', fontWeight:'600', marginRight:'10px', flexShrink:0, marginTop:'2px' }}>
                    AI
                  </div>
                )}
                <div style={{ maxWidth:'560px' }}>
                  <div style={{
                    borderRadius:'14px', padding:'12px 16px', fontSize:'13px', lineHeight:'1.65',
                    background: msg.role === 'user' ? '#0D1F12' : '#fff',
                    color: msg.role === 'user' ? '#fff' : '#0D1F12',
                    border: msg.role === 'user' ? 'none' : '0.5px solid rgba(0,0,0,0.08)',
                    borderTopLeftRadius: msg.role === 'assistant' ? '4px' : '14px',
                    borderTopRightRadius: msg.role === 'user' ? '4px' : '14px',
                  }}>
                    {msg.content.split('\n').map((line, j) => (
                      <span key={j}>{line}{j < msg.content.split('\n').length - 1 && <br />}</span>
                    ))}
                  </div>
                  {/* Predlagane akcije */}
                  {msg.actions && msg.actions.length > 0 && (
                    <div style={{ display:'flex', gap:'6px', marginTop:'8px', flexWrap:'wrap' }}>
                      {msg.actions.map((action, j) => (
                        <Link key={j} href={action.href} style={{ textDecoration:'none' }}>
                          <div style={{ fontSize:'11px', padding:'5px 12px', borderRadius:'20px', background:'#EAF3DE', color:'#27500A', border:'0.5px solid rgba(0,0,0,0.08)', cursor:'pointer', display:'flex', alignItems:'center', gap:'5px', fontWeight:'500' }}>
                            {action.icon} {action.label}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ marginBottom:'16px', display:'flex', justifyContent:'flex-start' }}>
                <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:'#0D1F12', display:'flex', alignItems:'center', justifyContent:'center', color:'#9FE1CB', fontSize:'10px', fontWeight:'600', marginRight:'10px', flexShrink:0 }}>AI</div>
                <div style={{ background:'#fff', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:'14px', borderTopLeftRadius:'4px', padding:'12px 16px' }}>
                  <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
                    {[0,150,300].map(d => (
                      <div key={d} style={{ width:'6px', height:'6px', background:'#ccc', borderRadius:'50%', animation:'bounce 1s infinite', animationDelay:`${d}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div style={{ background:'#fff', borderTop:'0.5px solid rgba(0,0,0,0.08)', padding:'14px 24px', flexShrink:0 }}>
          <div style={{ maxWidth:'700px', margin:'0 auto', display:'flex', gap:'10px' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Vprašajte karkoli o davkih, DDV, prispevkih..."
              style={{ flex:1, border:'0.5px solid rgba(0,0,0,0.15)', borderRadius:'10px', padding:'10px 14px', fontSize:'13px', outline:'none', color:'#0D1F12' }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              style={{ background:'#0D1F12', color:'#fff', border:'none', borderRadius:'10px', padding:'10px 20px', fontSize:'13px', fontWeight:'500', cursor:'pointer', opacity: (loading || !input.trim()) ? 0.4 : 1 }}
            >
              Pošlji
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }`}</style>
    </div>
    </AppLayout>
  )
}
