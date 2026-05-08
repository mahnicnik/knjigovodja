import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function verifyStripeSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const parts = signature.split(',').reduce((acc: any, part) => {
      const [key, val] = part.split('='); acc[key] = val; return acc
    }, {})
    const timestamp = parts['t']
    const sig = parts['v1']
    if (!timestamp || !sig) return false
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const data = encoder.encode(`${timestamp}.${payload}`)
    const hashBuffer = await crypto.subtle.sign('HMAC', key, data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const computed = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    if (computed.length !== sig.length) return false
    let diff = 0
    for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ sig.charCodeAt(i)
    return diff === 0
  } catch { return false }
}

function invoiceNum(prefix: string, count: number): string {
  return `${new Date().getFullYear()}-${prefix}-${String(count + 1).padStart(3, '0')}`
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text()
    const signature = request.headers.get('stripe-signature') || ''
    const url = new URL(request.url)
    const orgId = url.searchParams.get('org_id')
    const mode = url.searchParams.get('mode') || 'payout' // 'payout' ali 'per_purchase'

    if (!orgId) return NextResponse.json({ error: 'Manjka org_id' }, { status: 400 })

    const { data: settings } = await sb.from('stripe_settings').select('*').eq('org_id', orgId).single()
    if (!settings) return NextResponse.json({ error: 'Stripe ni nastavljen' }, { status: 404 })

    const isValid = await verifyStripeSignature(payload, signature, settings.webhook_secret)
    if (!isValid) return NextResponse.json({ error: 'Neveljavna Stripe signatura' }, { status: 401 })

    const event = JSON.parse(payload)
    const { data: org } = await sb.from('organizations').select('*').eq('id', orgId).single()
    if (!org) return NextResponse.json({ error: 'Org ne obstaja' }, { status: 404 })

    const today = new Date().toISOString().split('T')[0]
    const vatRate = parseFloat(settings.default_vat_rate || '0')

    switch (event.type) {

      // ── PAYOUT.PAID — 1 račun za celoten payout ──────────────────────────
      case 'payout.paid': {
        const payout = event.data.object
        const amount = payout.amount / 100
        const amountNet = vatRate > 0 ? amount / (1 + vatRate / 100) : amount
        const vatAmount = amount - amountNet

        const arrivalDate = new Date(payout.arrival_date * 1000).toISOString().split('T')[0]
        const periodStart = payout.metadata?.period_start || arrivalDate
        const periodEnd = payout.metadata?.period_end || arrivalDate

        const { count } = await sb.from('issued_invoices')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId).like('invoice_number', '%-PAY-%')

        const num = invoiceNum('PAY', count || 0)
        const desc = `Stripe izplačilo — ${new Date(payout.arrival_date * 1000).toLocaleDateString('sl-SI', { day: 'numeric', month: 'long', year: 'numeric' })}`

        await sb.from('issued_invoices').insert({
          org_id: orgId,
          invoice_number: num,
          invoice_type: 'invoice',
          client_name: 'Stripe — izplačilo',
          client_email: '',
          issue_date: arrivalDate,
          due_date: arrivalDate,
          line_items: [{
            description: desc,
            quantity: 1,
            unit_price: amountNet,
            vat_rate: vatRate,
          }],
          amount_net: Math.round(amountNet * 100) / 100,
          vat_amount: Math.round(vatAmount * 100) / 100,
          amount_total: amount,
          status: 'paid',
          reference: `SI00 ${num}`,
          notes: `Stripe Payout ID: ${payout.id} · Obdobje: ${periodStart} – ${periodEnd} · Valuta: ${payout.currency.toUpperCase()}`,
          stripe_payment_id: payout.id,
        })

        // Shrani tudi v stripe_payouts tabelo za sledenje
        await sb.from('stripe_payouts').upsert({
          org_id: orgId,
          payout_id: payout.id,
          amount: amount,
          currency: payout.currency.toUpperCase(),
          arrival_date: arrivalDate,
          invoice_number: num,
          status: 'paid',
          created_at: new Date().toISOString(),
        }, { onConflict: 'payout_id' })// ignorira če tabela ne obstaja

        console.log(`✅ Payout račun ${num} — €${amount} (${arrivalDate})`)
        break
      }

      // ── PAYMENT_INTENT.SUCCEEDED — individualni račun (za per_purchase mode) ──
      case 'payment_intent.succeeded': {
        if (mode !== 'per_purchase') {
          console.log('payment_intent ignoriran — mode je payout')
          break
        }
        const pi = event.data.object
        const amount = pi.amount / 100
        const amountNet = vatRate > 0 ? amount / (1 + vatRate / 100) : amount
        const vatAmount = amount - amountNet
        const customerName = pi.shipping?.name || pi.metadata?.customer_name || 'Stripe stranka'
        const customerEmail = pi.receipt_email || pi.metadata?.customer_email || ''
        const description = pi.description || pi.metadata?.description || 'Stripe plačilo'

        const { count } = await sb.from('issued_invoices')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId).like('invoice_number', '%-STR-%')

        const num = invoiceNum('STR', count || 0)

        await sb.from('issued_invoices').insert({
          org_id: orgId,
          invoice_number: num,
          invoice_type: 'invoice',
          client_name: customerName,
          client_email: customerEmail,
          issue_date: today,
          due_date: today,
          line_items: [{ description, quantity: 1, unit_price: amountNet, vat_rate: vatRate }],
          amount_net: Math.round(amountNet * 100) / 100,
          vat_amount: Math.round(vatAmount * 100) / 100,
          amount_total: amount,
          status: 'paid',
          reference: `SI00 ${num}`,
          notes: `Stripe Payment Intent: ${pi.id}`,
          stripe_payment_id: pi.id,
        })
        console.log(`✅ Per-purchase račun ${num} — ${customerName} €${amount}`)
        break
      }

      // ── INVOICE.PAID — Stripe naročnine ──────────────────────────────────
      case 'invoice.paid': {
        if (mode !== 'per_purchase') {
          console.log('invoice.paid ignoriran — mode je payout')
          break
        }
        const inv = event.data.object
        const amount = inv.amount_paid / 100
        const amountNet = vatRate > 0 ? amount / (1 + vatRate / 100) : amount
        const vatAmount = amount - amountNet

        const { count } = await sb.from('issued_invoices')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId).like('invoice_number', '%-STR-%')

        const num = invoiceNum('STR', count || 0)
        const lineItems = (inv.lines?.data || []).map((line: any) => ({
          description: line.description || 'Stripe naročnina',
          quantity: line.quantity || 1,
          unit_price: (line.amount / 100) / (line.quantity || 1),
          vat_rate: vatRate,
        }))

        await sb.from('issued_invoices').insert({
          org_id: orgId,
          invoice_number: num,
          invoice_type: 'invoice',
          client_name: inv.customer_name || 'Stripe stranka',
          client_email: inv.customer_email || '',
          issue_date: today,
          due_date: today,
          line_items: lineItems.length > 0 ? lineItems : [{ description: 'Stripe naročnina', quantity: 1, unit_price: amountNet, vat_rate: vatRate }],
          amount_net: Math.round(amountNet * 100) / 100,
          vat_amount: Math.round(vatAmount * 100) / 100,
          amount_total: amount,
          status: 'paid',
          reference: `SI00 ${num}`,
          notes: `Stripe Invoice: ${inv.id}`,
          stripe_payment_id: inv.id,
        })
        console.log(`✅ Naročnina ${num} — €${amount}`)
        break
      }

      // ── PAYOUT.FAILED ─────────────────────────────────────────────────────
      case 'payout.failed': {
        const payout = event.data.object
        console.warn(`⚠️ Stripe payout neuspešen: ${payout.id} — ${payout.failure_message}`)
        // Opcijsko: pošlji email obvestilo
        break
      }

      // ── CHARGE.REFUNDED — vračilo ─────────────────────────────────────────
      case 'charge.refunded': {
        const charge = event.data.object
        const refundAmount = charge.amount_refunded / 100

        const { count } = await sb.from('issued_invoices')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId).like('invoice_number', '%-REF-%')

        const num = invoiceNum('REF', count || 0)

        await sb.from('issued_invoices').insert({
          org_id: orgId,
          invoice_number: num,
          invoice_type: 'credit_note',
          client_name: 'Stripe — vračilo',
          client_email: '',
          issue_date: today,
          due_date: today,
          line_items: [{ description: `Stripe vračilo — ${charge.id}`, quantity: 1, unit_price: -refundAmount, vat_rate: 0 }],
          amount_net: -refundAmount,
          vat_amount: 0,
          amount_total: -refundAmount,
          status: 'paid',
          reference: `SI00 ${num}`,
          notes: `Stripe vračilo za: ${charge.payment_intent}`,
          stripe_payment_id: charge.id,
        })
        console.log(`✅ Vračilo ${num} — €${refundAmount}`)
        break
      }

      default:
        console.log(`Event ${event.type} se ignorira`)
    }

    return NextResponse.json({ received: true, event: event.type, mode })
  } catch (error: any) {
    console.error('Stripe webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}