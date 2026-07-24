import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { issueInstallmentInvoice } from '@/lib/installment-invoice'

const NOTIFY_DAYS_BEFORE = 3 // koliko dni pred zapadlostjo se posljejo racuni

/**
 * Klican preko Vercel Cron (dnevno). Preveri obroke (installments), ki
 * zapadejo v naslednjih NOTIFY_DAYS_BEFORE dneh (ali so ze zapadli/danes,
 * ker .lte() nima spodnje meje) in imajo status 'pending', ter za vsakega
 * poslje racun preko issueInstallmentInvoice(). Prvi obrok posameznega
 * plana je obicajno ze poslan TAKOJ ob kreiranju (glej api/installments/send-now),
 * ce je zapadel danes ali prej - ta cron ga zato ne bo podvojil, ker
 * status ni vec 'pending'.
 *
 * POPRAVLJENO (24.7.2026, audit R1): prej je cron iskal SAMO Nikovo
 * organizacijo (trdo kodiran BUSINESS_ID) - za vsako drugo organizacijo
 * dnevno posiljanje obrokov NIKOLI ne bi delovalo. Zdaj obravnava obroke
 * VSEH organizacij, z org-cache za manj poizvedb.
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

  // Zapadli obroki PREK VSEH organizacij (join do business_id na planu)
  const { data: dueInstallments } = await supabase
    .from('installments')
    .select('*, installment_plans(customer_id, customer_package_id, business_id)')
    .eq('status', 'pending')
    .lte('due_date', cutoffStr)

  // Cache: business_id -> org (izogne se ponovnim poizvedbam za isto org)
  const orgCache = new Map<string, any>()
  async function getOrgForBusiness(businessId: string) {
    if (orgCache.has(businessId)) return orgCache.get(businessId)
    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('pos_business_id', businessId)
      .maybeSingle()
    orgCache.set(businessId, org)
    return org
  }

  let sent = 0
  let failed = 0
  let skippedNoOrg = 0
  for (const inst of dueInstallments || []) {
    try {
      const plan = inst.installment_plans as any
      const org = await getOrgForBusiness(plan.business_id)
      if (!org) {
        console.error('Preskocen obrok - organizacija ni najdena za business_id', plan.business_id, inst.id)
        skippedNoOrg++
        continue
      }
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
  return NextResponse.json({ success: true, sent, failed, skippedNoOrg })
}
