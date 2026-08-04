import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { sendToUjp, validateForUjp, getUjpFilename } from '@/lib/ujp'
import { extractFromP12 } from '@/lib/furs'
import { resolveActiveOrgId, resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'

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
    const { orgId: __orgId, role: __role } = await resolveActiveOrgId(supabase, user.id, getRequestedOrgId(req))
    const member = __orgId ? { org_id: __orgId, role: __role } : null // vec-org podpora (30.7.2026)
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

    if (!cert) {
      return NextResponse.json({ error: 'FURS certifikat ni nalozen - potreben za podpis UJP racuna' }, { status: 400 })
    }

    // POPRAVLJENO (24.7.2026): prej so se surovi (sifrirani) .p12 podatki
    // posiljali neposredno kot "PEM" kljuc/certifikat, kar je crypto.sign()
    // vedno zavrnil. Zdaj se .p12 pravilno razsifrira - enak preverjen
    // postopek kot pri FURS fiskalizaciji.
    let privateKeyPem: string, certificatePem: string
    try {
      const p12Buffer = Buffer.from(cert.certificate_data, 'base64')
      ;({ privateKeyPem, certificatePem } = extractFromP12(p12Buffer, cert.certificate_password ?? ''))
    } catch (certErr: any) {
      return NextResponse.json({ error: 'Napaka pri branju certifikata: ' + certErr.message }, { status: 500 })
    }

    const config = {
      taxNumber: org.tax_number ?? '',
      privateKeyPem,
      certificatePem,
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