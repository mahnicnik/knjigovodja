import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { issueInstallmentInvoice } from '@/lib/installment-invoice'
import { resolveActiveOrgId, resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'

/**
 * Poslje racun/opomnik za EN konkreten obrok TAKOJ (ne caka na dnevni cron
 * ob 6:00). Klican iz POS-a ob aktivaciji placilnega nacrta, ko je prvi
 * obrok zapadel danes ali v preteklosti.
 *
 * POPRAVLJENO (audit 23.7.2026): prej trdo kodiran BUSINESS_ID (samo ena
 * org, brez avtentikacije - kdorkoli na internetu bi lahko sprozil
 * posiljanje). Zdaj: org se doloci iz SEJE prijavljenega uporabnika, obrok
 * pa se dodatno preveri, da pripada TOCNO tej organizaciji.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const authed = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    )
    const { data: { user } } = await authed.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
    }
    const { orgId: __orgId, role: __role } = await resolveActiveOrgId(authed, user.id, getRequestedOrgId(request))
    const member = __orgId ? { org_id: __orgId, role: __role } : null // vec-org podpora (30.7.2026)
    if (!member) {
      return NextResponse.json({ error: 'Organizacija ni najdena za prijavljenega uporabnika' }, { status: 404 })
    }

    const { installmentId } = await request.json()
    if (!installmentId) {
      return NextResponse.json({ error: 'installmentId manjka' }, { status: 400 })
    }

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', member.org_id)
      .maybeSingle()
    if (!org) {
      return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })
    }

    // Obrok MORA pripadati TEJ organizaciji. POMEMBNO: installment_plans
    // uporablja business_id (POS stran), NE org_id (racunovodska stran) -
    // povezava je organizations.pos_business_id. Preprecuje, da bi
    // uporabnik ene org sprozil posiljanje obroka DRUGE org, ce bi uganil
    // installmentId.
    const { data: inst } = await supabase
      .from('installments')
      .select('*, installment_plans!inner(customer_id, customer_package_id, business_id)')
      .eq('id', installmentId)
      .eq('status', 'pending')
      .eq('installment_plans.business_id', org.pos_business_id)
      .maybeSingle()
    if (!inst) {
      return NextResponse.json({ error: 'Obrok ni najden, ni vec pending, ali ne pripada vasi organizaciji' }, { status: 404 })
    }

    const plan = inst.installment_plans as any
    const result = await issueInstallmentInvoice(supabase, org, {
      id: inst.id,
      due_date: inst.due_date,
      amount: inst.amount,
      vat_rate: inst.vat_rate,
      customer_id: plan.customer_id,
      customer_package_id: plan.customer_package_id,
    })

    if (!result.success) {
      return NextResponse.json({ error: (result as { success: false; reason: string }).reason }, { status: 400 })
    }
    return NextResponse.json({ success: true, invoiceNumber: result.invoiceNumber })
  } catch (e: any) {
    console.error('send-now installment error', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
