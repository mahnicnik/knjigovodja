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

// POPRAVLJENO (26.7.2026, audit portala K1): prej je ta endpoint pisal v
// tabelo 'invoices', ki v bazi NE OBSTAJA (prava racunovodska tabela je
// kpo_entries, kamor pisejo tudi vsi drugi viri prihodkov: banka, kartice,
// Stripe/Woo/Shopify webhooki). Posledica: ves dnevni POS promet se je ob
// zakljucku blagajne TIHO IZGUBIL - nikoli ni prisel v KPO, na Dashboard,
// v Statistiko ali davcne obracune.
//
// Zdaj: dnevni promet se knjizi kot prihodek v kpo_entries, z DDV
// razclenitvijo iz Z-porocila (ce je z_report_id podan), in z varovalko
// proti podvojitvi, ce se isti dan sinhronizira veckrat.

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
    const grossAmount = Number(amount)

    // DDV razclenitev iz Z-porocila (ce je na voljo) - da KPO vnos vsebuje
    // pravilno locen DDV, ne le bruto znesek.
    let vatOut = 0
    let netIncome = grossAmount
    if (z_report_id) {
      const { data: zr } = await supabase
        .from('z_reports')
        .select('total_vat_22, total_vat_95')
        .eq('id', z_report_id)
        .maybeSingle()
      if (zr) {
        vatOut = Number(zr.total_vat_22 || 0) + Number(zr.total_vat_95 || 0)
        netIncome = Math.round((grossAmount - vatOut) * 100) / 100
      }
    }

    const entryDescription = description || `POS dnevni promet — ${date}`
    const entryNotes = `Bruto promet: €${grossAmount.toFixed(2)} | Vračila: €${Number(refunds || 0).toFixed(2)}${z_report_id ? ` | Z-poročilo: ${z_report_id}` : ''}`

    // VAROVALKA proti podvojitvi: ce za ta dan in to organizacijo ze obstaja
    // POS vnos, ga POSODOBI namesto ustvarjanja novega (blagajna se lahko
    // zapre veckrat na dan, ali se sinhronizacija ponovi).
    const { data: existing } = await supabase
      .from('kpo_entries')
      .select('id')
      .eq('org_id', orgId)
      .eq('entry_date', date)
      .eq('category', 'POS promet')
      .maybeSingle()

    if (existing) {
      const { error: updErr } = await supabase
        .from('kpo_entries')
        .update({
          description: entryDescription,
          income: netIncome,
          vat_out: vatOut,
          notes: entryNotes,
        })
        .eq('id', existing.id)

      if (updErr) {
        console.error('sync-income: napaka pri posodobitvi KPO vnosa:', updErr)
        return NextResponse.json({ error: 'Napaka pri posodobitvi: ' + updErr.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, action: 'updated', id: existing.id })
    }

    const { data: newEntry, error } = await supabase
      .from('kpo_entries')
      .insert({
        org_id: orgId,
        entry_date: date,
        description: entryDescription,
        entry_type: 'income',
        income: netIncome,
        expense: 0,
        vat_in: 0,
        vat_out: vatOut,
        category: 'POS promet',
        notes: entryNotes,
      })
      .select('id')
      .single()

    if (error) {
      // POPRAVLJENO: prej je koda ob napaki TIHO nadaljevala (fallback brez
      // preverjanja) - zdaj napako vrnemo, da se ne izgubi neopazno.
      console.error('sync-income: napaka pri vpisu KPO vnosa:', error)
      return NextResponse.json({ error: 'Napaka pri knjiženju: ' + error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, action: 'created', id: newEntry?.id })

  } catch (e: any) {
    console.error('sync-income error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
