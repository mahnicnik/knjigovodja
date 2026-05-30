import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    const { date, amount, refunds, description, z_report_id } = await req.json()

    if (!date || !amount) {
      return NextResponse.json({ error: 'Manjka date ali amount' }, { status: 400 })
    }

    const supabase = getServiceClient()

    // Poišči organizacijo za BUSINESS_ID
    const { data: biz } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single()

    if (!biz) {
      return NextResponse.json({ error: 'Business ni najden' }, { status: 404 })
    }

    // Poišči org_id za ta business
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)
      .single()

    if (!org) {
      return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })
    }

    // Preveri ali zapis za ta dan že obstaja
    const { data: existing } = await supabase
      .from('invoices')
      .select('id')
      .eq('org_id', org.id)
      .eq('issue_date', date)
      .eq('source', 'pos')
      .maybeSingle()

    if (existing) {
      // Posodobi obstoječi zapis
      await supabase
        .from('invoices')
        .update({
          amount: Number(amount),
          description,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      return NextResponse.json({ success: true, action: 'updated', id: existing.id })
    }

    // Ustvari nov prihodkovni zapis
    const invoiceNum = 'POS-' + date.replace(/-/g, '') + '-' + Date.now().toString().slice(-4)

    const { data: newInvoice, error } = await supabase
      .from('invoices')
      .insert({
        org_id: org.id,
        invoice_number: invoiceNum,
        issue_date: date,
        due_date: date,
        amount: Number(amount),
        status: 'paid',
        description,
        source: 'pos',
        z_report_id,
        client_name: 'ŠIRM fitness&bar — POS promet',
        vat_rate: 0,
        notes: `Bruto promet: €${Number(amount).toFixed(2)} | Vračila: €${Number(refunds||0).toFixed(2)}`,
      })
      .select()
      .single()

    if (error) {
      // Tabela morda nima source/z_report_id stolpca — poskusi brez
      const { data: fallback, error: err2 } = await supabase
        .from('invoices')
        .insert({
          org_id: org.id,
          invoice_number: invoiceNum,
          issue_date: date,
          due_date: date,
          amount: Number(amount),
          status: 'paid',
          description,
          client_name: 'ŠIRM fitness&bar — POS promet',
          vat_rate: 0,
          notes: `Bruto promet: €${Number(amount).toFixed(2)} | Vračila: €${Number(refunds||0).toFixed(2)}`,
        })
        .select()
        .single()

      if (err2) throw err2
      return NextResponse.json({ success: true, action: 'created', id: fallback.id })
    }

    return NextResponse.json({ success: true, action: 'created', id: newInvoice.id })

  } catch (e: any) {
    console.error('sync-income error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
