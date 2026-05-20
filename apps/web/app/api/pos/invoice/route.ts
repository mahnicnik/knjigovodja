// app/api/pos/invoice/route.ts
// ============================================================================
// POS Invoice API — ustvari račun + (TODO) pošlji na FURS
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

interface InvoiceLine {
  item_id: string
  name: string
  qty: number
  price: number
  vat_rate: number
  discount_percent?: number
}

interface InvoiceBody {
  org_id: string
  items: InvoiceLine[]
  happy_hour: boolean
  payment_method: 'cash' | 'card' | 'voucher' | 'other'
  total: number
}

export async function POST(req: NextRequest) {
  try {
    const body: InvoiceBody = await req.json()

    if (!body.org_id || !body.items || body.items.length === 0) {
      return NextResponse.json({ error: 'Manjkajoči podatki' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 1. Generiraj invoice number (TODO: pravi sekvenčni iz organizations)
    const invoiceNumber = `RAČ-${Date.now().toString().slice(-6)}`

    // 2. Izračunaj total/net/vat
    let net = 0, vat = 0
    const lines = body.items.map(item => {
      const happyDiscount = body.happy_hour && isHappyHourEligible(item.name) ? 0.2 : 0
      const discount = (item.discount_percent ?? 0) / 100
      const lineGross = item.price * item.qty * (1 - discount) * (1 - happyDiscount)
      const lineVat = lineGross * (item.vat_rate / (100 + item.vat_rate))
      const lineNet = lineGross - lineVat
      net += lineNet
      vat += lineVat
      return {
        item_id: item.item_id,
        name: item.name,
        qty: item.qty,
        unit_price: item.price * (1 - happyDiscount),
        vat_rate: item.vat_rate,
        discount_percent: item.discount_percent ?? 0,
        line_total: lineGross,
      }
    })
    const total = net + vat

    // 3. TODO: FURS integration
    //    - če je FURS_TEST_MODE=true → fursTest()
    //    - sicer → fursSubmit() → vrne EOR + ZOI
    //    Trenutno mock:
    const fursEor = process.env.FURS_TEST_MODE === 'true'
      ? `TEST-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
      : null
    const fursZoi = fursEor ? Math.random().toString(36).substring(2, 14) : null

    // 4. Insert invoice
    const { data: invoice, error: invErr } = await supabase
      .from('pos_invoices')
      .insert({
        org_id: body.org_id,
        invoice_number: invoiceNumber,
        furs_eor: fursEor,
        furs_zoi: fursZoi,
        status: 'completed',
        total_amount: total,
        net_amount: net,
        vat_amount: vat,
        payment_method: body.payment_method,
        happy_hour_applied: body.happy_hour,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (invErr) {
      console.error('Invoice insert error:', invErr)
      return NextResponse.json({ error: invErr.message }, { status: 500 })
    }

    // 5. Insert lines
    const { error: linesErr } = await supabase
      .from('pos_invoice_lines')
      .insert(lines.map(l => ({ ...l, invoice_id: invoice.id })))

    if (linesErr) {
      console.error('Lines insert error:', linesErr)
      // Rollback invoice
      await supabase.from('pos_invoices').delete().eq('id', invoice.id)
      return NextResponse.json({ error: linesErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      invoice_id: invoice.id,
      invoice_number: invoiceNumber,
      eor: fursEor,
      zoi: fursZoi,
      total,
    })
  } catch (e: any) {
    console.error('POS invoice error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function isHappyHourEligible(name: string): boolean {
  const n = name.toLowerCase()
  return n.includes('pivo') || n.includes('vino') ||
         n.includes('laško') || n.includes('union') ||
         n.includes('beer') || n.includes('wine')
}