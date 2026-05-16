import { NextRequest } from 'next/server'
import { validateApiKey, apiError, apiSuccess, getServiceClient } from '@/lib/api-auth'

/**
 * GET /api/v1/invoices
 * Vrne seznam izdanih računov
 *
 * Query params:
 * - page: stran (default: 1)
 * - limit: število računov (default: 20, max: 100)
 * - status: filter po statusu (draft, sent, paid, overdue, cancelled)
 * - from: datum od (YYYY-MM-DD)
 * - to: datum do (YYYY-MM-DD)
 *
 * POST /api/v1/invoices
 * Ustvari nov račun
 */

export async function GET(req: NextRequest) {
  const { orgId, error } = await validateApiKey(req.headers.get('authorization'))
  if (error || !orgId) return apiError(error ?? 'Nepooblaščen dostop', 401)

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)))
  const status = searchParams.get('status')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const offset = (page - 1) * limit

  const supabase = getServiceClient()

  let query = supabase
    .from('issued_invoices')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('issue_date', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)
  if (from) query = query.gte('issue_date', from)
  if (to) query = query.lte('issue_date', to)

  const { data, count, error: dbError } = await query

  if (dbError) return apiError(dbError.message, 500)

  return apiSuccess(data, {
    page,
    limit,
    total: count ?? 0,
    pages: Math.ceil((count ?? 0) / limit),
  })
}

export async function POST(req: NextRequest) {
  const { orgId, error } = await validateApiKey(req.headers.get('authorization'))
  if (error || !orgId) return apiError(error ?? 'Nepooblaščen dostop', 401)

  let body: any
  try {
    body = await req.json()
  } catch {
    return apiError('Neveljaven JSON body')
  }

  // Validacija obveznih polj
  const required = ['client_name', 'issue_date', 'due_date', 'line_items']
  for (const field of required) {
    if (!body[field]) return apiError(`Polje '${field}' je obvezno`)
  }

  if (!Array.isArray(body.line_items) || body.line_items.length === 0) {
    return apiError('line_items mora biti neprazen array')
  }

  const supabase = getServiceClient()

  // Generiraj številko računa
  const year = new Date().getFullYear()
  const { count } = await supabase
    .from('issued_invoices')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .like('invoice_number', `${year}-%`)

  const seq = String((count ?? 0) + 1).padStart(4, '0')
  const invoiceNumber = `${year}-${seq}`

  // Izračunaj zneske
  const lineItems = body.line_items.map((item: any) => ({
    description: item.description ?? '',
    quantity: Number(item.quantity ?? 1),
    unit_price: Number(item.unit_price ?? 0),
    vat_rate: Number(item.vat_rate ?? 0),
    amount_net: Number(item.quantity ?? 1) * Number(item.unit_price ?? 0),
    vat_amount: Number(item.quantity ?? 1) * Number(item.unit_price ?? 0) * (Number(item.vat_rate ?? 0) / 100),
  }))

  const amountNet = lineItems.reduce((s: number, i: any) => s + i.amount_net, 0)
  const vatAmount = lineItems.reduce((s: number, i: any) => s + i.vat_amount, 0)
  const amountTotal = amountNet + vatAmount

  const { data: invoice, error: dbError } = await supabase
    .from('issued_invoices')
    .insert({
      org_id: orgId,
      invoice_number: invoiceNumber,
      invoice_type: body.invoice_type ?? 'invoice',
      client_name: body.client_name,
      client_address: body.client_address ?? null,
      client_email: body.client_email ?? null,
      client_tax_number: body.client_tax_number ?? null,
      issue_date: body.issue_date,
      due_date: body.due_date,
      service_date_from: body.service_date_from ?? body.issue_date,
      service_date_to: body.service_date_to ?? body.due_date,
      line_items: lineItems,
      amount_net: Math.round(amountNet * 100) / 100,
      vat_amount: Math.round(vatAmount * 100) / 100,
      amount_total: Math.round(amountTotal * 100) / 100,
      status: body.status ?? 'draft',
      notes: body.notes ?? null,
      external_reference: body.external_reference ?? null,
    })
    .select()
    .single()

  if (dbError || !invoice) return apiError(dbError?.message ?? 'Napaka pri ustvarjanju', 500)

  return apiSuccess(invoice)
}