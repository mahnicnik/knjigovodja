import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { renderToBuffer } from '@react-pdf/renderer'
import { InvoicePDF, generateUpnQr } from '@/lib/invoice-pdf'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set() {}, remove() {},
      },
    }
  )
}

/**
 * Regenerira PDF za ze izdan racun (issued_invoices) na zahtevo - PDF se
 * ne hrani trajno v bazi, ampak se ob vsakem ogledu ponovno sestavi iz
 * shranjenih podatkov racuna (isti InvoicePDF generator kot pri posiljanju
 * po e-mailu). Dostop imajo prijavljeni org_members te organizacije
 * (lastnik/admin/racunovodja) - preverjeno s sejo, ne z javnim tokenom.
 */
export async function GET(request: NextRequest) {
  try {
    const invoiceId = request.nextUrl.searchParams.get('id')
    if (!invoiceId) {
      return NextResponse.json({ error: 'Manjka id racuna' }, { status: 400 })
    }

    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
    }

    const { data: invoice, error: invErr } = await supabase
      .from('issued_invoices')
      .select('*')
      .eq('id', invoiceId)
      .maybeSingle()
    if (invErr || !invoice) {
      return NextResponse.json({ error: 'Račun ni najden' }, { status: 404 })
    }

    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', invoice.org_id)
      .maybeSingle()
    if (!membership || !['owner', 'admin', 'accountant'].includes(membership.role)) {
      return NextResponse.json({ error: 'Nimate dostopa do tega racuna' }, { status: 403 })
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', invoice.org_id)
      .maybeSingle()
    if (!org) {
      return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })
    }

    const invoiceForPdf = { ...invoice, organizations: org }
    const qrDataUrl = await generateUpnQr(invoiceForPdf, org)
    const pdfElement = InvoicePDF({ invoice: invoiceForPdf, org, qrDataUrl })
    const pdfBuffer = await renderToBuffer(pdfElement as any)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="racun-${invoice.invoice_number}.pdf"`,
      },
    })
  } catch (e: any) {
    console.error('racunovodja invoice-pdf error', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
