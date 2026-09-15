import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { renderToBuffer } from '@react-pdf/renderer'
import { InvoicePDF, generateUpnQr } from '@/lib/invoice-pdf'
import { buildInvoiceEmailHtml } from '@/lib/invoice-email'
// PRELET 281: generator e-racuna po uradni shemi e-SLOG 2.0.
import { zgradiESlogXml } from '@/lib/e-slog'

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

    /**
     * PRELET 281: E-RACUN (e-SLOG 2.0) KOT DRUGA PRILOGA.
     *
     * 19. 8. 2026 je bila priloga odstranjena, ker "portal UJPeRacun ne
     * sprejema generiranih datotek". To drzi za JAVNI SEKTOR - tam oddaja
     * tece prek portala UJP s kvalificiranim potrdilom.
     *
     * Za racune PODJETJEM je namen drug: prejemnikov racunovodski program
     * XML uvozi in racuna ni treba prepisovati. Generator je od preleta 222
     * drug - e-SLOG 2.0 po uradni shemi, preverjen z XSD.
     *
     * Pripnemo SAMO, kadar ima kupec davcno stevilko (torej je podjetje).
     * Fizicni osebi datoteka ne koristi.
     *
     * Ce gradnja odpove, e-posta VSEENO odide s PDF - racun mora oditi.
     */
    const kupecJePodjetje = !!String(invoice.client_tax_number || '').trim()
    if (kupecJePodjetje) {
      try {
        const postavke = (Array.isArray(invoice.line_items) ? invoice.line_items : []).map((p: any) => ({
          opis: String(p.description ?? ''),
          kolicina: Number(p.quantity ?? 1),
          cenaBrezDdv: Number(p.unit_price ?? 0),
          stopnjaDdv: Number(p.vat_rate ?? 22),
          popustOdstotek: Number(p.discount_pct ?? 0),
        }))
        const davcnaBrez = String(org.tax_number || '').replace(/^SI/i, '')
        const xml = zgradiESlogXml({
          stevilka: invoice.invoice_number,
          datumIzdaje: String(invoice.issue_date),
          datumZapadlosti: invoice.due_date ? String(invoice.due_date) : null,
          datumDobave: invoice.service_date ? String(invoice.service_date) : null,
          sklic: invoice.reference || null,
          opomba: invoice.notes || null,
          izdajatelj: {
            naziv: org.name,
            naslov: org.address || null,
            posta: org.post_code || null,
            kraj: org.city || null,
            davcna: davcnaBrez,
            // ID za DDV samo pri zavezancu - sicer prejemnik pricakuje odbitek,
            // ki ga na racunu ni.
            idZaDdv: org.vat_registered ? `SI${davcnaBrez}` : null,
            iban: org.iban || null,
            bic: org.bic || null,
          },
          kupec: {
            naziv: invoice.client_name,
            naslov: invoice.client_address || null,
            davcna: invoice.client_tax_number || null,
            idZaDdv: invoice.client_vat_number || null,
          },
          postavke,
          klavzulaOprostitve: invoice.vat_exemption_text || null,
        })
        attachments.push({
          filename: `e-racun-${String(invoice.invoice_number).replace(/[^0-9A-Za-z-]/g, '_')}.xml`,
          content: xml,
        })
      } catch (e: any) {
        console.warn('e-racun XML ni bilo mogoce zgraditi, posiljam samo PDF:', e?.message)
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

      // Zapis neuspesnega posiljanja v dnevnik - napake tu namenoma ne
      // preverjamo, ker smo ze v obravnavi druge napake.
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
    // POPRAVLJENO (16.8.2026): prej brez preverbe - e-posta je bila poslana,
    // zapis o tem pa ne, zato racun ne bi bil oznacen kot poslan in bi ga
    // uporabnik poslal se enkrat (stranka prejme dva enaka racuna).
    const { error: logErr } = await supabase.from('invoice_emails').insert({
      invoice_id: invoiceId,
      org_id: org.id,
      to_email: to,
      cc_email: cc,
      subject,
      message: message || null,
      status: 'sent',
      resend_email_id: resendData?.id,
    })
    if (logErr) console.error('Racun', invoiceId, 'je bil poslan, zapisa v dnevnik pa NI bilo mogoce shraniti:', logErr)

    // Posodobi status računa
    // POPRAVLJENO (16.8.2026): prej brez preverbe - racun je ostal v statusu
    // "osnutek", ceprav je bil poslan stranki.
    const { error: statusErr } = await supabase
      .from('issued_invoices')
      .update({
        last_email_sent_at: new Date().toISOString(),
        status: invoice.status === 'draft' ? 'sent' : invoice.status,
      })
      .eq('id', invoiceId)
    if (statusErr) console.error('Racun', invoiceId, 'je bil poslan, statusa pa NI bilo mogoce posodobiti:', statusErr)

    return NextResponse.json({
      success: true,
      emailId: resendData?.id,
    })

  } catch (error: any) {
    console.error('Send invoice error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
