import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { issueInstallmentInvoice } from '@/lib/installment-invoice'

const BUSINESS_ID = '00000000-0000-0000-0000-000000000001'

/**
 * Poslje racun/opomnik za EN konkreten obrok TAKOJ (ne caka na dnevni cron
 * ob 6:00). Klican iz POS-a ob aktivaciji placilnega nacrta, ko je prvi
 * obrok zapadel danes ali v preteklosti.
 */
export async function POST(request: NextRequest) {
  try {
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
      .eq('pos_business_id', BUSINESS_ID)
      .maybeSingle()
    if (!org) {
      return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })
    }

    const { data: inst } = await supabase
      .from('installments')
      .select('*, installment_plans(customer_id, customer_package_id)')
      .eq('id', installmentId)
      .eq('status', 'pending')
      .maybeSingle()
    if (!inst) {
      return NextResponse.json({ error: 'Obrok ni najden ali ni vec pending' }, { status: 404 })
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
