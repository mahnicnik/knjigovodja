import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POPRAVLJENO (audit 23.7.2026): avtentikacija + org se dolocita iz SEJE
// klicatelja, ne vec "vzemi prvo organizacijo v bazi" (kar je za vsako
// organizacijo razen prve pisalo v NAPACNO org, in je bilo brez auth
// odprto za kogarkoli na internetu).
async function getSessionOrg() {
  const cookieStore = await cookies()
  const authed = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await authed.auth.getUser()
  if (!user) return { user: null, orgId: null as string | null }

  const { data: member } = await authed
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  return { user, orgId: member?.org_id ?? null }
}

export async function POST(req: NextRequest) {
  try {
    const { user, orgId } = await getSessionOrg()
    if (!user) {
      return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
    }
    if (!orgId) {
      return NextResponse.json({ error: 'Organizacija ni najdena za prijavljenega uporabnika' }, { status: 404 })
    }

    const { date, amount, refunds, description, z_report_id } = await req.json()

    if (!date || !amount) {
      return NextResponse.json({ error: 'Manjka date ali amount' }, { status: 400 })
    }

    const supabase = getServiceClient()
    const org = { id: orgId }

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
