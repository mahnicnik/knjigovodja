import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { renderToBuffer } from '@react-pdf/renderer'
import { InvoicePDF, generateUpnQr } from '@/lib/invoice-pdf'
import { buildInvoiceEmailHtml } from '@/lib/invoice-email'
import { generateEslogXml, buildEslogFromInvoice } from '@/lib/eslog'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invoiceId } = await params
    const body = await request.json()
    const { to, cc, subject, message, sendEslog } = body

    if (!to || !subject) {
      return NextResponse.json({ error: 'Manjkajo obvezna polja (to, subject)' }, { status: 400 })
    }

    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    const { createServerClient } = await import('@supabase/ssr')
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    )
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

    // Preveri da user spada v to org
    const { data: member } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .eq('org_id', org.id)
      .maybeSingle()

    if (!member) {
      return NextResponse.json({ error: 'Nimate dostopa do tega računa' }, { status: 403 })
    }

    // Preveri subscription - email pošiljanje je samo Pro
    const subStatus = org.subscription_status || 'free'
    const isPro = subStatus === 'pro' || subStatus === 'pro_pos'
    if (!isPro) {
      return NextResponse.json({ error: 'Pošiljanje računov po emailu je na voljo samo v Pro paketu.' }, { status: 403 })
    }

    // Generiraj UPN QR
    const qrDataUrl = await generateUpnQr(invoice, org)

    // Generiraj PDF
    const pdfElement = InvoicePDF({ invoice, org, qrDataUrl })
    const pdfBuffer = await renderToBuffer(pdfElement as any)

    // Priponke — PDF je vedno priložen
    const attachments: Array<{ filename: string; content: Buffer | string }> = [
      {
        filename: `racun-${invoice.invoice_number}.pdf`,
        content: pdfBuffer,
      },
    ]

    // eSLOG XML — samo če je zahtevano in stranka ima davčno številko
    let eslogGenerated = false
    if (sendEslog && invoice.client_tax_number?.trim()) {
      try {
        const eslogData = buildEslogFromInvoice(invoice, org)
        const xmlString = generateEslogXml(eslogData)
        const safeInvoiceNumber = invoice.invoice_number.replace(/[^a-zA-Z0-9\-_]/g, '_')
        attachments.push({
          filename: `${safeInvoiceNumber}.xml`,
          content: xmlString,
        })
        eslogGenerated = true
      } catch (eslogErr: any) {
        // eSLOG napaka ne zaustavi pošiljanja — pošljemo samo PDF
        console.error('eSLOG generacija napaka:', eslogErr)
      }
    }

    // Zgradimo email HTML
    const emailHtml = buildInvoiceEmailHtml({
      orgName: org.name,
      invoiceNumber: invoice.invoice_number,
      issueDate: invoice.issue_date,
      amount: Number(invoice.amount_total),
      dueDate: invoice.due_date,
      customMessage: message,
      iban: org.iban ?? null,
      reference: invoice.reference ?? null,
    })

    // Pošlji via Resend
    const { data: resendData, error: resendError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      cc: cc ? [cc] : undefined,
      replyTo: user.email,
      subject,
      html: emailHtml,
      attachments,
    } as any)

    if (resendError) {
      console.error('Resend napaka:', resendError)

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

    // Zabeležimo uspešno pošiljanje
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

    // Posodobi status računa
    await supabase
      .from('issued_invoices')
      .update({
        last_email_sent_at: new Date().toISOString(),
        status: invoice.status === 'draft' ? 'sent' : invoice.status,
      })
      .eq('id', invoiceId)

    return NextResponse.json({
      success: true,
      emailId: resendData?.id,
      eslogAttached: eslogGenerated,
    })

  } catch (error: any) {
    console.error('Send invoice error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
