import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { confirmIssuedInvoiceWithFurs } from '@/lib/furs-invoice-confirm'

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
 * Tanek wrapper okoli deljene lib/furs-invoice-confirm.ts (21.7.2026).
 * Sama FURS logika je zdaj skupna z api/webhooks/stripe/route.ts - tu se
 * samo preveri avtentikacija in Pro-paket, nato se klice deljena funkcija.
 * Poslovna logika (kaj se dogaja s certifikatom/prostorom/FURS klicem)
 * se s tem refactorjem NI spremenila.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })

    const body = await req.json()
    const { invoiceId, paymentType, premiseId: requestedPremiseId } = body
    if (!invoiceId) return NextResponse.json({ error: 'invoiceId je obvezen' }, { status: 400 })

    const { data: member } = await supabase
      .from('org_members').select('org_id').eq('user_id', user.id).maybeSingle()
    if (!member) return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })

    const { data: org0 } = await supabase
      .from('organizations')
      .select('subscription_status')
      .eq('id', member.org_id)
      .single()
    const isPro = org0?.subscription_status === 'pro' || org0?.subscription_status === 'pro_pos'
    if (!isPro) {
      return NextResponse.json({ error: 'FURS fiskalizacija je na voljo samo v Pro paketu.' }, { status: 403 })
    }

    const result = await confirmIssuedInvoiceWithFurs(
      supabase,
      member.org_id,
      invoiceId,
      paymentType ?? 'cash',
      requestedPremiseId,
    )

    if (result.success) {
      return NextResponse.json(result)
    }
    return NextResponse.json(
      { success: false, error: result.error, offlineMode: result.offlineMode, zoi: result.zoi, invoiceNumber: result.invoiceNumber },
      { status: 503 },
    )
  } catch (e: any) {
    console.error('FURS confirm error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
