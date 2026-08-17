import { renderToBuffer } from '@react-pdf/renderer'
import { InvoicePDF, generateUpnQr } from '@/lib/invoice-pdf'
import { buildInvoiceEmailHtml } from '@/lib/invoice-email'
import { resend, FROM_EMAIL } from '@/lib/resend'

interface InstallmentToInvoice {
  id: string
  due_date: string
  amount: number
  vat_rate: number
  customer_id: string
  customer_package_id: string
}

/**
 * Ustvari izdan racun (issued_invoices) za en obrok, generira PDF in ga
 * poslje stranki po e-mailu preko Resend. Uporablja se tako iz dnevnega
 * crona (za obroke, ki zapadejo v naslednjih 3 dneh) kot tudi TAKOJ ob
 * kreiranju placilnega nacrta za prvi obrok, ce je njegov datum zapadlosti
 * danes ali v preteklosti (cron bi ga sicer ujel sele naslednji dan ob 6:00).
 */
export async function issueInstallmentInvoice(
  supabase: any,
  org: any,
  inst: InstallmentToInvoice
): Promise<{ success: true; invoiceNumber: string } | { success: false; reason: string }> {
  const { data: customer } = await supabase
    .from('customers')
    .select('name, email')
    .eq('id', inst.customer_id)
    .maybeSingle()

  if (!customer?.email) {
    return { success: false, reason: 'Stranka nima e-maila' }
  }

  const { data: pkg } = await supabase
    .from('customer_packages')
    .select('name')
    .eq('id', inst.customer_package_id)
    .maybeSingle()

  const { count } = await supabase
    .from('issued_invoices')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', org.id)
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
    issue_date: new Date().toISOString().split('T')[0],
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
    customMessage: `Obvestilo: obrok za "${pkg?.name || 'vaš paket'}" zapade ${(inst.due_date ? new Date(inst.due_date).toLocaleDateString('sl-SI') : '—')}.`,
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

  const { error: sentErr } = await supabase.from('issued_invoices').update({ last_email_sent_at: new Date().toISOString() }).eq('id', newInvoice.id)
  if (sentErr) console.error('Obrocni racun', newInvoice.invoice_number, 'je poslan, oznake o posiljanju pa NI bilo mogoce shraniti:', sentErr)
  // POPRAVLJENO (16.8.2026): prej brez preverbe. Ce se obrok ne oznaci kot
  // zaracunan, bo naslednji zagon izdal ISTI obrok SE ENKRAT - stranka bi
  // prejela podvojen racun za isti obrok.
  const { error: instErr } = await supabase.from('installments').update({
    status: 'invoiced',
    invoiced_at: new Date().toISOString(),
    invoice_number: newInvoice.invoice_number,
  }).eq('id', inst.id)
  if (instErr) {
    console.error('KRITICNO: obrok', inst.id, 'je zaracunan (racun', newInvoice.invoice_number, '), oznake pa NI bilo mogoce shraniti - naslednji zagon lahko izda PODVOJEN racun:', instErr)
    return { success: false, reason: `Račun ${newInvoice.invoice_number} je izdan in poslan, obroka pa ni bilo mogoče označiti kot zaračunanega. Preverite ročno, da se ne izda podvojen račun.` }
  }

  return { success: true, invoiceNumber: newInvoice.invoice_number }
}
