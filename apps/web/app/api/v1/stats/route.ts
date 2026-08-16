import { NextRequest } from 'next/server'
import { validateApiKey, apiError, apiSuccess, getServiceClient } from '@/lib/api-auth'

/**
 * GET /api/v1/stats
 * Vrne finančne statistike
 *
 * Query params:
 * - year: leto (default: trenutno leto)
 * - month: mesec 1-12 (opcijsko — če ni, vrne letne stats)
 */
export async function GET(req: NextRequest) {
  const { orgId, error } = await validateApiKey(req.headers.get('authorization'))
  if (error || !orgId) return apiError(error ?? 'Nepooblaščen dostop', 401)

  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year') ?? new Date().getFullYear())
  const monthParam = searchParams.get('month')
  const month = monthParam ? Number(monthParam) : null

  const supabase = getServiceClient()

  let from: string, to: string

  if (month) {
    from = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
  } else {
    from = `${year}-01-01`
    to = `${year}-12-31`
  }

  const [invRes, recRes, kpoRes] = await Promise.all([
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
    supabase
      .from('kpo_entries')
      .select('income, vat_out, expense, vat_in')
      .eq('org_id', orgId)
      .gte('entry_date', from)
      .lte('entry_date', to),
  ])

  const invoices = invRes.data ?? []
  const receipts = recRes.data ?? []
  const kpo = kpoRes.data ?? []

  const revenue = invoices.reduce((s, i) => s + Number(i.amount_total), 0)
  const revenueNet = invoices.reduce((s, i) => s + Number(i.amount_net), 0)
  const vatOut = invoices.reduce((s, i) => s + Number(i.vat_amount), 0)
  const expenses = receipts.reduce((s, r) => s + Number(r.amount_total ?? 0), 0)
  const vatIn = receipts.reduce((s, r) => s + Number(r.vat_amount ?? 0), 0)
  const paid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount_total), 0)
  const unpaid = invoices.filter(i => i.status === 'sent').reduce((s, i) => s + Number(i.amount_total), 0)
  const overdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + Number(i.amount_total), 0)

  return apiSuccess({
    period: { from, to, year, month },
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
      net: Math.round((revenueNet - (expenses - vatIn)) * 100) / 100,
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