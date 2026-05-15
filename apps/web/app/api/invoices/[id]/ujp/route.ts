import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { sendToUjp, validateForUjp, getUjpFilename } from '@/lib/ujp'

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invoiceId } = await params
    const supabase = await getSupabase()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })

    // Pridobi invoice + org
    const { data: member } = await supabase
      .from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
    if (!member) return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })

    const { data: invoice } = await supabase
      .from('issued_invoices').select('*').eq('id', invoiceId).eq('org_id', member.org_id).single()
    if (!invoice) return NextResponse.json({ error: 'Račun ni najden' }, { status: 404 })

    const { data: org } = await supabase
      .from('organizations').select('*').eq('id', member.org_id).single()
    if (!org) return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })

    // Validacija
    const errors = validateForUjp(invoice, org)
    if (errors.length > 0) {
      return NextResponse.json({ error: 'Manjkajo podatki za UJP', details: errors }, { status: 400 })
    }

    // Pridobi certifikat (isti kot za FURS)
    const { data: cert } = await supabase
      .from('furs_certificates')
      .select('*')
      .eq('org_id', member.org_id)
      .eq('is_active', true)
      .maybeSingle()

    const config = {
      taxNumber: org.tax_number ?? '',
      privateKeyPem: cert?.certificate_data ?? '',
      certificatePem: cert?.certificate_data ?? '',
      isTest: process.env.FURS_TEST_MODE === 'true',
    }

    // Generiraj UJP XML
    const result = await sendToUjp(invoice, org, config)

    if (!result.success) {
      return NextResponse.json({ error: result.errorMessage }, { status: 500 })
    }

    // Vrni XML za download
    const filename = getUjpFilename(org.tax_number ?? 'SI', invoice.invoice_number)

    return new NextResponse(result.xmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}