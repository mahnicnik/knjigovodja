import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import crypto from 'crypto'

/**
 * WooCommerce Webhook Handler
 *
 * Sprejme webhook od WooCommerce ob novem naročilu (order.created / order.completed).
 * Avtomatsko:
 * 1. Ustvari issued_invoice v Računko
 * 2. Doda KPO vnos (knjiga prihodkov)
 * 3. Pošlje PDF stranki po emailu (opcijsko)
 *
 * Nastavitev v WooCommerce:
 * WooCommerce → Nastavitve → Napredno → Webhooks → Dodaj webhook
 * - Ime: Računko
 * - Status: Aktiven
 * - Tema: Naročilo ustvarjeno (ali Naročilo zaključeno)
 * - URL: https://racunko.si/api/webhooks/woocommerce?org_id=VAŠ_ORG_ID
 * - Skrivnost: (generirano v Računko nastavitvah)
 */

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // Service role za webhook (brez user auth)
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set() {}, remove() {},
      },
    }
  )
}

/**
 * Preveri WooCommerce webhook podpis.
 * WooCommerce podpiše payload z HMAC-SHA256 in secret-om.
 */
function verifyWooCommerceSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    const computed = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('base64')
    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(signature)
    )
  } catch {
    return false
  }
}

/**
 * Generiraj številko računa v formatu: WC-YYYY-NNNN
 */
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
    .like('invoice_number', `WC-${year}-%`)

  const vzorec = new RegExp(`^WC-${year}-(\\d+)$`)
  const najvisja = (obstojeci ?? []).reduce((max: number, r: any) => {
    const m = vzorec.exec(String(r.invoice_number ?? ''))
    return m ? Math.max(max, parseInt(m[1], 10)) : max
  }, 0)

  const seq = String(najvisja + 1).padStart(4, '0')
  return `WC-${year}-${seq}`
}

