'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

interface BankTransaction {
  date: string
  description: string
  amount: number
  type: 'credit' | 'debit'
  reference?: string
  category?: string
  matched_invoice?: any
  selected?: boolean
}

export default function BankaPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [processing, setProcessing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [step, setStep] = useState<'upload' | 'review' | 'done'>('upload')
  const [stats, setStats] = useState({ matched: 0, unmatched: 0, totalIn: 0, totalOut: 0 })
  const fileRef = useRef<HTMLInputElement>(null)
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
      // Naloži neplačane račune
      const { data: inv } = await supabase
        .from('issued_invoices')
        .select('*')
        .eq('org_id', o.id)
        .eq('status', 'sent')
        .order('due_date', { ascending: true })
      setInvoices(inv || [])
    }
    setLoading(false)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setProcessing(true)

    const text = await file.text()
    const parsed = parseCSV(text)

    // Poskusi ujeti račune z bančnimi transakcijami
    const matched = matchTransactions(parsed)
    setTransactions(matched)

    const matchedCount = matched.filter(t => t.matched_invoice).length
    const totalIn = matched.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0)
    const totalOut = matched.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0)
    setStats({ matched: matchedCount, unmatched: matched.filter(t => t.type === 'credit' && !t.matched_invoice).length, totalIn, totalOut })

    setStep('review')
    setProcessing(false)
  }

  function parseCSV(text: string): BankTransaction[] {
    const lines = text.split('\n').filter(l => l.trim())
    const transactions: BankTransaction[] = []

    for (const line of lines) {
      const cols = line.split(';').map(c => c.replace(/"/g, '').trim())
      if (cols.length < 3) continue

      const dateCol = cols.find(c => /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(c))
      if (!dateCol) continue

      const dateParts = dateCol.split(/[./-]/)
      let date = ''
      if (dateParts.length === 3) {
        if (dateParts[2].length === 4) {
          date = `${dateParts[2]}-${dateParts[1].padStart(2,'0')}-${dateParts[0].padStart(2,'0')}`
        } else {
          date = `${dateParts[0]}-${dateParts[1].padStart(2,'0')}-${dateParts[2].padStart(2,'0')}`
        }
      }

      const amountCol = cols.find(c => /^-?\d+([,.]\d+)?$/.test(c.replace(/\s/g,'')))
      if (!amountCol) continue
      const amount = Math.abs(parseFloat(amountCol.replace(',', '.')))
      const type: 'credit' | 'debit' = amountCol.startsWith('-') ? 'debit' : 'credit'

      // Poiščemo sklic (SI00 ali SI19)
      const referenceCol = cols.find(c => /SI\d{2}/.test(c))
      const description = cols.reduce((a, b) => a.length > b.length ? a : b, '')

      if (date && amount > 0) {
        transactions.push({
          date,
          description: description.slice(0, 100),
          amount,
          type,
          reference: referenceCol,
          category: guessCategory(description, type),
          selected: true,
        })
      }
    }

    return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }

  function matchTransactions(transactions: BankTransaction[]): BankTransaction[] {
    return transactions.map(t => {
      if (t.type !== 'credit') return t

      // Poskusi ujeti po sklicu (SI00 YYYY-NNN)
      if (t.reference) {
        const refMatch = invoices.find(inv => {
          const invRef = (inv.reference || `SI00 ${inv.invoice_number}`).replace(/\s/g, '')
          const txRef = t.reference!.replace(/\s/g, '')
          return invRef.includes(txRef) || txRef.includes(invRef)
        })
        if (refMatch) return { ...t, matched_invoice: refMatch }
      }

      // Poskusi ujeti po znesku (±€0.01 toleranca)
      const amountMatch = invoices.find(inv =>
        Math.abs(Number(inv.amount_total) - t.amount) < 0.02 &&
        !transactions.some(tx => tx.matched_invoice?.id === inv.id)
      )
      if (amountMatch) return { ...t, matched_invoice: amountMatch }

      // Poskusi ujeti po imenu stranke
      const nameMatch = invoices.find(inv => {
        const clientName = inv.client_name.toLowerCase()
        const desc = t.description.toLowerCase()
        return desc.includes(clientName.split(' ')[0].toLowerCase()) ||
               (clientName.length > 5 && desc.includes(clientName.slice(0, 5).toLowerCase()))
      })
      if (nameMatch) return { ...t, matched_invoice: nameMatch }

      return t
    })
  }

  function guessCategory(description: string, type: 'credit' | 'debit'): string {
    const desc = description.toLowerCase()
    if (type === 'credit') return 'Prihodek'
    if (desc.includes('telekom') || desc.includes('a1') || desc.includes('t-2')) return 'Komunikacije'
    if (desc.includes('amazon') || desc.includes('google') || desc.includes('microsoft')) return 'Programska oprema'
    if (desc.includes('mercator') || desc.includes('spar') || desc.includes('hofer')) return 'Prehrana'
    if (desc.includes('petrol') || desc.includes('mol') || desc.includes('omv')) return 'Transport'
    if (desc.includes('zpiz') || desc.includes('zzzs')) return 'Prispevki'
    if (desc.includes('furs') || desc.includes('durs')) return 'Davki'
    return 'Drugo'
  }

  function toggleTransaction(i: number) {
    const updated = [...transactions]
    updated[i].selected = !updated[i].selected
    setTransactions(updated)
  }

  function setMatchedInvoice(txIndex: number, invoiceId: string) {
    const updated = [...transactions]
    const invoice = invoices.find(inv => inv.id === invoiceId)
    updated[txIndex].matched_invoice = invoice || null
    setTransactions(updated)
  }

  async function importTransactions() {
    if (!org) return
    setImporting(true)

    const selected = transactions.filter(t => t.selected)

    for (const t of selected) {
      // Če je ujemanje z računom — označi kot plačanega
      if (t.matched_invoice && t.type === 'credit') {
        await supabase.from('issued_invoices').update({
          status: 'paid',
          paid_at: new Date(t.date).toISOString(),
          paid_amount: t.amount,
        }).eq('id', t.matched_invoice.id)

        // Vpiši v KPO
        await supabase.from('kpo_entries').insert({
          org_id: org.id,
          entry_date: t.date,
          description: `Plačilo računa #${t.matched_invoice.invoice_number} — ${t.matched_invoice.client_name}`,
          entry_type: 'income',
          income: Number(t.matched_invoice.amount_net),
          expense: 0,
          vat_in: 0,
          vat_out: Number(t.matched_invoice.vat_amount),
          category: 'Prihodek',
          notes: `Banka: ${t.description}`,
        })
      } else if (t.type === 'credit') {
        // Neujeti prihodek
        await supabase.from('kpo_entries').insert({
          org_id: org.id,
          entry_date: t.date,
          description: t.description,
          entry_type: 'income',
          income: t.amount,
          expense: 0,
          vat_in: 0,
          vat_out: 0,
          category: 'Prihodek',
        })
      } else {
        // Odhodek
        await supabase.from('kpo_entries').insert({
          org_id: org.id,
          entry_date: t.date,
          description: t.description,
          entry_type: 'expense',
          income: 0,
          expense: t.amount,
          vat_in: 0,
          vat_out: 0,
          category: t.category || 'Drugo',
        })
      }
    }

    setStep('done')
    setImporting(false)
  }

  const credits = transactions.filter(t => t.type === 'credit')
  const debits = transactions.filter(t => t.type === 'debit')
  const matchedInvoices = transactions.filter(t => t.matched_invoice)

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Nalagam...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Domov</Link>
        <h1 className="font-semibold text-gray-900 mt-0.5">Bančni izpisek — uskladitev</h1>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {step === 'upload' && (
          <>
            {/* Neplačani računi */}
            {invoices.length > 0 && (
              <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-6">
                <div className="font-medium text-orange-800 text-sm mb-2">
                  ⏳ {invoices.length} neplačanih računov čaka na plačilo
                </div>
                <div className="space-y-1">
                  {invoices.slice(0, 5).map(inv => (
                    <div key={inv.id} className="flex justify-between text-xs text-orange-700">
                      <span>#{inv.invoice_number} — {inv.client_name}</span>
                      <span className="font-medium">€{Number(inv.amount_total).toFixed(2)}</span>
                    </div>
                  ))}
                  {invoices.length > 5 && <div className="text-xs text-orange-600">... in še {invoices.length - 5} računov</div>}
                </div>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-6">
              <div className="font-medium text-blue-800 text-sm mb-2">Kako uvoziti izpisek</div>
              <div className="text-blue-700 text-xs leading-relaxed space-y-1">
                <div><strong>NLB Klik:</strong> Računi → Izpisek → Izvozi CSV</div>
                <div><strong>SKB Net:</strong> Plačila → Izpisek → Prenesi CSV</div>
                <div><strong>Sparkasse:</strong> Račun → Prenesi → CSV format</div>
                <div className="mt-2 text-blue-600">
                  Aplikacija bo samodejno prepoznala plačila vaših računov po sklicu, znesku ali imenu stranke.
                </div>
              </div>
            </div>

            <div
              onClick={() => fileRef.current?.click()}
              className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-16 text-center cursor-pointer hover:border-gray-400 transition-colors"
            >
              {processing ? (
                <div>
                  <div className="text-4xl mb-4 animate-spin inline-block">⟳</div>
                  <p className="text-gray-500">Analiziram izpisek...</p>
                </div>
              ) : (
                <>
                  <div className="text-5xl mb-4">🏦</div>
                  <h3 className="font-semibold text-gray-900 mb-2">Naložite bančni izpisek</h3>
                  <p className="text-gray-500 text-sm mb-4">CSV format — NLB, SKB, Sparkasse, Delavska</p>
                  <div className="bg-gray-900 text-white px-6 py-2.5 rounded-xl text-sm font-medium inline-block">
                    Izberi CSV datoteko
                  </div>
                </>
              )}
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
            </div>
          </>
        )}

        {step === 'review' && (
          <>
            {/* Statistika */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="text-xs text-gray-500 mb-1">Transakcij</div>
                <div className="text-xl font-semibold">{transactions.length}</div>
              </div>
              <div className="bg-green-50 rounded-2xl border border-green-100 p-4">
                <div className="text-xs text-green-600 mb-1">Prihodki</div>
                <div className="text-xl font-semibold text-green-600">€{stats.totalIn.toFixed(2)}</div>
              </div>
              <div className="bg-orange-50 rounded-2xl border border-orange-100 p-4">
                <div className="text-xs text-orange-600 mb-1">Ujeti računi</div>
                <div className="text-xl font-semibold text-orange-600">{matchedInvoices.length}</div>
                <div className="text-xs text-orange-500">bo označenih kot plačano</div>
              </div>
              <div className="bg-red-50 rounded-2xl border border-red-100 p-4">
                <div className="text-xs text-red-500 mb-1">Odhodki</div>
                <div className="text-xl font-semibold text-red-500">€{stats.totalOut.toFixed(2)}</div>
              </div>
            </div>

            {/* Ujeti računi */}
            {matchedInvoices.length > 0 && (
              <div className="bg-green-50 border border-green-100 rounded-2xl p-4 mb-4">
                <div className="font-medium text-green-800 text-sm mb-2">
                  ✓ {matchedInvoices.length} računov bo označenih kot PLAČANO
                </div>
                {matchedInvoices.map((t, i) => (
                  <div key={i} className="flex justify-between text-xs text-green-700 py-0.5">
                    <span>#{t.matched_invoice.invoice_number} — {t.matched_invoice.client_name}</span>
                    <span className="font-medium">€{t.amount.toFixed(2)} · {new Date(t.date).toLocaleDateString('sl-SI')}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Tabela transakcij */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
              <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                <div className="col-span-1 text-xs font-medium text-gray-500">✓</div>
                <div className="col-span-2 text-xs font-medium text-gray-500">Datum</div>
                <div className="col-span-4 text-xs font-medium text-gray-500">Opis</div>
                <div className="col-span-3 text-xs font-medium text-gray-500">Ujemanje</div>
                <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Znesek</div>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {transactions.map((t, i) => (
                  <div key={i} className={`grid grid-cols-12 gap-2 px-4 py-2.5 items-center border-b border-gray-50 ${t.matched_invoice ? 'bg-green-50' : ''}`}>
                    <div className="col-span-1">
                      <input type="checkbox" checked={t.selected}
                        onChange={() => toggleTransaction(i)}
                        className="w-4 h-4 rounded" />
                    </div>
                    <div className="col-span-2 text-xs text-gray-500">
                      {new Date(t.date).toLocaleDateString('sl-SI')}
                    </div>
                    <div className="col-span-4 text-xs text-gray-900 truncate">{t.description}</div>
                    <div className="col-span-3">
                      {t.type === 'credit' ? (
                        t.matched_invoice ? (
                          <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                            ✓ #{t.matched_invoice.invoice_number}
                          </span>
                        ) : (
                          <select
                            onChange={e => setMatchedInvoice(i, e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 w-full focus:outline-none"
                            defaultValue=""
                          >
                            <option value="">Ročno poveži...</option>
                            {invoices.map(inv => (
                              <option key={inv.id} value={inv.id}>
                                #{inv.invoice_number} — {inv.client_name} (€{Number(inv.amount_total).toFixed(2)})
                              </option>
                            ))}
                          </select>
                        )
                      ) : (
                        <span className="text-xs text-gray-400">{t.category}</span>
                      )}
                    </div>
                    <div className={`col-span-2 text-xs text-right font-medium ${t.type === 'credit' ? 'text-green-600' : 'text-red-500'}`}>
                      {t.type === 'credit' ? '+' : '-'}€{t.amount.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={importTransactions} disabled={importing}
                className="flex-1 bg-gray-900 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40">
                {importing ? 'Uvažam...' : `✓ Uvozi in uskladi ${transactions.filter(t => t.selected).length} transakcij`}
              </button>
              <button onClick={() => { setStep('upload'); setTransactions([]) }}
                className="border border-gray-200 rounded-xl px-6 py-3 text-sm">
                Nazaj
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="font-semibold text-gray-900 mb-2 text-xl">Uskladitev uspešna!</h3>
            <div className="text-gray-500 text-sm mb-6 space-y-1">
              <p>{matchedInvoices.length} računov označenih kot plačano</p>
              <p>{transactions.length} transakcij uvoženih v KPO</p>
            </div>
            <div className="flex gap-3 justify-center">
              <Link href="/invoices"
                className="bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-medium">
                Poglej račune →
              </Link>
              <Link href="/kpo"
                className="border border-gray-200 rounded-xl px-6 py-3 text-sm">
                KPO knjiga →
              </Link>
              <button onClick={() => { setStep('upload'); setTransactions([]) }}
                className="border border-gray-200 rounded-xl px-6 py-3 text-sm">
                Nov uvoz
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}