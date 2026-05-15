import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import crypto from 'crypto'

/**
 * Shopify Webhook Handler
 *
 * Sprejme webhook od Shopify ob novem naročilu (orders/paid).
 * Avtomatsko:
 * 1. Ustvari issued_invoice v Računko
 * 2. Doda KPO vnos (knjiga prihodkov)
 *
 * Nastavitev v Shopify:
 * Shopify Admin → Nastavitve → Obvestila → Webhooks → Ustvari webhook
 * - Dogodek: Naročilo plačano (orders/paid)
 * - Format: JSON
 * - URL: https://racunko.si/api/webhooks/shopify?org_id=VAŠ_ORG_ID
 */

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set() {}, remove() {},
      },
    }
  )
}

/**
 * Preveri Shopify webhook podpis (HMAC-SHA256).
 */
function verifyShopifySignature(
  payload: string,
  hmacHeader: string,
  secret: string
): boolean {
  try {
    const computed = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('base64')
    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(hmacHeader)
    )
  } catch {
    return false
  }
}

async function generateInvoiceNumber(supabase: any, orgId: string): Promise<string> {
  const year = new Date().getFullYear()
  const { count } = await supabase
    .from('issued_invoices')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .like('invoice_number', `SH-${year}-%`)

  const seq = String((count ?? 0) + 1).padStart(4, '0')
  return `SH-${year}-${seq}`
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase()

    const { searchParams } = new URL(req.url)
    const orgId = searchParams.get('org_id')

    if (!orgId) {
      return NextResponse.json({ error: 'org_id parameter manjka' }, { status: 400 })
    }

    const rawBody = await req.text()
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256') ?? ''
    const topic = req.headers.get('x-shopify-topic') ?? ''

    // Pridobi integracijo
    const { data: integration } = await supabase
      .from('integrations')
      .select('webhook_secret, settings')
      .eq('org_id', orgId)
      .eq('type', 'shopify')
      .eq('is_active', true)
      .maybeSingle()

    if (!integration) {
      return NextResponse.json({ error: 'Shopify integracija ni nastavljena' }, { status: 404 })
    }

    // Preveri podpis
    if (integration.webhook_secret && hmacHeader) {
      const isValid = verifyShopifySignature(rawBody, hmacHeader, integration.webhook_secret)
      if (!isValid) {
        return NextResponse.json({ error: 'Neveljaven podpis' }, { status: 401 })
      }
    }

    // Samo orders/paid ali orders/create procesiramo
    if (!['orders/paid', 'orders/create', 'orders/updated'].includes(topic)) {
      return NextResponse.json({ message: `Topic ${topic} ignoriran` }, { status: 200 })
    }

    const order = JSON.parse(rawBody)

    // Samo plačana naročila
    if (order.financial_status !== 'paid') {
      return NextResponse.json({ message: `Status ${order.financial_status} ignoriran` }, { status: 200 })
    }

    // Preveri duplikat
    const { data: existing } = await supabase
      .from('issued_invoices')
      .select('id')
      .eq('org_id', orgId)
      .eq('external_reference', `sh-${order.id}`)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ message: 'Račun že obstaja', invoiceId: existing.id }, { status: 200 })
    }

    // Pridobi org
    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single()

    if (!org) return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })

    // Line items
    const lineItems = (order.line_items ?? []).map((item: any) => ({
      description: item.title + (item.variant_title ? ` — ${item.variant_title}` : ''),
      quantity: item.quantity,
      unit_price: Number(item.price),
      amount_net: Number(item.price) * item.quantity,
      vat_rate: org.vat_registered ? 22 : 0,
      vat_amount: org.vat_registered ? Number(item.price) * item.quantity * 0.22 : 0,
    }))

    const amountTotal = Number(order.total_price)
    const amountNet = org.vat_registered
      ? amountTotal / 1.22
      : amountTotal
    const vatAmount = amountTotal - amountNet

    // Stranka
    const billing = order.billing_address ?? order.shipping_address ?? {}
    const clientName = order.billing_address
      ? `${billing.first_name ?? ''} ${billing.last_name ?? ''}`.trim() || billing.company || 'Shopify stranka'
      : order.email ?? 'Shopify stranka'

    const clientAddress = [
      billing.address1,
      billing.city,
      billing.zip,
      billing.country_code,
    ].filter(Boolean).join(', ')

    const invoiceNumber = await generateInvoiceNumber(supabase, orgId)
    const issueDate = new Date().toISOString().split('T')[0]

    // Ustvari račun
    const { data: invoice, error: invErr } = await supabase
      .from('issued_invoices')
      .insert({
        org_id: orgId,
        invoice_number: invoiceNumber,
        invoice_type: 'invoice',
        client_name: clientName,
        client_address: clientAddress || null,
        client_email: order.email ?? null,
        issue_date: issueDate,
        due_date: issueDate,
        service_date_from: issueDate,
        service_date_to: issueDate,
        line_items: lineItems,
        amount_net: Math.round(amountNet * 100) / 100,
        vat_amount: Math.round(vatAmount * 100) / 100,
        amount_total: Math.round(amountTotal * 100) / 100,
        status: 'paid',
        paid_at: order.processed_at ?? new Date().toISOString(),
        paid_amount: amountTotal,
        notes: `Shopify naročilo #${order.order_number ?? order.name}`,
        external_reference: `sh-${order.id}`,
      })
      .select('id')
      .single()

    if (invErr || !invoice) {
      throw new Error(`Napaka pri ustvarjanju računa: ${invErr?.message}`)
    }

    // KPO vnos
    await supabase.from('kpo_entries').insert({
      org_id: orgId,
      entry_date: issueDate,
      description: `Shopify #${order.order_number ?? order.name} — ${clientName}`,
      entry_type: 'income',
      income: Math.round(amountNet * 100) / 100,
      vat_out: Math.round(vatAmount * 100) / 100,
      invoice_id: invoice.id,
      category: 'spletna_prodaja',
      notes: 'Avtomatski vnos iz Shopify',
    })

    // Log
    await supabase.from('integration_logs').insert({
      org_id: orgId,
      integration_type: 'shopify',
      external_id: String(order.id),
      invoice_id: invoice.id,
      status: 'success',
      payload: { order_number: order.order_number, total: order.total_price },
    }))

    return NextResponse.json({
      success: true,
      invoiceId: invoice.id,
      invoiceNumber,
      message: `Račun ${invoiceNumber} ustvarjen za Shopify naročilo #${order.order_number}`,
    })

  } catch (e: any) {
    console.error('Shopify webhook error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}