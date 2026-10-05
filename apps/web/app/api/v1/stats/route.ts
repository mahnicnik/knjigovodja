import { NextRequest } from 'next/server'
import { validateApiKey, apiError, apiSuccess, getServiceClient } from '@/lib/api-auth'
import { izracunajDdv, razponObdobja, type DdvObdobje } from '@/lib/ddv'

/**
 * GET /api/v1/stats
 * Vrne finančne statistike
 *
 * Query params:
 * - year: leto (default: trenutno leto)
 * - month: mesec 1-12 (opcijsko — če ni, vrne letne stats)
 * - quarter: cetrtletje 1-4 (opcijsko, namesto month)
 *
 * DDV (vat.*, revenue.vat, expenses.vat) pride iz lib/ddv.ts - ista stevilka
 * kot na nadzorni plosci in v evidenci DDV-O (revizija K1, oktober 2026).
 */
export async function GET(req: NextRequest) {
  const { orgId, error } = await validateApiKey(req.headers.get('authorization'))
  if (error || !orgId) return apiError(error ?? 'Nepooblaščen dostop', 401)

  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year') ?? new Date().getFullYear())
  const monthParam = searchParams.get('month')
  const month = monthParam ? Number(monthParam) : null
  const quarterParam = searchParams.get('quarter')
  const quarter = quarterParam ? Number(quarterParam) : null
  if (month !== null && !(month >= 1 && month <= 12)) return apiError('month mora biti 1-12', 400)
  if (quarter !== null && !(quarter >= 1 && quarter <= 4)) return apiError('quarter mora biti 1-4', 400)

  const supabase = getServiceClient()

  const obdobje: DdvObdobje = month
    ? { leto: year, mesec: month }
    : quarter
      ? { leto: year, cetrtletje: quarter as 1 | 2 | 3 | 4 }
      : { leto: year }
  const { od: from, do: to } = razponObdobja(obdobje)

  const [invRes, recRes, ddv] = await Promise.all([
    supabase
      .from('issued_invoices')
      .select('amount_total, amount_net, vat_amount, status')
      .eq('org_id', orgId)
      .gte('issue_date', from)
      .lte('issue_date', to)
      .neq('status', 'draft').or('zoi.is.null,zoi.not.like.DEMO-%'),
    supabase
      .from('receipts')
      .select('amount_total, amount_net, vat_amount')
      .eq('org_id', orgId)
      .gte('receipt_date', from)
      .lte('receipt_date', to),
    izracunajDdv(orgId, obdobje, supabase),
  ])

  const invoices = invRes.data ?? []
  const receipts = recRes.data ?? []

  const revenue = invoices.reduce((s, i) => s + Number(i.amount_total), 0)
  const revenueNet = invoices.reduce((s, i) => s + Number(i.amount_net), 0)
  const vatOut = ddv.izstopniDdv.skupaj
  const expenses = receipts.reduce((s, r) => s + Number(r.amount_total ?? 0), 0)
  const vatIn = ddv.vstopniDdv.skupaj
  // Za neto dobicek odstejemo DDV prav tistih prejetih racunov, ki so v `expenses`.
  const receiptsVat = receipts.reduce((s, r) => s + Number(r.vat_amount ?? 0), 0)
  const paid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount_total), 0)
  const unpaid = invoices.filter(i => i.status === 'sent').reduce((s, i) => s + Number(i.amount_total), 0)
  const overdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + Number(i.amount_total), 0)

  return apiSuccess({
    period: { from, to, year, month, quarter },
    vat: {
      output: ddv.izstopniDdv.skupaj,
      input: ddv.vstopniDdv.skupaj,
      due: ddv.obveznost, // negativno = vracilo DDV
      output_by_rate: ddv.izstopniDdv.poStopnjah,
      input_by_rate: ddv.vstopniDdv.poStopnjah,
    },
    revenue: {
      total: Math.round(revenue * 100) / 100,
      net: Math.round(revenueNet * 100) / 100,
      vat: Math.round(vatOut * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      unpaid: Math.round(unpaid * 100) / 100,
      overdue: Math.round(overdue * 100) / 100,
    },
    expenses: {
      total: Math.round(expenses * 100) / 100,
      vat: Math.round(vatIn * 100) / 100,
    },
    profit: {
      gross: Math.round((revenue - expenses) * 100) / 100,
      net: Math.round((revenueNet - (expenses - receiptsVat)) * 100) / 100,
    },
    invoices: {
      total: invoices.length,
      paid: invoices.filter(i => i.status === 'paid').length,
      unpaid: invoices.filter(i => i.status === 'sent').length,
      overdue: invoices.filter(i => i.status === 'overdue').length,
    },
    receipts: {
      total: receipts.length,
    },
  })
}