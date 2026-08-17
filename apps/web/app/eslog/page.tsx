'use client'

import { useEffect, useState } from 'react'
import { lokalniDatum } from '@/lib/tax-constants'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { getActiveMembership } from '@/lib/active-org'

export default function EslogPage() {
  const [org, setOrg] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
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
        .from('issued_invoices').select('*')
        .eq('org_id', o.id).neq('status', 'draft').or('zoi.is.null,zoi.not.like.DEMO-%')
        .order('created_at', { ascending: false })
      setInvoices(data || [])
    }
    setLoading(false)
  }

  function generateESlog(inv: any): string {
    const issueDate = lokalniDatum(new Date(inv.issue_date))
    const dueDate = lokalniDatum(new Date(inv.due_date))
    const lineItems = inv.line_items || []

    return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">

  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>

  <rsm:ExchangedDocument>
    <ram:ID>${inv.invoice_number}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${issueDate.replace(/-/g,'')}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>

    <!-- Postavke računa -->
${lineItems.map((item: any, i: number) => `    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${i + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${item.description || 'Storitev'}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${Number(item.unit_price).toFixed(2)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="C62">${item.quantity}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${Number(item.vat_rate) > 0 ? 'S' : 'Z'}</ram:CategoryCode>
          <ram:RateApplicablePercent>${item.vat_rate}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${(Number(item.unit_price) * Number(item.quantity)).toFixed(2)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`).join('\n')}

    <!-- Podatki o transakciji -->
    <ram:ApplicableHeaderTradeAgreement>

      <!-- Izdajatelj -->
      <ram:SellerTradeParty>
        <ram:Name>${org.name}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:LineOne>${org.address || ''}</ram:LineOne>
          <ram:PostcodeCode>${org.post_code || ''}</ram:PostcodeCode>
          <ram:CityName>${org.city || ''}</ram:CityName>
          <ram:CountryID>SI</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="FC">${org.tax_number}</ram:ID>
        </ram:SpecifiedTaxRegistration>
        ${org.vat_registered ? `<ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">SI${org.tax_number}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>

      <!-- Kupec -->
      <ram:BuyerTradeParty>
        <ram:Name>${inv.client_name}</ram:Name>
        ${inv.client_tax_number ? `<ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${inv.client_tax_number}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ''}
      </ram:BuyerTradeParty>

    </ram:ApplicableHeaderTradeAgreement>

    <ram:ApplicableHeaderTradeDelivery/>

    <!-- Plačilni pogoji -->
    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${inv.reference || `SI00 ${inv.invoice_number}`}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>

      ${org.iban ? `<ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${(org.iban).replace(/\s/g,'')}</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>
      </ram:SpecifiedTradeSettlementPaymentMeans>` : ''}

      ${(() => {
        // POPRAVLJENO (16.8.2026): glava je imela ENO samo davcno skupino s
        // TRDO vpisano stopnjo 22%, tudi ce so postavke po 9,5% ali oproscene.
        // Standard zahteva loceno skupino za VSAKO stopnjo - prejemnikov sistem
        // bi sicer racun zavrnil ali napacno poknjizil DDV.
        const poStopnji = new Map()
        for (const item of lineItems) {
          const stopnja = Number(item.vat_rate ?? 22)
          const neto = Number(item.unit_price) * Number(item.quantity) * (1 - Number(item.discount_pct ?? 0) / 100)
          const o = poStopnji.get(stopnja) || { osnova: 0, ddv: 0 }
          o.osnova += neto
          o.ddv += neto * stopnja / 100
          poStopnji.set(stopnja, o)
        }
        // Ce postavk ni (starejsi racuni), ohranimo staro obnasanje.
        if (poStopnji.size === 0) {
          poStopnji.set(22, { osnova: Number(inv.amount_net), ddv: Number(inv.vat_amount) })
        }
        return Array.from(poStopnji.entries())
          .sort((a, b) => b[0] - a[0])
          .map(([stopnja, v]) => `<ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${v.ddv.toFixed(2)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${v.osnova.toFixed(2)}</ram:BasisAmount>
        <ram:CategoryCode>${stopnja > 0 ? 'S' : 'Z'}</ram:CategoryCode>
        <ram:RateApplicablePercent>${stopnja}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`).join('\n      ')
      })()}

      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${dueDate.replace(/-/g,'')}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>

      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${Number(inv.amount_net).toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${Number(inv.amount_net).toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${Number(inv.vat_amount).toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${Number(inv.amount_total).toFixed(2)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${Number(inv.amount_total).toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>

    </ram:ApplicableHeaderTradeSettlement>

  </rsm:SupplyChainTradeTransaction>

</rsm:CrossIndustryInvoice>`
  }

  function downloadESlog(inv: any) {
    const xml = generateESlog(inv)
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `eSlog-${inv.invoice_number}.xml`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Nalagam...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Domov</Link>
        <h1 className="font-semibold text-gray-900 mt-0.5">e-Račun (eSlog XML)</h1>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Info */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-6">
          <div className="font-medium text-blue-800 text-sm mb-2">📋 Kaj je eSlog?</div>
          <div className="text-blue-700 text-xs leading-relaxed">
            <strong>eSlog</strong> je slovenski standard za elektronske račune (EN 16931).
            Od 2026 je <strong>obvezen</strong> za fakturiranje državnim organom, občinam, šolam,
            bolnišnicam in javnim podjetjem (B2G).<br/><br/>
            Postopek: Prenesite XML → pošljite kupcu po e-pošti ali naložite na portal UJP.<br/>
            <strong>UJP portal:</strong> ujp.gov.si → e-Računi
          </div>
        </div>

        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-6">
          <div className="font-medium text-orange-800 text-sm mb-1">⚠️ Kdaj MORATE poslati eSlog?</div>
          <div className="text-orange-700 text-xs leading-relaxed">
            Ko fakturirate: državni organi, ministrstva, občine, šole, vrtci,
            bolnišnice, javna podjetja (DARS, Pošta...), univerze.
            Za zasebne stranke (d.o.o., s.p., fizične osebe) zadostuje navadni PDF račun.
          </div>
        </div>

        {/* Seznam računov */}
        {invoices.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-4">📄</div>
            <h3 className="font-semibold text-gray-900 mb-2">Ni računov</h3>
            <p className="text-gray-500 text-sm mb-4">Najprej ustvarite račun</p>
            <Link href="/invoices/new"
              className="bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-medium">
              + Nov račun
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-50 border-b border-gray-100">
              <div className="col-span-2 text-xs font-medium text-gray-500">Datum</div>
              <div className="col-span-2 text-xs font-medium text-gray-500">Številka</div>
              <div className="col-span-4 text-xs font-medium text-gray-500">Stranka</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">Znesek</div>
              <div className="col-span-2 text-xs font-medium text-gray-500 text-right">eSlog</div>
            </div>
            {invoices.map((inv, i) => (
              <div key={inv.id}
                className={`grid grid-cols-12 gap-2 px-6 py-4 items-center ${i < invoices.length-1 ? 'border-b border-gray-50' : ''}`}>
                <div className="col-span-2 text-xs text-gray-500">
                  {new Date(inv.issue_date).toLocaleDateString('sl-SI')}
                </div>
                <div className="col-span-2 text-xs font-mono text-gray-700">
                  #{inv.invoice_number}
                </div>
                <div className="col-span-4">
                  <div className="text-sm font-medium text-gray-900 truncate">{inv.client_name}</div>
                  {inv.client_tax_number && (
                    <div className="text-xs text-gray-400">{inv.client_tax_number}</div>
                  )}
                </div>
                <div className="col-span-2 text-right">
                  <div className="text-sm font-semibold">€{Number(inv.amount_total).toFixed(2)}</div>
                  <div className={`text-xs ${inv.status === 'paid' ? 'text-green-600' : 'text-orange-500'}`}>
                    {inv.status === 'paid' ? 'Plačano' : 'Poslano'}
                  </div>
                </div>
                <div className="col-span-2 flex justify-end">
                  <button
                    onClick={() => downloadESlog(inv)}
                    className="flex items-center gap-1.5 bg-gray-900 text-white rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-gray-700 transition-colors">
                    ⬇ XML
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Navodilo */}
        <div className="bg-gray-900 rounded-2xl p-5 mt-6 text-white">
          <div className="font-medium text-sm mb-3">📤 Kako poslati eSlog račun</div>
          <div className="space-y-2 text-xs text-gray-400">
            <div className="flex gap-3">
              <span className="text-white font-medium">1.</span>
              <span>Prenesite XML datoteko z gumbom ⬇ XML</span>
            </div>
            <div className="flex gap-3">
              <span className="text-white font-medium">2.</span>
              <span>Odprite <strong className="text-white">ujp.gov.si</strong> → Pošlji e-račun</span>
            </div>
            <div className="flex gap-3">
              <span className="text-white font-medium">3.</span>
              <span>Naložite XML datoteko in vnesite GLN kupca</span>
            </div>
            <div className="flex gap-3">
              <span className="text-white font-medium">4.</span>
              <span>Ali pa pošljite XML direktno po e-pošti če kupec to zahteva</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}