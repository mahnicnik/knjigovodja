import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { confirmIssuedInvoiceWithFurs } from '@/lib/furs-invoice-confirm'
import { resolveActiveOrg, getRequestedOrgId } from '@/lib/active-org-server'

/**
 * Simulacija Stripe placila — RACUNKO SANDBOX (11.8.2026)
 *
 * NAMEN: omogociti testiranje CELOTNEGA toka (Stripe placilo -> racun ->
 * fiskalizacija) BREZ potrebe po:
 *   - pravem Stripe accountu uporabnika
 *   - konfiguriranem webhook secretu
 *   - dejanskem placilu (niti testnem Stripe placilu)
 *
 * To je LOCEN endpoint od pravega webhooka (api/webhooks/stripe/route.ts) -
 * namenoma NE deli kode z njim, da se izognemo tveganju pri spreminjanju
 * ze delujoce, obcutljive webhook logike. Logika je poenostavljena
 * (ponovitev) razlicica - brez PDF/email posiljanja (da se izognemo
 * nenamernemu posiljanju testnih e-mailov na prave naslove).
 *
 * VARNOST: zahteva PRIJAVLJENEGA uporabnika (za razliko od pravega
 * webhooka, ki ga klice Stripe s podpisom) - orgId se pridobi iz
 * uporabnikove seje, ne iz URL parametra.
 *
 * Priporocamo uporabo skupaj s FURS demo nacinom (/nastavitve/blagajna),
 * da je celoten tok testiran brez zunanjih odvisnosti.
 */

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set() {}, remove() {},
      },
    }
  )
}

async function generateInvoiceNumber(supabase: any, orgId: string): Promise<string> {
  const year = new Date().getFullYear()
  // POPRAVLJENO (16.8.2026): stevilka se je dolocala s STETJEM obstojecih
  // racunov, ne z najvisjo. Dve tezavi:
  //  1. Ob brisanju racuna se stevec zmanjsa in nova stevilka TRCI z obstojeco.
  //     Vpis zavrne omejitev v bazi, webhook spodleti, ponudnik poskusa znova -
  //     placilo je prejeto, racun pa ne nastane.
  //  2. Vzorec je stel tudi storno zapise s pripono -S/-D, zato je stevec rasel
  //     hitreje od dejanskih racunov in preskakoval stevilke.
  // Zdaj vzamemo NAJVISJO obstojeco stevilko in ji pristejemo ena, pripone pa
  // izloCimo.
  const { data: obstojeci } = await supabase
    .from('issued_invoices')
    .select('invoice_number')
    .eq('org_id', orgId)
    .like('invoice_number', `STR-${year}-%`)

  const vzorec = new RegExp(`^STR-${year}-(\\d+)$`)
  const najvisja = (obstojeci ?? []).reduce((max: number, r: any) => {
    const m = vzorec.exec(String(r.invoice_number ?? ''))
    return m ? Math.max(max, parseInt(m[1], 10)) : max
  }, 0)

  const seq = String(najvisja + 1).padStart(4, '0')
  return `STR-${year}-${seq}`
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase()

    // ── Avtentikacija: preveri prijavljenega uporabnika + org clanstvo ──
    // Uporabi UVELJAVLJEN vec-organizacijski vzorec (resolveActiveOrg),
    // isti kot ostali API endpointi v aplikaciji (npr. scan-receipt).
    const cookieStore = await cookies()
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    )
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Niste prijavljeni' }, { status: 401 })
    }

    const member = await resolveActiveOrg(supabase, user.id, getRequestedOrgId(req), '*')
    if (!member.orgId || !member.organizations) {
      return NextResponse.json({ error: 'Organizacija ni najdena' }, { status: 404 })
    }
    const orgId = member.orgId
    const org = member.organizations

    // ── Zgradi SIMULIRAN Stripe objekt (checkout.session.completed, mode:payment) ──
    const fakeStripeId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const amountTotal = 1.00 // majhen, ocitno testen znesek
    const customerEmail = user.email ?? 'test@racunko.si'
    const customerName = 'TEST Simulacija (Računko sandbox)'

    const amountNet = amountTotal / (org.vat_registered ? 1.22 : 1)
    const vatAmount = org.vat_registered ? amountTotal - amountNet : 0

    const lineItems = [{
      description: 'Testno Stripe plačilo (simulacija — Računko sandbox)',
      quantity: 1,
      unit_price: Math.round(amountNet * 100) / 100,
      amount_net: Math.round(amountNet * 100) / 100,
      vat_rate: org.vat_registered ? 22 : 0,
      vat_amount: Math.round(vatAmount * 100) / 100,
    }]

    const invoiceNumber = await generateInvoiceNumber(supabase, orgId)
    const issueDate = new Date().toISOString().split('T')[0]
    const externalRef = `stripe-sim-${fakeStripeId}`

    const { data: invoice, error: invErr } = await supabase
      .from('issued_invoices')
      .insert({
        org_id: orgId,
        invoice_number: invoiceNumber,
        invoice_type: 'invoice',
        client_name: customerName,
        client_email: customerEmail,
        issue_date: issueDate,
        due_date: issueDate,
        service_date_from: issueDate,
        service_date_to: issueDate,
        line_items: lineItems,
        amount_net: Math.round(amountNet * 100) / 100,
        vat_amount: Math.round(vatAmount * 100) / 100,
        amount_total: Math.round(amountTotal * 100) / 100,
        status: 'paid',
        paid_at: new Date().toISOString(),
        paid_amount: amountTotal,
        notes: `🧪 SIMULIRANO Stripe plačilo (Računko sandbox) — ni pravo plačilo, samo za testiranje toka`,
        external_reference: externalRef,
      })
      .select('id')
      .single()

    if (invErr || !invoice) {
      throw new Error(`Napaka pri ustvarjanju testnega računa: ${invErr?.message}`)
    }

    const { error: simKpoErr } = await supabase.from('kpo_entries').insert({
      org_id: orgId,
      entry_date: issueDate,
      description: `🧪 Simulacija — ${customerName}`,
      entry_type: 'income',
      income: amountNet,
      vat_out: vatAmount,
      invoice_id: invoice.id,
      category: 'spletna_prodaja',
      notes: 'Simuliran vnos (Računko sandbox) — ni pravo plačilo',
    })
    if (simKpoErr) console.error('Simulacija: vnosa v knjigo ni bilo mogoce shraniti:', simKpoErr)

    // ── FURS potrditev (uporabi demo nacin, ce je vklopljen) ──
    let fursResult: Awaited<ReturnType<typeof confirmIssuedInvoiceWithFurs>> | null = null
    try {
      fursResult = await confirmIssuedInvoiceWithFurs(supabase, orgId, invoice.id, 'card')
    } catch (fursErr: any) {
      console.error('Simulacija — FURS potrditev nepricakovana napaka:', fursErr.message)
    }

    return NextResponse.json({
      success: true,
      invoiceId: invoice.id,
      invoiceNumber,
      message: `Testni račun ${invoiceNumber} uspešno ustvarjen (simulacija)`,
      fursConfirmed: fursResult?.success ?? false,
      fursDemoMode: !!org.furs_demo_mode,
      fursError: fursResult?.success ? undefined : fursResult?.error,
    })

  } catch (e: any) {
    console.error('Stripe simulate-test-payment napaka:', e)
    return NextResponse.json({ error: e.message ?? 'Napaka pri simulaciji' }, { status: 500 })
  }
}
