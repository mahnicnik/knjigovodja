import { NextRequest, NextResponse } from 'next/server'
import { lokalniDatum } from '@/lib/tax-constants'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { confirmIssuedInvoiceWithFurs } from '@/lib/furs-invoice-confirm'
import { renderToBuffer } from '@react-pdf/renderer'
import { InvoicePDF, generateUpnQr, generateFursQr } from '@/lib/invoice-pdf'
import { buildInvoiceEmailHtml } from '@/lib/invoice-email'
import { resend, FROM_EMAIL } from '@/lib/resend'

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
    .like('invoice_number', `STR-${year}-%`)

  const vzorec = new RegExp(`^STR-${year}-(\\d+)$`)
  const najvisja = (obstojeci ?? []).reduce((max: number, r: any) => {
    const m = vzorec.exec(String(r.invoice_number ?? ''))
    return m ? Math.max(max, parseInt(m[1], 10)) : max
  }, 0)

  const seq = String(najvisja + 1).padStart(4, '0')
  return `STR-${year}-${seq}`
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
        // DODANO (30.7.2026): beleži neveljaven podpis - prej se je
        // tiho zavrnilo brez sledi v /integracije.
        await supabase.from('integration_logs').insert({
          org_id: orgId,
          integration_type: 'stripe',
          status: 'failed',
          payload: { error: 'invalid_signature' },
        })
        return NextResponse.json({ error: 'Neveljaven podpis' }, { status: 401 })
      }
    }

    const event = JSON.parse(rawBody)

    // Obravnavamo samo dogodke uspešnega plačila
    // POPRAVLJENO 22.7.2026: payment_intent.succeeded ODSTRANJEN - en nakup
    // sprozi tako checkout.session.completed kot payment_intent.succeeded
    // (dva razlicna objekta z razlicnima ID-jema za isto placilo), kar je
    // ustvarilo PODVOJENE racune. checkout.session.completed pokrije payment
    // linke/checkout, invoice.paid pokrije narocnine.
    const handledEvents = ['checkout.session.completed', 'invoice.paid']
    if (!handledEvents.includes(event.type)) {
      return NextResponse.json({ message: `Event ${event.type} ignoriran` }, { status: 200 })
    }

    const obj = event.data.object

    // POPRAVLJENO (11.8.2026, najdba pri zivem testiranju): pri NAROCNINI
    // (subscription) checkout.session.completed IN invoice.paid OBA
    // sprozita ob prvem placilu - a imata RAZLICNA Stripe ID-ja (cs_live_
    // proti in_), zato ju obstojeca dedup zascita (po obj.id) NE prepozna
    // kot isto transakcijo -> podvojen racun. Za narocnine je invoice.paid
    // PRAVI vir resnice (sprozi se tudi za VSAKO naslednjo obnovitev), zato
    // checkout.session.completed za mode:'subscription' PRESKOCIMO.
    // Za enkratna placila (mode:'payment') checkout.session.completed
    // ostane edini/pravilni dogodek - nespremenjeno.
    if (event.type === 'checkout.session.completed' && obj.mode === 'subscription') {
      return NextResponse.json({ message: 'Checkout za narocnino - caka se invoice.paid' }, { status: 200 })
    }

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
    const issueDate = lokalniDatum()

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

    // POPRAVLJENO (16.8.2026): prej brez preverbe napake - racun je nastal,
    // vnos v knjigo prihodkov pa ne. Ker webhook vrne uspeh, Stripe dogodka
    // NE bi ponovil, zato bi prihodek trajno manjkal v davcni evidenci, brez
    // sledi. Zdaj se zabelezi v integration_logs za rocni pregled.
    const { error: kpoErr } = await supabase.from('kpo_entries').insert({
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
    if (kpoErr) {
      console.error('Stripe webhook: racun', invoiceNumber, 'je nastal, vnos v KPO knjigo pa NI uspel:', kpoErr)
      await supabase.from('integration_logs').insert({
        org_id: orgId,
        integration_type: 'stripe',
        status: 'failed',
        payload: {
          error: 'kpo_entry_failed',
          message: kpoErr.message,
          invoice_number: invoiceNumber,
          invoice_id: invoice.id,
          amount: amountTotal,
        },
      })
    }

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

    // ────────────────────────────────────────────────────────────────
    // PDF racun + e-mail stranki (dodano 21.7.2026), po vzoru obrokov
    // (lib/installment-invoice.ts). Ovito v try/catch - napaka pri
    // generiranju/posiljanju maila NIKOLI ne sme podreti webhooka, racun
    // je ze ustvarjen in (poskusno) fiskaliziran ne glede na to.
    const finalInvoiceNumber = (fursResult?.success && fursResult.invoiceNumber) ? fursResult.invoiceNumber : invoiceNumber
    if (customerEmail) {
      try {
        const invoiceForPdf = {
          invoice_number: finalInvoiceNumber,
          invoice_type: 'invoice',
          client_name: customerName,
          client_email: customerEmail,
          issue_date: issueDate,
          due_date: issueDate,
          line_items: lineItems,
          amount_net: Math.round(amountNet * 100) / 100,
          vat_amount: Math.round(vatAmount * 100) / 100,
          amount_total: Math.round(amountTotal * 100) / 100,
          status: 'paid',
          paid_at: new Date().toISOString(),
          zoi: fursResult?.zoi ?? null,
          eor: fursResult?.eor ?? null,
          organizations: org,
        }
        const qrDataUrl = await generateUpnQr(invoiceForPdf, org)
        // FURS verifikacijski QR - samo ce je racun uspesno fiskaliziran
        let fursQrDataUrl: string | undefined
        if (fursResult?.success && fursResult.zoi) {
          try {
            fursQrDataUrl = await generateFursQr(fursResult.zoi, new Date(issueDate))
          } catch (qrErr: any) {
            console.error('FURS QR generiranje ni uspelo (racun bo poslan brez QR):', qrErr.message)
          }
        }
        const pdfElement = InvoicePDF({ invoice: invoiceForPdf, org, qrDataUrl, fursQrDataUrl })
        const pdfBuffer = await renderToBuffer(pdfElement as any)
        const emailHtml = buildInvoiceEmailHtml({
          orgName: org.name,
          invoiceNumber: finalInvoiceNumber,
          issueDate,
          amount: Number(amountTotal),
          dueDate: issueDate,
          customMessage: `Vaše Stripe plačilo je bilo uspešno zaključeno. V prilogi je račun.`,
          iban: org.iban ?? null,
          reference: null,
        })
        const { error: resendError } = await resend.emails.send({
          from: FROM_EMAIL,
          to: [customerEmail],
          subject: `Račun ${finalInvoiceNumber}`,
          html: emailHtml,
          attachments: [{ filename: `racun-${finalInvoiceNumber}.pdf`, content: pdfBuffer }],
        } as any)
        if (resendError) {
          console.error('Napaka pri posiljanju e-maila za Stripe racun:', invoice.id, resendError.message)
        } else {
          await supabase.from('issued_invoices').update({ last_email_sent_at: new Date().toISOString() }).eq('id', invoice.id)
        }
      } catch (emailErr: any) {
        console.error('Nepricakovana napaka pri PDF/e-mailu za Stripe racun:', invoice.id, emailErr.message)
      }
    } else {
      console.warn('Stripe placilo brez e-maila stranke - racun ni bil poslan po posti:', invoice.id)
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
    // DODANO (30.7.2026): beleži splošno napako - prej se je obdelava
    // lahko podrla brez sledi v /integracije ("zakaj se ni poknjižilo").
    // orgId/supabase sta zdaj dosegljiva tudi tu (dvignjena pred try).
    if (orgId && supabase) {
      await supabase.from('integration_logs').insert({
        org_id: orgId,
        integration_type: 'stripe',
        status: 'failed',
        payload: { error: String(e?.message || e) },
      }).then(() => {}, () => {})
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
