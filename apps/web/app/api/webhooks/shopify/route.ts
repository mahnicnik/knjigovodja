import { NextRequest, NextResponse } from 'next/server'
import { lokalniDatum } from '@/lib/tax-constants'
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
  // POPRAVLJENO (16.8.2026): stevilka se je dolocala s STETJEM obstojecih
  // racunov, ne z najvisjo. Dve tezavi:
  //  1. Ob brisanju racuna se stevec zmanjsa in nova stevilka TRCI z obstojeco.
  //     Vpis zavrne omejitev v bazi, webhook spodleti, ponudnik poskusa znova -
  //     placilo je prejeto, racun pa ne nastane.
  //  2. Vzorec je stel tudi storno zapise s pripono -S/-D, zato je stevec rasel
  //     hitreje od dejanskih racunov in preskakoval stevilke.
  // Zdaj vzamemo NAJVISJO obstojeco stevilko in ji pristejemo ena, pripone pa
  // izloCimo.
  const { data: obstojeci } = await supabase
    .from('issued_invoices')
    .select('invoice_number')
    .eq('org_id', orgId)
    .like('invoice_number', `SH-${year}-%`)

  const vzorec = new RegExp(`^SH-${year}-(\\d+)$`)
  const najvisja = (obstojeci ?? []).reduce((max: number, r: any) => {
    const m = vzorec.exec(String(r.invoice_number ?? ''))
    return m ? Math.max(max, parseInt(m[1], 10)) : max
  }, 0)

  const seq = String(najvisja + 1).padStart(4, '0')
  return `SH-${year}-${seq}`
}

export async function POST(req: NextRequest) {
  let orgId: string | null = null
  let supabase: any = null
  try {
    supabase = await getSupabase()

    const { searchParams } = new URL(req.url)
    orgId = searchParams.get('org_id')

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
        // DODANO (30.7.2026): beleži neveljaven podpis - prej se je
        // tiho zavrnilo brez sledi v /integracije.
        await supabase.from('integration_logs').insert({
          org_id: orgId,
          integration_type: 'shopify',
          status: 'failed',
          payload: { error: 'invalid_signature' },
        })
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
    // POPRAVLJENO (30.7.2026): uporabi DEJANSKI davek iz Shopify
    // (tax_lines / total_tax) namesto predpostavke 22%.
    const lineItems = (order.line_items ?? []).map((item: any) => {
      const net = Number(item.price) * item.quantity
      const taxFromLines = (item.tax_lines ?? []).reduce((s: number, t: any) => s + Number(t.price ?? 0), 0)
      const effTax = org.vat_registered ? (taxFromLines > 0 ? taxFromLines : net * 0.22) : 0
      const effRate = net > 0 && effTax > 0 ? Math.round((effTax / net) * 1000) / 10 : (org.vat_registered ? 22 : 0)
      return {
        description: item.title + (item.variant_title ? ` — ${item.variant_title}` : ''),
        quantity: item.quantity,
        unit_price: Number(item.price),
        amount_net: net,
        vat_rate: effRate,
        vat_amount: Math.round(effTax * 100) / 100,
      }
    })

    const amountTotal = Number(order.total_price)
    const orderTax = Number(order.total_tax ?? 0)
    const vatAmount = org.vat_registered
      ? (orderTax > 0 ? orderTax : amountTotal - amountTotal / 1.22)
      : 0
    const amountNet = amountTotal - vatAmount

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
    const issueDate = lokalniDatum()

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
    // POPRAVLJENO (16.8.2026): prej brez preverbe napake - racun je nastal,
    // vnos v knjigo prihodkov pa ne. Webhook vrne uspeh, zato Shopify
    // dogodka NE ponovi in prihodek trajno manjka v davcni evidenci.
    const { error: kpoErr } = await supabase.from('kpo_entries').insert({
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
    if (kpoErr) {
      console.error('Shopify webhook: racun je nastal, vnos v KPO knjigo pa NI uspel:', kpoErr)
      await supabase.from('integration_logs').insert({
        org_id: orgId,
        integration_type: 'shopify',
        status: 'failed',
        payload: { error: 'kpo_entry_failed', message: kpoErr.message, invoice_id: invoice?.id },
      })
    }

    // Log
    await supabase.from('integration_logs').insert({
      org_id: orgId,
      integration_type: 'shopify',
      external_id: String(order.id),
      invoice_id: invoice.id,
      status: 'success',
      payload: { order_number: order.order_number, total: order.total_price },
    })

    return NextResponse.json({
      success: true,
      invoiceId: invoice.id,
      invoiceNumber,
      message: `Račun ${invoiceNumber} ustvarjen za Shopify naročilo #${order.order_number}`,
    })

  } catch (e: any) {
    console.error('Shopify webhook error:', e)
    // DODANO (30.7.2026): beleži splošno napako - prej se je obdelava
    // lahko podrla brez sledi v /integracije ("zakaj se ni poknjižilo").
    // orgId/supabase sta zdaj dosegljiva tudi tu (dvignjena pred try).
    if (orgId && supabase) {
      await supabase.from('integration_logs').insert({
        org_id: orgId,
        integration_type: 'shopify',
        status: 'failed',
        payload: { error: String(e?.message || e) },
      }).then(() => {}, () => {})
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}