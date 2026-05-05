'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function DDVPage() {
  const [org, setOrg] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
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
        const { data } = await supabase
          .from('issued_invoices')
          .select('*')
          .eq('org_id', o.id)
          .neq('status', 'draft')
        setInvoices(data || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const now = new Date()
  const quarter = Math.ceil((now.getMonth() + 1) / 3)
  const year = now.getFullYear()

  const vatOut = invoices.reduce((s, i) => s + (i.vat_amount || 0), 0)
  const vatDue = vatOut // Za zdaj brez vhodnega DDV
  
  const quarterDates: Record<number, string> = {
    1: '30. april', 2: '31. julij', 3: '31. oktober', 4: '31. januar'
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Nalagam...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <div>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Domov</Link>
          <h1 className="font-semibold text-gray-900 mt-0.5">DDV obračun</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">

        {!org?.vat_registered ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-4">ℹ️</div>
            <h3 className="font-semibold text-gray-900 mb-2">Niste DDV zavezanec</h3>
            <p className="text-gray-500 text-sm">DDV obračun velja samo za DDV zavezance.</p>
          </div>
        ) : (
          <>
            {/* Rok opomnik */}
            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-6 flex justify-between items-center">
              <div>
                <div className="font-medium text-orange-800 text-sm">Q{quarter} {year} — rok oddaje</div>
                <div className="text-orange-600 text-xs mt-0.5">{quarterDates[quarter]} {quarter === 4 ? year + 1 : year}</div>
              </div>
              <div className="text-orange-500 text-xs font-medium">DDV-O obrazec</div>
            </div>

            {/* Izračun */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
              <h3 className="font-medium text-gray-900 mb-4">Q{quarter} {year} — izračun</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-600">DDV izhod (od prodaj)</span>
                  <span className="font-semibold text-red-500">€{vatOut.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-600">DDV vhod (od nakupov)</span>
                  <span className="font-semibold text-green-600">€0.00</span>
                </div>
                <div className="flex justify-between items-center py-3 bg-gray-50 rounded-xl px-3">
                  <span className="font-medium text-gray-900">Za plačilo FURS</span>
                  <span className="text-xl font-semibold text-gray-900">€{vatDue.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* FURS podatki */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
              <h3 className="font-medium text-gray-900 mb-4">Plačilni podatki FURS</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">IBAN</span>
                  <span className="font-mono text-xs">SI56 0110 0888 1000 030</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Sklic</span>
                  <span className="font-mono text-xs">SI19 {org?.tax_number} DDV{String(year).slice(-2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Namen</span>
                  <span className="text-xs">DDV obračun Q{quarter}/{year}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Znesek</span>
                  <span className="font-semibold">€{vatDue.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Računi v tem kvartalu */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="font-medium text-gray-900 mb-4">Računi v Q{quarter} {year}</h3>
              {invoices.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">Ni računov v tem kvartalu</p>
              ) : (
                invoices.map((inv, i) => (
                  <div key={inv.id} className={`flex justify-between items-center py-2 ${i < invoices.length-1 ? 'border-b border-gray-50' : ''}`}>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{inv.client_name}</div>
                      <div className="text-xs text-gray-500">#{inv.invoice_number}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">€{inv.amount_total?.toFixed(2)}</div>
                      <div className="text-xs text-orange-500">DDV: €{inv.vat_amount?.toFixed(2)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}