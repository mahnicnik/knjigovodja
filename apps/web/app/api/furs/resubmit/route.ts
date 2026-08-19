import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { confirmWithFurs, extractFromP12, type FursConfig, type FursInvoiceData } from '@/lib/furs'
import { getFursCertificate } from '@/lib/furs-cert'
import { resolveActiveOrgId, resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'

export const maxDuration = 300 // dolg zaporeden postopek

const ORG_ID = '1d406efe-58d0-4573-8679-d9f666fce964'

// POPRAVLJENO (17.8.2026): funkcija je uporabljala `req`, a ga ni prejela kot
// parameter (ReferenceError ob vsakem klicu -> ponovna oddaja na FURS je bila
// popolnoma nedelujoca). Zdaj ga prejme od klicatelja.
async function assertOwner(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value }, set() {}, remove() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { orgId: __orgId, role: __role } = await resolveActiveOrgId(supabase, user.id, getRequestedOrgId(req))
    const member = __orgId ? { org_id: __orgId, role: __role } : null // vec-org podpora (30.7.2026)
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
  const user = await assertOwner(req)
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
    // DODANO (16.8.2026): order_lines s stopnjami DDV - brez njih se je naknadno
    // fiskaliziran racun prijavil v celoti po 22%, tudi ce je vseboval hrano po
    // 9,5%. To bi pomenilo, da se NAKNADNA prijava ne ujema z natisnjenim racunom.
    .select('id, order_id, amount, furs_zoi, furs_eor, paid_at, orders!inner(id, number, invoice_number, total, vat_amount, business_id, order_lines(total, qty, unit_price, vat_rate, voided))')
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
    // POPRAVLJENO 21.7.2026: NE pada vec na orders.number kot FURS zaporedno
    // stevilko! orders.number je INTERNI stevec narocila, ne FURS zaporedje -
    // uporaba tega je 19.7. povzrocila 40 racunov z napacnimi FURS stevilkami
    // 288-329. Ce prave natisnjene stevilke ni, vrni null -> klicatelj tak
    // racun PRESKOCI in oznaci za rocno obravnavo, ne ugane napacne.
    return { premiseId: null, deviceId: null, invoiceNumber: null }
  }

  const preview = (rows || []).map((r: any) => {
    const o = Array.isArray(r.orders) ? r.orders[0] : r.orders
    const ids = parseInvoiceNumber(o, r)
    // DODANO (16.8.2026): razclenitev po stopnjah DDV iz vrstic narocila.
    const linije = (o?.order_lines || []).filter((l: any) => !l.voided)
    let vatBreakdown: { rate: number; net: number; vat: number }[] | undefined
    if (linije.length > 0) {
      const vsotaVrstic = linije.reduce((s: number, l: any) =>
        s + Number(l.total ?? (Number(l.qty || 0) * Number(l.unit_price || 0))), 0)
      const faktor = vsotaVrstic > 0 ? Number(r.amount) / vsotaVrstic : 1
      const poStopnji = new Map<number, number>()
      for (const l of linije) {
        const bruto = Number(l.total ?? (Number(l.qty || 0) * Number(l.unit_price || 0))) * faktor
        const stopnja = Number(l.vat_rate ?? 22)
        poStopnji.set(stopnja, (poStopnji.get(stopnja) || 0) + bruto)
      }
      vatBreakdown = Array.from(poStopnji.entries()).map(([rate, bruto]) => {
        const net = rate > 0 ? bruto / (1 + rate / 100) : bruto
        return { rate, net: Math.round(net * 100) / 100, vat: Math.round((bruto - net) * 100) / 100 }
      }).sort((a, b) => b.rate - a.rate)
    }
    return {
      paymentId: r.id,
      paidAt: r.paid_at,
      amount: Number(r.amount),
      zoi: r.furs_zoi,
      staryEor: r.furs_eor,
      vatBreakdown,
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
  const { cert, isTest } = await getFursCertificate(admin, ORG_ID)
  if (!cert) return NextResponse.json({ error: `${isTest ? 'Testni' : 'Produkcijski'} certifikat ni nalozen` }, { status: 400 })
  const p12Buffer = Buffer.from(cert.certificate_data, 'base64')
  const { privateKeyPem, certificatePem } = extractFromP12(p12Buffer, cert.certificate_password ?? '')

  // VAROVALKA (17.8.2026): brez davcne stevilke na certifikatu ne gre naprej -
  // prej bi se poslal prazen niz in FURS bi (ali pa sploh ne bi) zavrnil zahtevek
  // sele na svoji strani, potem ko je stevilka ze porabljena.
  if (!cert.tax_number) {
    return NextResponse.json({ error: 'Davčna številka na certifikatu ni nastavljena — ponovna oddaja zavrnjena, na FURS ni bilo poslano nič.' }, { status: 400 })
  }

  const results: any[] = []
  for (const inv of preview) {
    // Preskoci racune brez prave FURS stevilke (glej parseInvoiceNumber popravek 21.7.2026)
    if (inv.invoiceNumber == null || inv.premiseId == null) {
      results.push({ ...inv, status: 'MANJKA_ST', napaka: 'Manjka prava FURS zaporedna stevilka (orders.invoice_number) - potreben rocni pregled, NE poslano' })
      continue
    }
    const config: FursConfig = {
      // POPRAVLJENO (17.8.2026): tu je bila kot rezervna vrednost TUJA DAVCNA
      // STEVILKA. Ce podjetje nima svoje, bi svoj racun prijavilo pri FURS
      // pod tujo. Bolje je zavrniti z razlago kot prijaviti napacno.
      taxNumber: cert.tax_number, // POPRAVLJENO 29.7.2026 / VAROVALKA 17.8.2026
      premiseId: inv.premiseId,
      deviceId: inv.deviceId,
      privateKeyPem,
      certificatePem,
      isTest: false,
    }
    const data: FursInvoiceData = {
      invoiceNumber: inv.invoiceNumber,
      amountTotal: inv.amount,
      vatBreakdown: inv.vatBreakdown,
      issueDateTime: new Date(inv.paidAt),
      presetZoi: inv.zoi,          // SHRANJENI ZOI z natisnjenega racuna!
      subsequentSubmit: true,      // uradna oznaka naknadnega posredovanja
    } as FursInvoiceData
    try {
      const res = await confirmWithFurs(config, data)
      if (res.success && res.eor) {
        // POPRAVLJENO (16.8.2026): prej brez preverbe napake. FURS je racun
        // POTRDIL, EOR pa se ni shranil - ob naslednjem zagonu bi bil isti
        // racun poslan SE ENKRAT, zato bi FURS imel dva zapisa za isti racun.
        // Zdaj se to jasno oznaci, da je mogoc rocni popravek.
        const { error: saveErr } = await admin.from('payments').update({ furs_eor: res.eor, furs_sent_at: new Date().toISOString() }).eq('id', inv.paymentId)
        if (saveErr) {
          console.error('FURS resubmit: racun je POTRJEN (EOR', res.eor, '), shranjevanje pa NI uspelo:', inv.paymentId, saveErr)
          results.push({ ...inv, status: 'POTRJEN, NI SHRANJEN', noviEor: res.eor, napaka: `FURS je račun potrdil (EOR ${res.eor}), shranjevanje v bazo pa ni uspelo: ${saveErr.message}. EOR vnesite ročno — NE pošiljajte znova.` })
        } else {
          results.push({ ...inv, status: 'OK', noviEor: res.eor })
        }
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
