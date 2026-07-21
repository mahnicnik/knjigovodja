import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { confirmWithFurs, extractFromP12, type FursConfig, type FursInvoiceData } from '@/lib/furs'

export const maxDuration = 300 // dolg zaporeden postopek

const ORG_ID = '1d406efe-58d0-4573-8679-d9f666fce964'

async function assertOwner() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value }, set() {}, remove() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: member } = await supabase
    .from('org_members').select('org_id, role').eq('user_id', user.id).maybeSingle()
  if (!member || member.org_id !== ORG_ID) return null
  return user
}

/**
 * Naknadna fiskalizacija (SubsequentSubmit) racunov, ki so bili izdani v obdobju,
 * ko je sistem napacno prikazoval "potrjeno" (lazni EOR) ali EOR sploh ni bil
 * pridobljen. FURS je pisno predlagal ponovno posiljanje ("Predlagamo, da vse
 * nepotrjene racune pred 17.7.2026 ponovno posljete v potrjevanje.").
 *
 * POST body: { dryRun: boolean, from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD', limit?: number }
 * - dryRun=true: samo predogled seznama, NIC se ne poslje
 * - dryRun=false: zaporedno posiljanje s porocilom; pravi EOR se zapise v payments
 */
export async function POST(req: NextRequest) {
  const user = await assertOwner()
  if (!user) return NextResponse.json({ error: 'Ni dostopa' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const dryRun: boolean = body.dryRun !== false // privzeto TRUE (varno)
  const from: string = body.from || '2026-07-01'
  const to: string = body.to || '2026-07-17'
  const limit: number = Math.min(Number(body.limit) || 500, 500)
  const onlyUnconfirmed: boolean = body.onlyUnconfirmed === true
  const toEffective = onlyUnconfirmed
    ? new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10)
    : to

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Racuni z natisnjenim ZOI v obdobju (lazni ali manjkajoci EOR)
  let query = admin
    .from('payments')
    .select('id, order_id, amount, furs_zoi, furs_eor, paid_at, orders!inner(id, number, invoice_number, total, vat_amount, business_id)')
    .not('furs_zoi', 'is', null)
    .gte('paid_at', from)
    .lt('paid_at', toEffective)
  if (onlyUnconfirmed) query = query.is('furs_eor', null)
  const { data: rows, error } = await query
    .order('paid_at', { ascending: true })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const parseInvoiceNumber = (o: any, p: any) => {
    // Natisnjena oznaka npr. "SIRBFB01-RACUNKO01-190" -> uporabi TOCNO te dele,
    // da se naknadno poslani racun ujema z natisnjenim.
    const inv = String(o?.invoice_number || '')
    const m = inv.match(/^([A-Z0-9]+)-([A-Z0-9]+)-(\d+)$/i)
    if (m) return { premiseId: m[1], deviceId: m[2], invoiceNumber: parseInt(m[3], 10) }
    return { premiseId: 'SIRBFB01', deviceId: 'RACUNKO01', invoiceNumber: Number(o?.number) }
  }

  const preview = (rows || []).map((r: any) => {
    const o = Array.isArray(r.orders) ? r.orders[0] : r.orders
    const ids = parseInvoiceNumber(o, r)
    return {
      paymentId: r.id,
      paidAt: r.paid_at,
      amount: Number(r.amount),
      zoi: r.furs_zoi,
      staryEor: r.furs_eor,
      ...ids,
    }
  })

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      obdobje: { from, to: toEffective, onlyUnconfirmed },
      steviloRacunov: preview.length,
      skupajEur: preview.reduce((s, x) => s + x.amount, 0).toFixed(2),
      racuni: preview,
    })
  }

  // --- PRAVO POSILJANJE ---
  const { data: cert } = await admin
    .from('furs_certificates').select('*')
    .eq('org_id', ORG_ID).eq('is_active', true).maybeSingle()
  if (!cert) return NextResponse.json({ error: 'Certifikat ni nalozen' }, { status: 400 })
  const p12Buffer = Buffer.from(cert.certificate_data, 'base64')
  const { privateKeyPem, certificatePem } = extractFromP12(p12Buffer, cert.certificate_password ?? '')

  const results: any[] = []
  for (const inv of preview) {
    const config: FursConfig = {
      taxNumber: '91390419',
      premiseId: inv.premiseId,
      deviceId: inv.deviceId,
      privateKeyPem,
      certificatePem,
      isTest: false,
    }
    const data: FursInvoiceData = {
      invoiceNumber: inv.invoiceNumber,
      amountTotal: inv.amount,
      issueDateTime: new Date(inv.paidAt),
      presetZoi: inv.zoi,          // SHRANJENI ZOI z natisnjenega racuna!
      subsequentSubmit: true,      // uradna oznaka naknadnega posredovanja
    } as FursInvoiceData
    try {
      const res = await confirmWithFurs(config, data)
      if (res.success && res.eor) {
        await admin.from('payments').update({ furs_eor: res.eor, furs_sent_at: new Date().toISOString() }).eq('id', inv.paymentId)
        results.push({ ...inv, status: 'OK', noviEor: res.eor })
      } else {
        results.push({ ...inv, status: 'NAPAKA', napaka: res.errorMessage })
      }
    } catch (e: any) {
      results.push({ ...inv, status: 'IZJEMA', napaka: e.message })
    }
    await new Promise(r => setTimeout(r, 300)) // ne preobremeni FURS
  }

  const ok = results.filter(r => r.status === 'OK').length
  return NextResponse.json({
    dryRun: false,
    obdobje: { from, to },
    uspesnih: ok,
    neuspesnih: results.length - ok,
    rezultati: results,
  })
}
