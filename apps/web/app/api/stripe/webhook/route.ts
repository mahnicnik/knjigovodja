import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Stripe signature verification brez stripe SDK
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = signature.split(',').reduce((acc: any, part) => {
      const [key, val] = part.split('=')
      acc[key] = val
      return acc
    }, {})

    const timestamp = parts['t']
    const sig = parts['v1']
    if (!timestamp || !sig) return false

    // HMAC-SHA256
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const data = encoder.encode(`${timestamp}.${payload}`)
    const hashBuffer = await crypto.subtle.sign('HMAC', key, data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const computed = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Timing-safe compare
    if (computed.length !== sig.length) return false
    let diff = 0
    for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ sig.charCodeAt(i)
    return diff === 0
  } catch { return false }
}

function invoiceNumber(count: number): string {
  const year = new Date().getFullYear()
  return `${year}-STR-${String(count + 1).padStart(3, '0')}`
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text()
    const signature = request.headers.get('stripe-signature') || ''

    // Najdi org po stripe_user_id ali webhook_secret iz URL params
    const url = new URL(request.url)
    const orgId = url.searchParams.get('org_id')

    if (!orgId) {
      return NextResponse.json({ error: 'Manjka org_id' }, { status: 400 })
    }

    // Naloži Stripe nastavitve za to org
    const { data: settings } = await sb
      .from('stripe_settings')
      .select('*')
      .eq('org_id', orgId)
      .single()

    if (!settings) {
      return NextResponse.json({ error: 'Stripe ni nastavljen' }, { status: 404 })
    }

    // Preveri Stripe signature
    const isValid = await verifyStripeSignature(payload, signature, settings.webhook_secret)
    if (!isValid) {
      return NextResponse.json({ error: 'Neveljavna Stripe signatura' }, { status: 401 })
    }

    const event = JSON.parse(payload)
    console.log(`Stripe event [${orgId}]: ${event.type}`)

    // Naloži org podatke
    const { data: org } = await sb.from('organizations').select('*').eq('id', orgId).single()
    if (!org) return NextResponse.json({ error: 'Org ne obstaja' }, { status: 404 })

    // Obdela evente
    switch (event.type) {

      case 'payment_intent.succeeded': {
        const pi = event.data.object
        const amount = pi.amount / 100 // centov v EUR
        const currency = pi.currency.toUpperCase()
        const customerName = pi.shipping?.name || pi.metadata?.customer_name || 'Stripe stranka'
        const customerEmail = pi.receipt_email || pi.metadata?.customer_email || ''
        const description = pi.description || pi.metadata?.description || 'Stripe plačilo'

        // DDV stopnja iz metadata ali default
        const vatRate = parseFloat(pi.metadata?.vat_rate || settings.default_vat_rate || '0')
        const amountNet = vatRate > 0 ? amount / (1 + vatRate / 100) : amount
        const vatAmount = amount - amountNet

        // Preštej obstoječe Stripe račune
        const { count } = await sb.from('issued_invoices')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .like('invoice_number', '%-STR-%')

        const invNum = invoiceNumber(count || 0)
        const today = new Date().toISOString().split('T')[0]
        const dueDate = today // že plačano

        await sb.from('issued_invoices').insert({
          org_id: orgId,
          invoice_number: invNum,
          invoice_type: 'invoice',
          client_name: customerName,
          client_email: customerEmail,
          issue_date: today,
          due_date: dueDate,
          line_items: [{
            description,
            quantity: 1,
            unit_price: amountNet,
            vat_rate: vatRate,
          }],
          amount_net: Math.round(amountNet * 100) / 100,
          vat_amount: Math.round(vatAmount * 100) / 100,
          amount_total: amount,
          status: 'paid',
          reference: `SI00 ${invNum}`,
          notes: `Stripe Payment Intent: ${pi.id}`,
          stripe_payment_id: pi.id,
        })

        console.log(`✅ Račun ${invNum} ustvarjen — ${customerName} €${amount}`)
        break
      }

      case 'invoice.paid': {
        const inv = event.data.object
        const amount = inv.amount_paid / 100
        const customerEmail = inv.customer_email || ''
        const customerName = inv.customer_name || inv.metadata?.customer_name || 'Stripe stranka'

        const vatRate = parseFloat(settings.default_vat_rate || '0')
        const amountNet = vatRate > 0 ? amount / (1 + vatRate / 100) : amount
        const vatAmount = amount - amountNet

        const { count } = await sb.from('issued_invoices')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId).like('invoice_number', '%-STR-%')

        const invNum = invoiceNumber(count || 0)
        const today = new Date().toISOString().split('T')[0]

        // Linijske postavke iz Stripe invoice items
        const lineItems = (inv.lines?.data || []).map((line: any) => ({
          description: line.description || 'Stripe narocnina',
          quantity: line.quantity || 1,
          unit_price: (line.amount / 100) / (line.quantity || 1),
          vat_rate: vatRate,
        }))

        await sb.from('issued_invoices').insert({
          org_id: orgId,
          invoice_number: invNum,
          invoice_type: 'invoice',
          client_name: customerName,
          client_email: customerEmail,
          issue_date: today,
          due_date: today,
          line_items: lineItems.length > 0 ? lineItems : [{
            description: 'Stripe narocnina',
            quantity: 1,
            unit_price: amountNet,
            vat_rate: vatRate,
          }],
          amount_net: Math.round(amountNet * 100) / 100,
          vat_amount: Math.round(vatAmount * 100) / 100,
          amount_total: amount,
          status: 'paid',
          reference: `SI00 ${invNum}`,
          notes: `Stripe Invoice: ${inv.id}`,
          stripe_payment_id: inv.id,
        })

        console.log(`✅ Račun ${invNum} ustvarjen iz Stripe Invoice — ${customerName} €${amount}`)
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object
        const refundAmount = charge.amount_refunded / 100
        const originalId = charge.payment_intent

        // Najdi originalni račun
        const { data: original } = await sb.from('issued_invoices')
          .select('*').eq('org_id', orgId)
          .eq('stripe_payment_id', originalId).single()

        if (original) {
          const { count } = await sb.from('issued_invoices')
            .select('*', { count: 'exact', head: true })
            .eq('org_id', orgId).like('invoice_number', '%-STR-%')

          const refundNum = `${invoiceNumber(count || 0)}-R`
          const today = new Date().toISOString().split('T')[0]

          await sb.from('issued_invoices').insert({
            org_id: orgId,
            invoice_number: refundNum,
            invoice_type: 'credit_note',
            client_name: original.client_name,
            client_email: original.client_email,
            issue_date: today,
            due_date: today,
            line_items: [{ description: `Vračilo za ${original.invoice_number}`, quantity: 1, unit_price: -refundAmount, vat_rate: 0 }],
            amount_net: -refundAmount,
            vat_amount: 0,
            amount_total: -refundAmount,
            status: 'paid',
            reference: `SI00 ${refundNum}`,
            notes: `Stripe vračilo za: ${originalId}`,
            stripe_payment_id: charge.id,
          })
          console.log(`✅ Dobropis ${refundNum} ustvarjen — vračilo €${refundAmount}`)
        }
        break
      }

      default:
        console.log(`Event ${event.type} se ignorira`)
    }

    return NextResponse.json({ received: true, event: event.type })
  } catch (error: any) {
    console.error('Stripe webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}