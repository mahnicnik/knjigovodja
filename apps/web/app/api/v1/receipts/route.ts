import { NextRequest } from 'next/server'
import { validateApiKey, apiError, apiSuccess, getServiceClient } from '@/lib/api-auth'

/**
 * GET /api/v1/receipts
 * Vrne seznam prejetih računov (stroški)
 */
export async function GET(req: NextRequest) {
  const { orgId, error } = await validateApiKey(req.headers.get('authorization'))
  if (error || !orgId) return apiError(error ?? 'Nepooblaščen dostop', 401)

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)))
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const category = searchParams.get('category')
  const offset = (page - 1) * limit

  const supabase = getServiceClient()

  let query = supabase
    .from('receipts')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('receipt_date', { ascending: false })
    .range(offset, offset + limit - 1)

  if (from) query = query.gte('receipt_date', from)
  if (to) query = query.lte('receipt_date', to)
  if (category) query = query.eq('category', category)

  const { data, count, error: dbError } = await query
  if (dbError) return apiError(dbError.message, 500)

  return apiSuccess(data, {
    page, limit,
    total: count ?? 0,
    pages: Math.ceil((count ?? 0) / limit),
  })
}