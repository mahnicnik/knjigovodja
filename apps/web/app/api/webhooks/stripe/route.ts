import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { confirmIssuedInvoiceWithFurs } from '@/lib/furs-invoice-confirm'

/**
 * Stripe Webhook Handler — za uporabnikove lastne Stripe naročnine/plačila
 *
 * Sprejme webhook od uporabnikovega lastnega Stripe accounta (npr. njegove
 * SaaS aplikacije) ob uspešnem plačilu in avtomatsko:
 * 1. Ustvari issued_invoice v Računko
 * 2. Doda KPO vnos (knjiga prihodkov)
 *
 * Nastavitev v Stripe dashboardu uporabnika:
 * Stripe → Developers → Webhooks → Add endpoint
 * - URL: https://racunko.si/api/webhooks/stripe?org_id=VAŠ_ORG_ID
 * - Events: checkout.session.completed, invoice.paid
 * - Signing secret: (vnesi v Računko nastavitve → Integracije → Stripe)
 *
 * POMEMBNO: To je webhook za UPORABNIKOV lasten Stripe account (npr. za
 * njegovo aplikacijo ki pobira plačila), NE za Računko subscription Stripe.
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
 * Preveri Stripe webhook podpis (HMAC-SHA256 po Stripe specifikaciji).
 * Stripe pošlje header: t=timestamp,v1=signature
 */