export async function POST(req: NextRequest) {
  // POPRAVLJENO (30.7.2026): deklarirano PRED try, da sta dosegljiva
  // tudi v catch bloku (za beleženje napak v integration_logs).
  let orgId: string | null = null
  let supabase: any = null
  try {
    supabase = await getSupabase()

    // Pridobi org_id iz query params
    const { searchParams } = new URL(req.url)
    orgId = searchParams.get('org_id')

    if (!orgId) {
      return NextResponse.json({ error: 'org_id parameter manjka' }, { status: 400 })
    }

    // Preberi raw body za verifikacijo podpisa
    const rawBody = await req.text()
    const signature = req.headers.get('x-wc-webhook-signature') ?? ''

    // Pridobi webhook secret za to org
    const { data: integration } = await supabase
      .from('integrations')
      .select('webhook_secret, settings')
      .eq('org_id', orgId)
      .eq('type', 'woocommerce')
      .eq('is_active', true)
      .maybeSingle()

    if (!integration) {
      return NextResponse.json({ error: 'WooCommerce integracija ni nastavljena' }, { status: 404 })
    }

    // Preveri podpis (če je secret nastavljen)
    if (integration.webhook_secret && signature) {
      const isValid = verifyWooCommerceSignature(rawBody, signature, integration.webhook_secret)
      if (!isValid) {
        // DODANO (30.7.2026): beleži neveljaven podpis - prej se je
        // tiho zavrnilo brez sledi v /integracije.
        await supabase.from('integration_logs').insert({
          org_id: orgId,
          integration_type: 'woocommerce',
          status: 'failed',
          payload: { error: 'invalid_signature' },
        })
        return NextResponse.json({ error: 'Neveljaven podpis' }, { status: 401 })
      }
    }

    // Razčleni WooCommerce order
    const order = JSON.parse(rawBody)

    // Ignoriramo naročila ki niso zaključena/plačana
    const validStatuses = ['completed', 'processing']
    if (!validStatuses.includes(order.status)) {
      return NextResponse.json({ message: `Status ${order.status} ignoriran` }, { status: 200 })
    }

    // Preveri ali račun za to naročilo že obstaja
    const { data: existing } = await supabase
      .from('issued_invoices')
      .select('id')
      .eq('org_id', orgId)
      .eq('external_reference', `wc-${order.id}`)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ message: 'Račun že obstaja', invoiceId: existing.id }, { status: 200 })
    }

    // Pridobi org podatke
    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single()

    if (!org) {
      return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })
    }

    // Pripravi line items iz WooCommerce naročila
    // POPRAVLJENO (30.7.2026): uporabi DEJANSKI davek iz WooCommerce
    // (subtotal_tax / total_tax) namesto predpostavke 22% - trgovine z
    // izdelki po 9,5% (hrana, knjige, zdravila) so prej dobile napacen DDV.
    const lineItems = (order.line_items ?? []).map((item: any) => {
      const net = Number(item.subtotal) || 0
      const tax = Number(item.subtotal_tax ?? item.total_tax ?? 0)
      // Ce platforma davka ni poslala, pade nazaj na 22% (prejsnje vedenje)
      const effTax = org.vat_registered ? (tax > 0 ? tax : net * 0.22) : 0
      const effRate = net > 0 && effTax > 0 ? Math.round((effTax / net) * 1000) / 10 : (org.vat_registered ? 22 : 0)
      return {
        description: item.name,
        quantity: item.quantity,
        unit_price: Number(item.price),
        amount_net: net,
        vat_rate: effRate,
        vat_amount: Math.round(effTax * 100) / 100,
      }
    })

    const amountTotal = Number(order.total)
    const orderTax = Number(order.total_tax ?? 0)
    const vatAmount = org.vat_registered
      ? (orderTax > 0 ? orderTax : amountTotal - amountTotal / 1.22)
      : 0
    const amountNet = amountTotal - vatAmount

    // Stranka
    const clientName = `${order.billing?.first_name ?? ''} ${order.billing?.last_name ?? ''}`.trim()
      || order.billing?.company
      || 'Spletna stranka'

    const clientAddress = [
      order.billing?.address_1,
      order.billing?.city,
      order.billing?.postcode,
    ].filter(Boolean).join(', ')

    // Generiraj številko računa
    const invoiceNumber = await generateInvoiceNumber(supabase, orgId)

    // Datum
    const issueDate = new Date().toISOString().split('T')[0]
    const dueDate = issueDate // Spletne naročile so takoj plačane

    // Ustvari račun
    const { data: invoice, error: invErr } = await supabase
      .from('issued_invoices')
      .insert({
        org_id: orgId,
        invoice_number: invoiceNumber,
        invoice_type: 'invoice',
        client_name: clientName,
        client_address: clientAddress,
        client_email: order.billing?.email ?? null,
        client_tax_number: order.billing?.vat ?? null,
        issue_date: issueDate,
        due_date: dueDate,
        service_date_from: issueDate,
        service_date_to: issueDate,
        line_items: lineItems,
        amount_net: Math.round(amountNet * 100) / 100,
        vat_amount: Math.round(vatAmount * 100) / 100,
        amount_total: Math.round(amountTotal * 100) / 100,
        status: 'paid',
        paid_at: new Date().toISOString(),
        paid_amount: amountTotal,
        notes: `WooCommerce naročilo #${order.number ?? order.id}`,
        external_reference: `wc-${order.id}`,
      })
      .select('id')
      .single()

    if (invErr || !invoice) {
      throw new Error(`Napaka pri ustvarjanju računa: ${invErr?.message}`)
    }

    // Doda KPO vnos (knjiga prihodkov)
    // POPRAVLJENO (16.8.2026): prej brez preverbe napake - racun je nastal,
    // vnos v knjigo prihodkov pa ne. Webhook vrne uspeh, zato WooCommerce
    // dogodka NE ponovi in prihodek trajno manjka v davcni evidenci.
    const { error: kpoErr } = await supabase.from('kpo_entries').insert({
      org_id: orgId,
      entry_date: issueDate,
      description: `WooCommerce #${order.number ?? order.id} — ${clientName}`,
      entry_type: 'income',
      income: amountNet,
      vat_out: vatAmount,
      invoice_id: invoice.id,
      category: 'spletna_prodaja',
      notes: `Avtomatski vnos iz WooCommerce`,
    })
    if (kpoErr) {
      console.error('WooCommerce webhook: racun je nastal, vnos v KPO knjigo pa NI uspel:', kpoErr)
      await supabase.from('integration_logs').insert({
        org_id: orgId,
        integration_type: 'woocommerce',
        status: 'failed',
        payload: { error: 'kpo_entry_failed', message: kpoErr.message, invoice_id: invoice?.id },
      })
    }

    // Log uspešne integracije
    await supabase.from('integration_logs').insert({
      org_id: orgId,
      integration_type: 'woocommerce',
      external_id: String(order.id),
      invoice_id: invoice.id,
      status: 'success',
      payload: { order_number: order.number, total: order.total },
    })

    return NextResponse.json({
      success: true,
      invoiceId: invoice.id,
      invoiceNumber,
      message: `Račun ${invoiceNumber} ustvarjen za naročilo #${order.number ?? order.id}`,
    })

  } catch (e: any) {
    console.error('WooCommerce webhook error:', e)
    // DODANO (30.7.2026): beleži splošno napako - prej se je obdelava
    // lahko podrla brez sledi v /integracije ("zakaj se ni poknjižilo").
    // orgId/supabase sta zdaj dosegljiva tudi tu (dvignjena pred try).
    if (orgId && supabase) {
      await supabase.from('integration_logs').insert({
        org_id: orgId,
        integration_type: 'woocommerce',
        status: 'failed',
        payload: { error: String(e?.message || e) },
      }).then(() => {}, () => {})
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}