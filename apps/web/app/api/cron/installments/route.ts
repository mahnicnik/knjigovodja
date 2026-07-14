import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { renderToBuffer } from '@react-pdf/renderer'
import { InvoicePDF, generateUpnQr } from '@/lib/invoice-pdf'
import { buildInvoiceEmailHtml } from '@/lib/invoice-email'
import { resend, FROM_EMAIL } from '@/lib/resend'

const BUSINESS_ID = '00000000-0000-0000-0000-000000000001'
const NOTIFY_DAYS_BEFORE = 3 // koliko dni pred zapadlostjo se posljejo racuni

/**
 * Klican preko Vercel Cron (dnevno). Preveri obroke (installments), ki
 * zapadejo v naslednjih NOTIFY_DAYS_BEFORE dneh in imajo status 'pending'.
 * Za vsak tak obrok: ustvari pravi izdan racun (issued_invoices, isto
 * kot navadni racuni v portalu), generira PDF preko obstojecega
 * InvoicePDF generatorja, in ga poslje stranki po e-mailu preko Resend
 * (isti tok kot obstojece posiljanje racunov).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = new Date()
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() + NOTIFY_DAYS_BEFORE)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  // Najdi organizacijo, ki pripada temu POS poslovanju
  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('pos_business_id', BUSINESS_ID)
    .maybeSingle()

  if (!org) {
    return NextResponse.json({ error: 'Organizacija ni najdena za ta business_id' }, { status: 404 })
  }

  const { data: dueInstallments } = await supabase
    .from('installments')
    .select('*, installment_plans(customer_id, customer_package_id)')
    .eq('status', 'pending')
    .lte('due_date', cutoffStr)

  let sent = 0
  let failed = 0

  for (const inst of dueInstallments || []) {
    try {
      const plan = inst.installment_plans as any
      const { data: customer } = await supabase
        .from('customers')
        .select('name, email')
        .eq('id', plan.customer_id)
        .maybeSingle()

      if (!customer?.email) {
        console.error('Stranka nima e-maila, preskocim obrok', inst.id)
        failed++
        continue
      }

      const { data: pkg } = await supabase
        .from('customer_packages')
        .select('name')
        .eq('id', plan.customer_package_id)
        .maybeSingle()

      // Izracunaj naslednjo stevilko racuna (isti vzorec kot obstojeci racuni)
      const { count } = await supabase.from('issued_invoices').select('*', { count: 'exact', head: true }).eq('org_id', org.id)
      const invoiceNumber = `${new Date().getFullYear()}-${String((count || 0) + 1).padStart(3, '0')}`

      const grossAmount = Number(inst.amount)
      const vatRate = Number(inst.vat_rate || 22)
      const netAmount = Math.round((grossAmount / (1 + vatRate / 100)) * 100) / 100
      const vatAmount = Math.round((grossAmount - netAmount) * 100) / 100

      const lineItems = [{
        description: `Obrok - ${pkg?.name || 'Paket'}`,
        quantity: 1,
        unit_price: netAmount,
        vat_rate: vatRate,
        discount_pct: 0,
      }]

      const invoiceRow = {
        org_id: org.id,
        invoice_number: invoiceNumber,
        invoice_type: 'invoice',
        client_name: customer.name,
        client_email: customer.email,
        issue_date: today.toISOString().split('T')[0],
        due_date: inst.due_date,
        line_items: lineItems,
        amount_net: netAmount,
        vat_amount: vatAmount,
        amount_total: grossAmount,
        status: 'sent',
        reference: `SI00 ${invoiceNumber}`,
        source: 'installment',
      }

      const { data: newInvoice, error: invErr } = await supabase
        .from('issued_invoices')
        .insert(invoiceRow)
        .select()
        .single()
      if (invErr) throw invErr

      // Generiraj PDF preko obstojecega generatorja
      const invoiceForPdf = { ...newInvoice, organizations: org }
      const qrDataUrl = await generateUpnQr(invoiceForPdf, org)
      const pdfElement = InvoicePDF({ invoice: invoiceForPdf, org, qrDataUrl })
      const pdfBuffer = await renderToBuffer(pdfElement as any)

      const emailHtml = buildInvoiceEmailHtml({
        orgName: org.name,
        invoiceNumber: newInvoice.invoice_number,
        issueDate: newInvoice.issue_date,
        amount: Number(newInvoice.amount_total),
        dueDate: newInvoice.due_date,
        customMessage: `Obvestilo: obrok za "${pkg?.name || 'vaš paket'}" zapade ${new Date(inst.due_date).toLocaleDateString('sl-SI')}.`,
        iban: org.iban ?? null,
        reference: newInvoice.reference ?? null,
      })

      const { error: resendError } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [customer.email],
        subject: `Racun za obrok - ${newInvoice.invoice_number}`,
        html: emailHtml,
        attachments: [{ filename: `racun-${newInvoice.invoice_number}.pdf`, content: pdfBuffer }],
      } as any)

      if (resendError) throw new Error(resendError.message)

      await supabase.from('issued_invoices').update({ last_email_sent_at: new Date().toISOString() }).eq('id', newInvoice.id)
      await supabase.from('installments').update({
        status: 'invoiced',
        invoiced_at: new Date().toISOString(),
        invoice_number: newInvoice.invoice_number,
      }).eq('id', inst.id)

      sent++
    } catch (e: any) {
      console.error('Napaka pri obroku', inst.id, e.message)
      failed++
    }
  }

  return NextResponse.json({ success: true, sent, failed })
}
