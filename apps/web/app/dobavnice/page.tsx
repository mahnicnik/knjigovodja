'use client'
import { useState, useEffect } from 'react'
import { lokalniDatum } from '@/lib/tax-constants'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getActiveMembership } from '@/lib/active-org'
import AppLayout from '@/components/AppLayout'
import { formatEurNumber } from '@/lib/format'

export default function DobavnicePage() {
  const [org, setOrg] = useState<any>(null)
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [grouping, setGrouping] = useState<string | null>(null)
  const [merging, setMerging] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const member = await getActiveMembership() // podpora vec organizacijam (30.7.2026)
    if (member) {
      const o = (member as any).organizations
      setOrg(o)
      const { data } = await supabase
        .from('issued_invoices')
        .select('*')
        .eq('org_id', o.id)
        .eq('invoice_type', 'delivery_note')
        .order('issue_date', { ascending: false })
      setDocs(data || [])
    }
    setLoading(false)
  }

  // Grupiranje po stranki
  const grouped = docs.reduce((acc: any, doc) => {
    const key = doc.client_name || 'Neznana stranka'
    if (!acc[key]) acc[key] = []
    acc[key].push(doc)
    return acc
  }, {})

  async function mergeToInvoice(clientName: string) {
    const clientDocs = grouped[clientName]
    if (!clientDocs?.length) return
    setMerging(true)

    // Združi vse postavke
    const allItems = clientDocs.flatMap((d: any) => d.line_items || [])
    const subtotal = allItems.reduce((s: number, i: any) => s + i.quantity * i.unit_price, 0)
    const vatAmount = allItems.reduce((s: number, i: any) => s + i.quantity * i.unit_price * (i.vat_rate / 100), 0)
    const total = subtotal + vatAmount

    // Pridobi naslednjo številko računa
    // POPRAVLJENO (30.7.2026, audit A5): prej count(*)+1, ki se pokvari ob
    // vrzelih v stevilkah (glej isti popravek na /invoices/new, 24.7.).
    const { data: nextNumber } = await supabase.rpc('get_next_manual_invoice_number', {
      p_org_id: org.id, p_year: new Date().getFullYear(),
    })
    const invoiceNumber = nextNumber || `${new Date().getFullYear()}-001`

    const firstDoc = clientDocs[0]
    const { data: inv, error } = await supabase.from('issued_invoices').insert({
      org_id: org.id,
      invoice_number: invoiceNumber,
      invoice_type: 'invoice',
      client_name: firstDoc.client_name,
      client_email: firstDoc.client_email,
      client_tax_number: firstDoc.client_tax_number,
      client_address: firstDoc.client_address,
      client_iban: firstDoc.client_iban,
      issue_date: lokalniDatum(),
      due_date: lokalniDatum(new Date(Date.now() + 30*24*60*60*1000)),
      line_items: allItems,
      amount_net: subtotal,
      vat_amount: vatAmount,
      amount_total: total,
      status: 'draft',
      reference: `SI00 ${invoiceNumber}`,
      notes: `Združeno iz dobavnic: ${clientDocs.map((d: any) => d.invoice_number).join(', ')}`,
    }).select().single()

    if (!error && inv) {
      // Označi dobavnice kot zaračunane
      await supabase.from('issued_invoices')
        .update({ status: 'sent' })
        .in('id', clientDocs.map((d: any) => d.id))
      
      setMerging(false)
      router.push(`/invoices/edit/${inv.id}`)
    } else {
      alert('Napaka: ' + error?.message)
      setMerging(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Nalagam...</p></div>

  const pendingDocs = docs.filter(d => d.status === 'draft')
  const billedDocs = docs.filter(d => d.status === 'sent')

  return (
    <AppLayout org={org}>
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="font-semibold text-gray-900 mt-0.5">Dobavnice</h1>
        </div>
        <Link href="/dobavnice/new" className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
          + Nova dobavnica
        </Link>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-sm text-gray-500">Skupaj dobavnic</div>
            <div className="text-2xl font-semibold text-gray-900 mt-1">{docs.length}</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-sm text-gray-500">Čaka na račun</div>
            <div className="text-2xl font-semibold text-orange-600 mt-1">{pendingDocs.length}</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-sm text-gray-500">Zaračunane</div>
            <div className="text-2xl font-semibold text-green-600 mt-1">{billedDocs.length}</div>
          </div>
        </div>

        {/* Grupirano po stranki */}
        {pendingDocs.length > 0 && (
          <div className="mb-8">
            <h2 className="font-medium text-gray-900 mb-4">Čaka na račun — grupirano po stranki</h2>
            <div className="space-y-4">
              {Object.entries(grouped).filter(([_, ds]: any) => ds.some((d: any) => d.status === 'draft')).map(([clientName, clientDocs]: any) => {
                const pending = clientDocs.filter((d: any) => d.status === 'draft')
                if (!pending.length) return null
                const total = pending.reduce((s: number, d: any) => s + Number(d.amount_total), 0)
                return (
                  <div key={clientName} className="bg-white rounded-2xl border border-gray-100 p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-medium text-gray-900">{clientName}</div>
                        <div className="text-sm text-gray-500">{pending.length} dobavnic · €{formatEurNumber(total)}</div>
                      </div>
                      <button
                        onClick={() => mergeToInvoice(clientName)}
                        disabled={merging}
                        className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
                      >
                        {merging ? 'Ustvarjam...' : '📄 Izstavi račun'}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {pending.map((doc: any) => (
                        <div key={doc.id} className="flex justify-between items-center text-sm py-2 border-t border-gray-50">
                          <div className="text-gray-600">#{doc.invoice_number} · {doc.issue_date}</div>
                          <div className="font-medium">€{formatEurNumber(Number(doc.amount_total))}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Vse dobavnice */}
        <div>
          <h2 className="font-medium text-gray-900 mb-4">Vse dobavnice</h2>
          {docs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
              <div className="text-4xl mb-3">📦</div>
              <div className="font-medium text-gray-900 mb-1">Še ni dobavnic</div>
              <div className="text-sm text-gray-500 mb-4">Ustvarite prvo dobavnico</div>
              <Link href="/dobavnice/new" className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium">
                + Nova dobavnica
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {docs.map(doc => (
                <div key={doc.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex justify-between items-center">
                  <div>
                    <div className="font-medium text-gray-900">#{doc.invoice_number}</div>
                    <div className="text-sm text-gray-500">{doc.client_name} · {doc.issue_date}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="font-medium">€{formatEurNumber(Number(doc.amount_total))}</div>
                    <span className={`text-xs px-2 py-1 rounded-full ${doc.status === 'sent' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                      {doc.status === 'sent' ? 'Zaračunana' : 'Čaka'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
    </AppLayout>
  )
}