function verifyStripeSignature(payload: string, sigHeader: string, secret: string): boolean {
  try {
    const parts = sigHeader.split(',').reduce((acc: Record<string, string>, part) => {
      const [k, v] = part.split('=')
      acc[k] = v
      return acc
    }, {})
    const timestamp = parts['t']
    const signature = parts['v1']
    if (!timestamp || !signature) return false

    const signedPayload = `${timestamp}.${payload}`
    const computed = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')

    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
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
    .like('invoice_number', `STR-${year}-%`)

  const seq = String((count ?? 0) + 1).padStart(4, '0')
  return `STR-${year}-${seq}`
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
    const signature = req.headers.get('stripe-signature') ?? ''

    const { data: integration } = await supabase
      .from('integrations')
      .select('webhook_secret, settings')
      .eq('org_id', orgId)
      .eq('type', 'stripe')
      .eq('is_active', true)
      .maybeSingle()

    if (!integration) {
      return NextResponse.json({ error: 'Stripe integracija ni nastavljena' }, { status: 404 })
    }

    if (integration.webhook_secret && signature) {
      const isValid = verifyStripeSignature(rawBody, signature, integration.webhook_secret)
      if (!isValid) {
        return NextResponse.json({ error: 'Neveljaven podpis' }, { status: 401 })
      }
    }

    const event = JSON.parse(rawBody)

    // Obravnavamo samo dogodke uspešnega plačila
    const handledEvents = ['checkout.session.completed', 'invoice.paid', 'payment_intent.succeeded']
    if (!handledEvents.includes(event.type)) {
      return NextResponse.json({ message: `Event ${event.type} ignoriran` }, { status: 200 })
    }

    const obj = event.data.object

    // Preveri ali račun za ta Stripe objekt že obstaja
    const externalRef = `stripe-${obj.id}`
    const { data: existing } = await supabase
      .from('issued_invoices')
      .select('id')
      .eq('org_id', orgId)
      .eq('external_reference', externalRef)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ message: 'Račun že obstaja', invoiceId: existing.id }, { status: 200 })
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single()

    if (!org) {
      return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })
    }

    // Znesek je v Stripe vedno v najmanjši enoti valute (centi)
    const amountTotal = (obj.amount_total ?? obj.amount_paid ?? obj.amount ?? 0) / 100
    if (amountTotal <= 0) {
      return NextResponse.json({ message: 'Znesek 0 — preskočeno' }, { status: 200 })
    }

    const amountNet = amountTotal / (org.vat_registered ? 1.22 : 1)
    const vatAmount = org.vat_registered ? amountTotal - amountNet : 0

    // Stranka — Stripe checkout session ima customer_details, invoice ima customer_email
    const customerEmail = obj.customer_details?.email ?? obj.customer_email ?? null
    const customerName = obj.customer_details?.name ?? obj.customer_name ?? customerEmail ?? 'Stranka iz Stripe'

    const description = obj.description ?? `Stripe plačilo #${obj.id}`

    const lineItems = [{
      description,
      quantity: 1,
      unit_price: Math.round(amountNet * 100) / 100,
      amount_net: Math.round(amountNet * 100) / 100,
      vat_rate: org.vat_registered ? 22 : 0,
      vat_amount: Math.round(vatAmount * 100) / 100,
    }]

    const invoiceNumber = await generateInvoiceNumber(supabase, orgId)
    const issueDate = new Date().toISOString().split('T')[0]

    const { data: invoice, error: invErr } = await supabase
      .from('issued_invoices')
      .insert({
        org_id: orgId,
        invoice_number: invoiceNumber,
        invoice_type: 'invoice',
        client_name: customerName,
        client_email: customerEmail,
        issue_date: issueDate,
        due_date: issueDate,
        service_date_from: issueDate,
        service_date_to: issueDate,
        line_items: lineItems,
        amount_net: Math.round(amountNet * 100) / 100,
        vat_amount: Math.round(vatAmount * 100) / 100,
        amount_total: Math.round(amountTotal * 100) / 100,
        status: 'paid',
        paid_at: new Date().toISOString(),
        paid_amount: amountTotal,
        notes: `Stripe plačilo — ${event.type} (${obj.id})`,
        external_reference: externalRef,
      })
      .select('id')
      .single()

    if (invErr || !invoice) {
      throw new Error(`Napaka pri ustvarjanju računa: ${invErr?.message}`)
    }

    await supabase.from('kpo_entries').insert({
      org_id: orgId,
      entry_date: issueDate,
      description: `Stripe — ${customerName}`,
      entry_type: 'income',
      income: amountNet,
      vat_out: vatAmount,
      invoice_id: invoice.id,
      category: 'spletna_prodaja',
      notes: `Avtomatski vnos iz Stripe`,
    })

    // ────────────────────────────────────────────────────────────────
    // FURS davcno potrjevanje (dodano 21.7.2026) - Stripe placilo se po
    // ZDavPR steje kot gotovinsko poslovanje (placilo preko posrednika,
    // ne neposredno nakazilo na TRR), zato MORA biti davcno potrjeno.
    //
    // KLJUCNO: ce FURS potrditev spodleti (timeout/napaka/ni certifikata/
    // ni Pro paketa), webhook NE sme vrniti napake - Stripe bi ga potem
    // agresivno retry-jal, kar bi le podvajalo neuspesne poskuse (racun
    // ze obstaja zaradi external_reference dedup zgoraj, a FURS klic bi
    // se vseeno ponavljal v neskoncnost). Napaka se namesto tega zabelezi
    // v furs_log (znotraj confirmIssuedInvoiceWithFurs) za rocno/kasnejso
    // dosaditev - enak vzorec kot POS zvoncek za nepotrjene racune.
    //
    // OPOMBA: fiskalizacija je trenutno vezana na Pro paket (isPro check
    // v api/furs/confirm/route.ts) - TU te omejitve namenoma NI, ker gre
    // za avtomatski webhook brez uporabniske seje. Ce org ni Pro in nima
    // certifikata/prostora nastavljenega, confirmIssuedInvoiceWithFurs
    // preprosto vrne { success:false, error:'...' } in se zabelezi v log,
    // racun pa ostane neizpodbitno ustvarjen (pravilno stanje za placnika).
    let fursResult: Awaited<ReturnType<typeof confirmIssuedInvoiceWithFurs>> | null = null
    try {
      fursResult = await confirmIssuedInvoiceWithFurs(supabase, orgId, invoice.id, 'card')
      if (!fursResult.success) {
        console.error('FURS fiskalizacija Stripe racuna ni uspela (zabelezeno v furs_log):', invoice.id, fursResult.error)
      }
    } catch (fursErr: any) {
      console.error('FURS fiskalizacija Stripe racuna - nepricakovana napaka:', invoice.id, fursErr.message)
    }

    await supabase.from('integration_logs').insert({
      org_id: orgId,
      integration_type: 'stripe',
      external_id: obj.id,
      invoice_id: invoice.id,
      status: 'success',
      payload: { event_type: event.type, amount_total: amountTotal },
    })

    return NextResponse.json({
      success: true,
      invoiceId: invoice.id,
      invoiceNumber,
      message: `Račun ${invoiceNumber} ustvarjen za Stripe plačilo ${obj.id}`,
      fursConfirmed: fursResult?.success ?? false,
      fursError: fursResult?.success ? undefined : fursResult?.error,
    })

  } catch (e: any) {
    console.error('Stripe integration webhook error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
