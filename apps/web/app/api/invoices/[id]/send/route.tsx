import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { renderToBuffer } from '@react-pdf/renderer'
import { InvoicePDF, generateUpnQr } from '@/lib/invoice-pdf'
import { buildInvoiceEmailHtml } from '@/lib/invoice-email'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invoiceId } = await params
    const body = await request.json()
    const { to, cc, subject, message } = body

    if (!to || !subject) {
      return NextResponse.json({ error: 'Manjkajo obvezna polja (to, subject)' }, { status: 400 })
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
    }

    // Pridobi invoice + org
    const { data: invoice, error: invErr } = await supabase
      .from('issued_invoices')
      .select('*, organizations(*)')
      .eq('id', invoiceId)
      .single()

    if (invErr || !invoice) {
      return NextResponse.json({ error: 'Račun ni najden' }, { status: 404 })
    }

    const org = invoice.organizations
    if (!org) {
      return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })
    }

    // Verify user belongs to this org
    const { data: member } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .eq('org_id', org.id)
      .maybeSingle()

    if (!member) {
      return NextResponse.json({ error: 'Nimate dostopa do tega računa' }, { status: 403 })
    }

    // Generate UPN QR
    const qrDataUrl = await generateUpnQr(invoice, org)

    // Generate PDF
    const pdfElement = InvoicePDF({ invoice, org, qrDataUrl })
    const pdfBuffer = await renderToBuffer(pdfElement as any)

    // Build email HTML
    const emailHtml = buildInvoiceEmailHtml({
      orgName: org.name,
      invoiceNumber: invoice.invoice_number,
      issueDate: invoice.issue_date,
      amount: Number(invoice.amount_total),
      dueDate: invoice.due_date,
      customMessage: message,
    })

    // Send via Resend
    const { data: resendData, error: resendError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      cc: cc ? [cc] : undefined,
      replyTo: user.email,
      subject,
      html: emailHtml,
      attachments: [
        {
          filename: `racun-${invoice.invoice_number}.pdf`,
          content: pdfBuffer,
        },
      ],
    })

    if (resendError) {
      console.error('Resend error:', resendError)
      
      // Log failed attempt
      await supabase.from('invoice_emails').insert({
        invoice_id: invoiceId,
        org_id: org.id,
        to_email: to,
        cc_email: cc,
        subject,
        message: message || null,
        status: 'failed',
        error_message: resendError.message,
      })

      return NextResponse.json({ error: resendError.message }, { status: 500 })
    }

    // Log successful send
    await supabase.from('invoice_emails').insert({
      invoice_id: invoiceId,
      org_id: org.id,
      to_email: to,
      cc_email: cc,
      subject,
      message: message || null,
      status: 'sent',
      resend_email_id: resendData?.id,
    })

    // Update invoice
    await supabase
      .from('issued_invoices')
      .update({ 
        last_email_sent_at: new Date().toISOString(),
        status: invoice.status === 'draft' ? 'sent' : invoice.status,
      })
      .eq('id', invoiceId)

    return NextResponse.json({ 
      success: true, 
      emailId: resendData?.id 
    })

  } catch (error: any) {
    console.error('Send invoice error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}