import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { confirmIssuedInvoiceWithFurs } from '@/lib/furs-invoice-confirm'
import { resolveActiveOrgId, resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'

export const maxDuration = 300

/**
 * Naknadna fiskalizacija issued_invoices (Stripe/PDF racunov), ki so ostali
 * brez EOR (npr. FURS timeout med Stripe webhookom, manjkajoc certifikat ob
 * placilu, ipd.). Patch 3/3 revizije, 21.7.2026.
 *
 * RAZLIKA od /api/furs/resubmit (POS): pri POS je bil ZOI ze natisnjen na
 * racun, zato je tam potreben SubsequentSubmit z ohranjenim ZOI. Pri
 * issued_invoices ob neuspehu NIC ni shranjeno (ne ZOI ne stevilka) - zato
 * je "resubmit" tu preprosto ponoven klic confirmIssuedInvoiceWithFurs
 * (idempotenten, z atomarno kljucavnico iz patcha 2).
 *
 * Multi-tenant: avtenticiran uporabnik, deluje SAMO na racunih lastne org.
 *
 * POST body: { dryRun?: boolean (privzeto TRUE), limit?: number, from?: 'YYYY-MM-DD' }
 */
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(n: string) { return cookieStore.get(n)?.value }, set() {}, remove() {} } }
    )
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })

    const { orgId: __orgId, role: __role } = await resolveActiveOrgId(supabaseAuth, user.id, getRequestedOrgId(req))
    const member = __orgId ? { org_id: __orgId, role: __role } : null // vec-org podpora (30.7.2026)
    if (!member) return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })
    if (member.role && !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Samo lastnik/admin lahko sprozi naknadno fiskalizacijo' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const dryRun: boolean = body.dryRun !== false // privzeto TRUE (varno)
    const limit: number = Math.min(Number(body.limit) || 100, 200)
    const from: string = body.from || '2026-01-01'

    // Service-role klient za samo fiskalizacijo (webhook-style, brez RLS omejitev)
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    // Kandidati: placani/poslani racuni brez EOR, z zneskom > 0.
    // Osnutki (draft) so izkljuceni - se niso izdani, fiskalizacija ni dolzna.
    const { data: candidates, error } = await admin
      .from('issued_invoices')
      .select('id, invoice_number, amount_total, status, issue_date, client_name, created_at')
      .eq('org_id', member.org_id)
      .is('eor', null)
      .in('status', ['paid', 'sent'])
      .gt('amount_total', 0)
      .gte('issue_date', from)
      .order('issue_date', { ascending: true })
      .limit(limit)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        steviloRacunov: (candidates || []).length,
        skupajEur: (candidates || []).reduce((s, r) => s + Number(r.amount_total), 0).toFixed(2),
        racuni: candidates,
        opomba: 'Predogled - NIC ni bilo poslano. Za pravo posiljanje poslji { dryRun: false }.',
      })
    }

    // --- PRAVO POSILJANJE ---
    const results: any[] = []
    for (const inv of candidates || []) {
      try {
        const res = await confirmIssuedInvoiceWithFurs(admin, member.org_id, inv.id, 'card')
        results.push({
          invoiceId: inv.id,
          stranka: inv.client_name,
          znesek: inv.amount_total,
          status: res.success ? (res.alreadyConfirmed ? 'ZE_POTRJEN' : 'OK') : 'NAPAKA',
          invoiceNumber: res.invoiceNumber,
          eor: res.eor,
          napaka: res.error,
        })
      } catch (e: any) {
        results.push({ invoiceId: inv.id, stranka: inv.client_name, znesek: inv.amount_total, status: 'IZJEMA', napaka: e.message })
      }
      await new Promise(r => setTimeout(r, 300)) // ne preobremeni FURS
    }

    const ok = results.filter(r => r.status === 'OK' || r.status === 'ZE_POTRJEN').length
    return NextResponse.json({
      dryRun: false,
      uspesnih: ok,
      neuspesnih: results.length - ok,
      rezultati: results,
    })
  } catch (e: any) {
    console.error('resubmit-invoices error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
