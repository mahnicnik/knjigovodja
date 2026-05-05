'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const QUICK_QUESTIONS = [
  'Koliko dohodnine bom plačal letos?',
  'Kdaj moram oddati DDV obračun?',
  'Kaj so davčno priznavni stroški?',
  'Kako izračunam neto plačo zaposlenega?',
  'Kdaj moram plačati prispevke?',
  'Kaj je razlika med s.p. in d.o.o.?',
]

export default function AIPage() {
  const [org, setOrg] = useState<any>(null)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Pozdravljeni! Sem vaš AI računovodja za slovenskega s.p. Vprašajte me karkoli o davkih, DDV, prispevkih, računih ali poslovanju. 💼'
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({ revenue: 0, expenses: 0, vatDue: 0 })
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase
        .from('org_members')
        .select('organizations(*)')
        .eq('user_id', user.id)
        .single()
      if (member) {
        const o = (member as any).organizations
        setOrg(o)

        // Naloži statistike za kontekst
        const { data: invoices } = await supabase
          .from('issued_invoices')
          .select('amount_net, vat_amount, status')
          .eq('org_id', o.id)
        const { data: receipts } = await supabase
          .from('receipts')
          .select('amount_net, vat_amount')
          .eq('org_id', o.id)

        const revenue = invoices?.filter(i => i.status !== 'draft').reduce((s: number, i: any) => s + Number(i.amount_net), 0) || 0
        const vatOut = invoices?.filter(i => i.status !== 'draft').reduce((s: number, i: any) => s + Number(i.vat_amount), 0) || 0
        const vatIn = receipts?.reduce((s: number, r: any) => s + Number(r.vat_amount), 0) || 0
        const expenses = receipts?.reduce((s: number, r: any) => s + Number(r.amount_net), 0) || 0

        setStats({ revenue, expenses, vatDue: vatOut - vatIn })
      }
    }
    load()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text?: string) {
    const userMessage = text || input.trim()
    if (!userMessage || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      const context = org ? `
Kontekst o s.p.:
- Ime: ${org.name}
- Davčna številka: ${org.tax_number}
- DDV zavezanec: ${org.vat_registered ? 'Da' : 'Ne'}
- Kraj: ${org.city}
- YTD prihodki: €${stats.revenue.toFixed(2)}
- YTD odhodki: €${stats.expenses.toFixed(2)}
- DDV dolg: €${stats.vatDue.toFixed(2)}
- Datum: ${new Date().toLocaleDateString('sl-SI')}
      ` : ''

      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            ...messages.slice(1), // Preskoči prvi pozdravni message
            { role: 'user', content: userMessage }
          ],
          context,
        }),
      })

      const data = await response.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Oprostite, prišlo je do napake. Prosimo poskusite znova.'
      }])
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <div>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Domov</Link>
          <h1 className="font-semibold text-gray-900 mt-0.5">AI računovodja</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span className="text-xs text-gray-500">Online</span>
        </div>
      </div>

      {/* Kontekst strip */}
      {org && (
        <div className="bg-blue-50 border-b border-blue-100 px-6 py-2 flex gap-6 text-xs text-blue-700">
          <span>📊 Prihodki: <strong>€{stats.revenue.toFixed(2)}</strong></span>
          <span>💸 Odhodki: <strong>€{stats.expenses.toFixed(2)}</strong></span>
          <span>🧾 DDV dolg: <strong>€{stats.vatDue.toFixed(2)}</strong></span>
        </div>
      )}

      {/* Sporočila */}
      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto w-full">

        {/* Hitra vprašanja */}
        {messages.length === 1 && (
          <div className="mb-6">
            <p className="text-xs text-gray-500 mb-3 font-medium">POGOSTA VPRAŠANJA</p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className="text-left text-sm bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-gray-400 hover:bg-gray-50 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs mr-3 flex-shrink-0 mt-0.5">
                AI
              </div>
            )}
            <div className={`max-w-lg rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-gray-900 text-white rounded-tr-sm'
                : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm'
            }`}>
              {msg.content.split('\n').map((line, j) => (
                <span key={j}>
                  {line}
                  {j < msg.content.split('\n').length - 1 && <br />}
                </span>
              ))}
            </div>
          </div>
        ))}

        {loading && (
          <div className="mb-4 flex justify-start">
            <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs mr-3 flex-shrink-0">
              AI
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1 items-center">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'0ms'}}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex gap-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Vprašajte karkoli o davkih, DDV, prispevkih..."
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-gray-800 transition-colors"
          >
            Pošlji
          </button>
        </div>
      </div>
    </div>
  )
}