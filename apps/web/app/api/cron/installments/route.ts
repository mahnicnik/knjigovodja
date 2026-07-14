import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { issueInstallmentInvoice } from '@/lib/installment-invoice'

const BUSINESS_ID = '00000000-0000-0000-0000-000000000001'
const NOTIFY_DAYS_BEFORE = 3 // koliko dni pred zapadlostjo se posljejo racuni

/**
 * Klican preko Vercel Cron (dnevno). Preveri obroke (installments), ki
 * zapadejo v naslednjih NOTIFY_DAYS_BEFORE dneh (ali so ze zapadli/danes,
 * ker .lte() nima spodnje meje) in imajo status 'pending', ter za vsakega
 * poslje racun preko issueInstallmentInvoice(). Prvi obrok posameznega
 * plana je obicajno ze poslan TAKOJ ob kreiranju (glej api/installments/send-now),
 * ce je zapadel danes ali prej - ta cron ga zato ne bo podvojil, ker
 * status ni vec 'pending'.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const today = new Date()
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() + NOTIFY_DAYS_BEFORE)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('pos_business_id', BUSINESS_ID)
    .maybeSingle()
  if (!org) {
    return NextResponse.json({ error: 'Organizacija ni najdena za ta business_id' }, { status: 404 })
  }

  const { data: dueInstallments } = await supabase
    .from('installments')
    .select('*, installment_plans(customer_id, customer_package_id)')
    .eq('status', 'pending')
    .lte('due_date', cutoffStr)

  let sent = 0
  let failed = 0
  for (const inst of dueInstallments || []) {
    try {
      const plan = inst.installment_plans as any
      const result = await issueInstallmentInvoice(supabase, org, {
        id: inst.id,
        due_date: inst.due_date,
        amount: inst.amount,
        vat_rate: inst.vat_rate,
        customer_id: plan.customer_id,
        customer_package_id: plan.customer_package_id,
      })
      if (result.success) sent++
      else { console.error('Preskocen obrok', inst.id, (result as { success: false; reason: string }).reason); failed++ }
    } catch (e: any) {
      console.error('Napaka pri obroku', inst.id, e.message)
      failed++
    }
  }
  return NextResponse.json({ success: true, sent, failed })
}
