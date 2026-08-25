import { renderToBuffer } from '@react-pdf/renderer'
import { lokalniDatum } from '@/lib/tax-constants'
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
  /** Zaporedna stevilka obroka (1, 2, 3 ...) - neobvezna zaradi starih klicev. */
  installment_number?: number
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

  // Nacrt potrebujemo, da v sporocilu povemo "2. obrok od 6" (22.8.2026).
  const { data: nacrt } = await supabase
    .from('installment_plans')
    .select('installment_count')
    .eq('customer_package_id', inst.customer_package_id)
    .maybeSingle()

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
  const vatRate = Number(inst.vat_rate ?? 22)
  // POPRAVLJENO (25.8.2026): osnova se je zaokrozila na 2 decimalki, iz nje pa
  // je urejanje racuna preracunalo DDV in dobilo CENT VEC: 36,89 x 1,22 = 45,01,
  // medtem ko seznam in PDF kazeta 45,00. Na davcnem dokumentu je cent razlike
  // dovolj, da se knjiga ne izide.
  //
  // Osnovo hranimo na 4 decimalke; DDV ostane razlika do bruta, da vsota
  // vedno da tocen znesek, ki ga stranka placa.
  const netAmount = Math.round((grossAmount / (1 + vatRate / 100)) * 10000) / 10000
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
    // B4 (22.8.2026): POVEZAVA NA STRANKO. Prej je racun nastal samo z
    // `client_name` (imenom kot besedilom), zato ga zgodovina stranke v
    // blagajni ni nasla - v profilu je pisalo "Ni se nobenih nakupov",
    // ceprav je bil racun izdan in poslan.
    customer_id: inst.customer_id,

    issue_date: lokalniDatum(),

    // C8 (22.8.2026): DATUM OPRAVLJENE STORITVE je obvezna sestavina racuna
    // po ZDDV-1, na obrocnem racunu pa ga sploh ni bilo. Pri obroku je to
    // datum, ko obrok zapade - takrat je storitev za to obdobje opravljena.
    service_date: inst.due_date,

    // B6 (22.8.2026): rok placila je bil ENAK datumu izdaje, zato je racun
    // zapadel takoj in v e-posti je pisalo "cez 0 dni". Dajemo 8 dni, kar je
    // obicajen rok; pri obrokih, ki zapadejo v prihodnosti, obdrzimo njihov
    // datum, ce je poznejsi.
    due_date: (() => {
      const cez8 = new Date()
      cez8.setDate(cez8.getDate() + 8)
      const privzeti = lokalniDatum(cez8)
      return inst.due_date && inst.due_date > privzeti ? inst.due_date : privzeti
    })(),
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
    // C14 (22.8.2026): povemo, KATERI obrok od koliko - stranka je prej iz
    // sporocila ni mogla razbrati, koliko je ze odplacala.
    customMessage: (inst.installment_number && nacrt?.installment_count
        ? `${inst.installment_number}. obrok od ${nacrt.installment_count} za „${pkg?.name || 'vaš paket'}"`
        : `Obrok za „${pkg?.name || 'vaš paket'}"`)
      + (inst.due_date ? ` · zapade ${new Date(inst.due_date).toLocaleDateString('sl-SI')}` : ''),
    iban: org.iban ?? null,
    reference: newInvoice.reference ?? null,
    // C15 (22.8.2026): QR koda v telesu sporocila, vgrajena kot priloga.
    qrCid: qrDataUrl ? 'upnqr' : null,
  })

  // C1 (22.8.2026): zadeva je bila brez sumnikov - to je prvo, kar stranka
  // vidi v nabiralniku.
  const zadeva = `Račun za obrok — ${newInvoice.invoice_number}`

  const { data: resendData, error: resendError } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [customer.email],
    subject: zadeva,
    html: emailHtml,
    attachments: [
      { filename: `racun-${newInvoice.invoice_number}.pdf`, content: pdfBuffer },
      // VGRAJENA priloga za QR v telesu sporocila (C15).
      //
      // POPRAVLJENO (24.8.2026): polje se je imenovalo `content_id`, knjiznica
      // Resend pa pricakuje `contentId` (sama ga nato pretvori v content_id za
      // API). Zaradi napacnega imena je QR ostal NAVADNA priloga, v telesu
      // sporocila pa je bil prazen okvir z besedilom "UPN QR koda za placilo".
      ...(qrDataUrl ? [{
        filename: 'upnqr.png',
        content: Buffer.from(qrDataUrl.split(',')[1] || '', 'base64'),
        contentId: 'upnqr',
      }] : []),
    ],
  } as any)

  // DODANO (22.8.2026): posiljanje ZABELEZIMO - tudi ko spodleti.
  //
  // Prej se je obrocno posiljanje beleZilo samo prek `last_email_sent_at`, kar
  // pomeni "poskusili smo", ne "prislo je". Ce je Resend posto zavrnil, tega
  // ni bilo mogoce ugotoviti nikjer - ne v aplikaciji ne v bazi. Redno
  // posiljanje racuna to belezi ze od prej; obrocno ne.
  const { error: logErr } = await supabase.from('invoice_emails').insert({
    invoice_id: newInvoice.id,
    org_id: org.id,
    to_email: customer.email,
    subject: zadeva,
    message: 'Samodejno poslan račun za obrok',
    status: resendError ? 'failed' : 'sent',
    resend_email_id: (resendData as any)?.id ?? null,
    error_message: resendError ? String(resendError.message) : null,
    sent_at: resendError ? null : new Date().toISOString(),
  })
  if (logErr) console.error('Zapisa o poslani obrocni posti ni bilo mogoce shraniti:', logErr.message)

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
