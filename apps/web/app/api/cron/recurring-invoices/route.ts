import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * Klican preko dnevnega crona (29.7.2026, na Nikovo prosnjo).
 *
 * PREJ: "Ponavljajoci racuni" stran je imela vso infrastrukturo za
 * avtomatizacijo (is_active, frequency, next_issue_date), a NOBEN cron je
 * ni nikoli dotaknil - deloval je SAMO rocen gumb "Izdaj zdaj".
 *
 * ZDAJ: ta cron vsak dan preveri VSE aktivne ponavljajoce racune, ki so
 * zapadli (next_issue_date <= danes). Za vsakega SAMODEJNO pripravi
 * OSNUTEK racuna (status='draft') - z isto logiko kot obstojeci rocen
 * gumb, le da uporablja PRAVO atomarno RPC stevilcenje namesto count(*)+1
 * (izognemo se isti napaki, ki smo jo ze popravili na /invoices/new).
 *
 * NAMENOMA se osnutek NE posilja/fiskalizira samodejno - Nik dobi email
 * obvestilo in mora osnutek RUCNO potrditi/poslati na strani /invoices.
 * To je zavestna odlocitev (ne pomanjkljivost) - samodejno posiljanje
 * pravih davcnih dokumentov brez pregleda je prevec tvegano.
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

  const today = new Date().toISOString().split('T')[0]
  const FREQ_DAYS: Record<string, number> = { weekly: 7, monthly: 30, quarterly: 91, yearly: 365 }

  const { data: due } = await supabase
    .from('recurring_invoices')
    .select('*')
    .eq('is_active', true)
    .lte('next_issue_date', today)

  let created = 0
  const byOrg: Record<string, { count: number; names: string[] }> = {}

  for (const rec of due || []) {
    try {
      const year = new Date().getFullYear()

      // Atomarna RPC stevilka (isti popravek kot /invoices/new, 24.7.2026) -
      // namesto count(*)+1, ki se pokvari ob vrzelih v obstojecih stevilkah.
      const { data: invoiceNumber } = await supabase.rpc('get_next_manual_invoice_number', {
        p_org_id: rec.org_id, p_year: year,
      })
      const finalNumber = invoiceNumber || `${year}-001`

      const vatRate = rec.line_items?.[0]?.vat_rate ?? 0
      const amountNet = rec.amount_total / (1 + vatRate / 100)
      const vatAmount = rec.amount_total - amountNet
      const dueDate = new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0]

      const { error: insErr } = await supabase.from('issued_invoices').insert({
        org_id: rec.org_id,
        invoice_number: finalNumber,
        invoice_type: 'invoice',
        client_name: rec.client_name,
        client_email: rec.client_email,
        issue_date: today,
        due_date: dueDate,
        line_items: rec.line_items,
        amount_net: amountNet,
        vat_amount: vatAmount,
        amount_total: rec.amount_total,
        status: 'draft',
        notes: `Ponavljajoč račun — samodejno pripravljen osnutek (${rec.frequency}). Preverite in potrdite pred pošiljanjem.`,
      })

      if (insErr) {
        console.error('recurring-invoices cron: napaka pri vpisu racuna', rec.id, insErr)
        continue
      }

      const nextDate = new Date(Date.now() + (FREQ_DAYS[rec.frequency] || 30) * 864e5).toISOString().split('T')[0]
      await supabase.from('recurring_invoices').update({
        last_issued_at: new Date().toISOString(),
        next_issue_date: nextDate,
      }).eq('id', rec.id)

      created++
      if (!byOrg[rec.org_id]) byOrg[rec.org_id] = { count: 0, names: [] }
      byOrg[rec.org_id].count++
      byOrg[rec.org_id].names.push(rec.client_name)
    } catch (e) {
      console.error('recurring-invoices cron: napaka pri obdelavi', rec.id, e)
    }
  }

  // Posamezno email obvestilo lastniku vsake organizacije, ki je imela
  // vsaj en pripravljen osnutek.
  let notified = 0
  for (const orgId of Object.keys(byOrg)) {
    try {
      const { data: owner } = await supabase
        .from('org_members')
        .select('user_id')
        .eq('org_id', orgId)
        .eq('role', 'owner')
        .maybeSingle()
      if (!owner) continue

      const { data: userData } = await supabase.auth.admin.getUserById(owner.user_id)
      const email = userData?.user?.email
      if (!email) continue

      const info = byOrg[orgId]
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
        body: JSON.stringify({
          to: email,
          subject: `${info.count} ${info.count === 1 ? 'ponavljajoč račun čaka' : 'ponavljajočih računov čaka'} na potrditev`,
          html: `<p>V Računku ${info.count === 1 ? 'je pripravljen' : 'so pripravljeni'} <strong>${info.count}</strong> ${info.count === 1 ? 'osnutek ponavljajočega računa' : 'osnutkov ponavljajočih računov'}:</p>
                 <ul>${info.names.map(n => `<li>${n}</li>`).join('')}</ul>
                 <p>Preverite in potrdite jih na strani <a href="${process.env.NEXT_PUBLIC_APP_URL}/invoices">Vsi računi</a> (filter: osnutki) — samodejno se NE pošljejo.</p>`,
        }),
      })
      notified++
    } catch (e) {
      console.error('recurring-invoices cron: napaka pri obvestilu', orgId, e)
    }
  }

  return NextResponse.json({ success: true, checked: (due || []).length, created, notified })
}
