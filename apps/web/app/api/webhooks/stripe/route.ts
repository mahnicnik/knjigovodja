import { NextRequest, NextResponse } from 'next/server'
import { lokalniDatum } from '@/lib/tax-constants'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { confirmIssuedInvoiceWithFurs } from '@/lib/furs-invoice-confirm'
import { renderToBuffer } from '@react-pdf/renderer'
import { InvoicePDF, generateUpnQr, generateFursQr } from '@/lib/invoice-pdf'
import { buildInvoiceEmailHtml } from '@/lib/invoice-email'
import { resend, FROM_EMAIL, posiljateljZa } from '@/lib/resend'

/**
 * Stripe Webhook Handler — za uporabnikove lastne Stripe naročnine/plačila
 *
 * Sprejme webhook od uporabnikovega lastnega Stripe accounta (npr. njegove
 * SaaS aplikacije) ob uspešnem plačilu in avtomatsko:
 * 1. Ustvari issued_invoice v Računko
 * 2. Doda KPO vnos (knjiga prihodkov)
 *
 * Nastavitev v Stripe dashboardu uporabnika:
 * Stripe → Developers → Webhooks → Add endpoint
 * - URL: https://xn--raunko-j2a.si/api/webhooks/stripe?org_id=VAŠ_ORG_ID
 * - Events: checkout.session.completed, invoice.paid, payment_intent.succeeded
 * - Signing secret: (vnesi v Računko nastavitve → Integracije → Stripe)
 *
 * POMEMBNO: To je webhook za UPORABNIKOV lasten Stripe account (npr. za
 * njegovo aplikacijo ki pobira plačila), NE za Računko subscription Stripe.
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

/**
 * Preveri Stripe webhook podpis (HMAC-SHA256 po Stripe specifikaciji).
 * Stripe pošlje header: t=timestamp,v1=signature
 */
function verifyStripeSignature(payload: string, sigHeader: string, secret: string): boolean {
  try {
    const parts = sigHeader.split(',').reduce((acc: Record<string, string>, part) => {
      const [k, v] = part.split('=')
      acc[k] = v
      return acc
    }, {})
    const timestamp = parts['t']
    const signature = parts['v1']
    if (!timestamp || !signature) return false

    const signedPayload = `${timestamp}.${payload}`
    const computed = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')

    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
  } catch {
    return false
  }
}

/**
 * PRELET 320: zapis v integration_logs, ki napake NE pogoltne tiho.
 *
 * Prej so bili VSI zapisi s statusom 'failed'/'skipped' zavrnjeni zaradi
 * omejitve integration_logs_status_check (dovoljevala je samo
 * success/error/pending), napaka pa se je zavrgla z `.then(() => {}, () => {})`.
 * Posledica: od 30.7.2026 ni bil zabelezen NOBEN neuspeh ali preskok - ko
 * racun ni nastal (primer Domen Kocjan, 20.9.2026), v /integracije ni bilo
 * nobene sledi. Omejitev je razsirjena v migraciji 159, tu pa vsak neuspel
 * zapis vsaj izpisemo v streznisko dnevnik, da se tiha izguba ne ponovi.
 */
async function zapisiLog(supabase: any, vrstica: Record<string, any>): Promise<void> {
  try {
    const { error } = await supabase.from('integration_logs').insert({ integration_type: 'stripe', ...vrstica })
    if (error) console.error('Stripe webhook: zapis v integration_logs ni uspel:', error.message, vrstica)
  } catch (e: any) {
    console.error('Stripe webhook: zapis v integration_logs je vrgel napako:', e?.message, vrstica)
  }
}

/**
 * PRELET 320: znesek placila v centih.
 *
 * Prej: `obj.amount_total ?? obj.amount_paid ?? obj.amount`. Stripe racun
 * (invoice) polja amount_total NIMA, zato se je vzel amount_paid. Ta je 0,
 * kadar je racun poravnan iz dobroimetja stranke ali ga je prodajalec v
 * Stripe oznacil kot "placan izven Stripe" (paid out of band) - vrednost
 * prodaje (`total`) pa je vec kot 0. Webhook je tak racun preskocil kot
 * "znesek 0" in vrnil 200, zato ga Stripe ni nikoli ponovil. Tako je
 * 20.9.2026 izpadel racun za enkratno prodajo (masterclass) pri Domnu.
 *
 * Zdaj je za racun merodajen `total` (vrednost prodaje po popustih). Pri
 * brezplacnem preizkusu ali 100 % kuponu je total 0 in dogodek se se vedno
 * pravilno preskoci.
 */
function izracunajZnesek(obj: any): { centi: number; opomba: string } {
  if (obj?.object === 'invoice') {
    const total = Number(obj.total ?? 0)
    const placano = Number(obj.amount_paid ?? 0)
    if (total > 0) {
      let opomba = ''
      if (placano <= 0) {
        opomba = obj.paid_out_of_band
          ? ' Račun je v Stripe označen kot plačan izven Stripe.'
          : ' Poravnano iz dobroimetja stranke v Stripe.'
      }
      return { centi: total, opomba }
    }
    return { centi: placano > 0 ? placano : 0, opomba: '' }
  }
  return { centi: Number(obj?.amount_total ?? obj?.amount_received ?? obj?.amount ?? 0), opomba: '' }
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
  let orgId: string | null = null
  let supabase: any = null
  try {
    supabase = await getSupabase()

    const { searchParams } = new URL(req.url)
    orgId = searchParams.get('org_id')

    if (!orgId) {
      return NextResponse.json({ error: 'org_id parameter manjka' }, { status: 400 })
    }

    const rawBody = await req.text()
    const signature = req.headers.get('stripe-signature') ?? ''

    const { data: integration } = await supabase
      .from('integrations')
      .select('webhook_secret, settings')
      .eq('org_id', orgId)
      .eq('type', 'stripe')
      .eq('is_active', true)
      .maybeSingle()

    if (!integration) {
      // DODANO (prelet 296): ce nekdo (pomotoma) izklopi integracijo, je bil
      // to prej NAJTISJI moznii izpad - webhook je tiho vracal 404, brez
      // sledi v /integracije. Zdaj se zabelezi tudi to.
      await zapisiLog(supabase, {
        org_id: orgId,
        status: 'failed',
        payload: { reason: 'integration_not_active_or_missing' },
      })
      return NextResponse.json({ error: 'Stripe integracija ni nastavljena' }, { status: 404 })
    }

    if (integration.webhook_secret && signature) {
      const isValid = verifyStripeSignature(rawBody, signature, integration.webhook_secret)
      if (!isValid) {
        // DODANO (30.7.2026): beleži neveljaven podpis - prej se je
        // tiho zavrnilo brez sledi v /integracije.
        await zapisiLog(supabase, {
          org_id: orgId,
          status: 'failed',
          payload: { error: 'invalid_signature' },
        })
        return NextResponse.json({ error: 'Neveljaven podpis' }, { status: 401 })
      }
    }

    const event = JSON.parse(rawBody)

    // Obravnavamo samo dogodke uspešnega plačila
    // POPRAVLJENO 22.7.2026: payment_intent.succeeded ODSTRANJEN - en nakup
    // sprozi tako checkout.session.completed kot payment_intent.succeeded
    // (dva razlicna objekta z razlicnima ID-jema za isto placilo), kar je
    // ustvarilo PODVOJENE racune. checkout.session.completed pokrije payment
    // linke/checkout, invoice.paid pokrije narocnine.
    // POPRAVLJENO (prelet 296): "prezrti"/preskoceni dogodki se prej NISO
    // beleziti nikamor - ce Stripe posilja tip dogodka, ki ga ne pricakujemo
    // (ali ce se katera od spodnjih preskocnih poti sprozi), v /integracije
    // ni bilo NOBENE sledi, da je webhook sploh prispel. Ko racun ni nastal,
    // ni bilo mogoce locevati "webhook ni prispel" od "webhook je prispel,
    // a smo ga namenoma preskocili". Zdaj beleximo VSAK prejeti dogodek.
    //
    // PRELET 324: payment_intent.succeeded je spet obdelan - a BREZ dvojnikov.
    // Brez njega je izpadlo vsako placilo, ki ni slo prek Checkouta ali
    // Stripe racuna (placilo, ustvarjeno v Stripe nadzorni plosci, placilo
    // prek zunanje platforme ...). Tako je 18.9.2026 pri Domnu Kocjanu
    // izpadel racun za masterclass (289 EUR, pi_3UGut6...): Stripe je poslal
    // samo payment_intent.succeeded, ki ga webhook ni poslusal.
    // Zascita pred dvojniki (glej `kljucPlacila` spodaj): checkout in
    // payment_intent istega nakupa imata ZDAJ ISTI kljuc (ID placila pi_),
    // placilo za Stripe racun pa pokrije invoice.paid.
    const handledEvents = ['checkout.session.completed', 'invoice.paid', 'payment_intent.succeeded']
    if (!handledEvents.includes(event.type)) {
      await zapisiLog(supabase, {
        org_id: orgId,
        external_id: event.data?.object?.id ?? null,
        status: 'skipped',
        payload: { reason: 'event_type_not_handled', event_type: event.type, event_id: event.id },
      })
      return NextResponse.json({ message: `Event ${event.type} ignoriran` }, { status: 200 })
    }

    const obj = event.data.object

    // POPRAVLJENO (11.8.2026, najdba pri zivem testiranju): pri NAROCNINI
    // (subscription) checkout.session.completed IN invoice.paid OBA
    // sprozita ob prvem placilu - a imata RAZLICNA Stripe ID-ja (cs_live_
    // proti in_), zato ju obstojeca dedup zascita (po obj.id) NE prepozna
    // kot isto transakcijo -> podvojen racun. Za narocnine je invoice.paid
    // PRAVI vir resnice (sprozi se tudi za VSAKO naslednjo obnovitev), zato
    // checkout.session.completed za mode:'subscription' PRESKOCIMO.
    // Za enkratna placila (mode:'payment') checkout.session.completed
    // ostane edini/pravilni dogodek - nespremenjeno.
    if (event.type === 'checkout.session.completed' && obj.mode === 'subscription') {
      await zapisiLog(supabase, {
        org_id: orgId,
        external_id: obj.id ?? null,
        status: 'skipped',
        payload: { reason: 'subscription_checkout_awaiting_invoice_paid', event_type: event.type, event_id: event.id },
      })
      return NextResponse.json({ message: 'Checkout za narocnino - caka se invoice.paid' }, { status: 200 })
    }

    // PRELET 320: ista past kot zgoraj, le pri ENKRATNEM placilu. Ce ima
    // Payment Link / Checkout vklopljeno "Create an invoice" (invoice_creation),
    // Stripe za isti nakup poslje checkout.session.completed (cs_) IN
    // invoice.paid (in_) - dva razlicna ID-ja, dedup ju ne bi povezal in
    // nastala bi DVA racuna. V tem primeru je vir resnice invoice.paid.
    if (event.type === 'checkout.session.completed' && obj.invoice) {
      await zapisiLog(supabase, {
        org_id: orgId,
        external_id: obj.id ?? null,
        status: 'skipped',
        payload: { reason: 'checkout_with_invoice_awaiting_invoice_paid', event_type: event.type, event_id: event.id, invoice: obj.invoice },
      })
      return NextResponse.json({ message: 'Checkout z racunom - caka se invoice.paid' }, { status: 200 })
    }

    // PRELET 324: placilo za Stripe RACUN (narocnina ali poslan racun) sprozi
    // tudi payment_intent.succeeded - racun zanj izda invoice.paid, zato ga
    // tu preskocimo (sicer dva racuna za isto placilo).
    if (event.type === 'payment_intent.succeeded' && obj.invoice) {
      await zapisiLog(supabase, {
        org_id: orgId,
        external_id: obj.id ?? null,
        status: 'skipped',
        payload: { reason: 'payment_intent_for_invoice_awaiting_invoice_paid', event_type: event.type, event_id: event.id, invoice: obj.invoice },
      })
      return NextResponse.json({ message: 'Placilo Stripe racuna - racun izda invoice.paid' }, { status: 200 })
    }
    // Novejse razlicice Stripe API (od 2025-03-31) v placilu NIMAJO vec polja
    // `invoice`, zato iz dogodka ni mogoce vedeti, ali placilo pripada Stripe
    // racunu. Da ne tvegamo dvojnika, takega placila NE obdelamo in to
    // zabelezimo (resitev: API verzija webhooka 2025-02-24 ali starejsa).
    if (event.type === 'payment_intent.succeeded' && !('invoice' in obj)) {
      await zapisiLog(supabase, {
        org_id: orgId,
        external_id: obj.id ?? null,
        status: 'skipped',
        payload: { reason: 'payment_intent_api_version_unsupported', event_type: event.type, event_id: event.id, api_version: event.api_version ?? null },
      })
      return NextResponse.json({ message: 'API verzija ne omogoca locevanja placil' }, { status: 200 })
    }

    // PRELET 324: KLJUC PLACILA za zascito pred dvojniki. En nakup prek
    // Checkouta sprozi checkout.session.completed (cs_) IN
    // payment_intent.succeeded (pi_) - zato se je 22.7.2026 payment_intent
    // odstranil. Zdaj oba zapiseta ISTI kljuc: ID placila (pi_). Kateri koli
    // pride prvi, ustvari racun; drugi najde obstojecega (ali ga zavrne
    // unikatni indeks iz migracije 159, ce prideta hkrati).
    const kljucPlacila = event.type === 'payment_intent.succeeded'
      ? obj.id
      : (event.type === 'checkout.session.completed' && typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.id)
    const externalRef = `stripe-${kljucPlacila}`
    // Racuni, ustvarjeni pred preletom 324, imajo pri checkoutu kljuc cs_ -
    // preverimo oba, da ponovno poslan star dogodek ne ustvari dvojnika.
    const kandidati = Array.from(new Set([externalRef, `stripe-${obj.id}`]))
    const { data: obstojeciRacuni } = await supabase
      .from('issued_invoices')
      .select('id')
      .eq('org_id', orgId)
      .in('external_reference', kandidati)
      .limit(1)
    const existing = (obstojeciRacuni || [])[0] ?? null

    if (existing) {
      await zapisiLog(supabase, {
        org_id: orgId,
        external_id: obj.id ?? null,
        invoice_id: existing.id,
        status: 'skipped',
        payload: { reason: 'invoice_already_exists', event_type: event.type, event_id: event.id },
      })
      return NextResponse.json({ message: 'Račun že obstaja', invoiceId: existing.id }, { status: 200 })
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single()

    if (!org) {
      await zapisiLog(supabase, {
        org_id: orgId,
        external_id: obj.id ?? null,
        status: 'failed',
        payload: { reason: 'org_not_found', event_type: event.type, event_id: event.id },
      })
      return NextResponse.json({ error: 'Org ni najdena' }, { status: 404 })
    }

    // Znesek je v Stripe vedno v najmanjši enoti valute (centi).
    // PRELET 320: glej izracunajZnesek() - pri racunu je merodajen `total`.
    const { centi: znesekCenti, opomba: znesekOpomba } = izracunajZnesek(obj)
    const amountTotal = znesekCenti / 100
    if (amountTotal <= 0) {
      await zapisiLog(supabase, {
        org_id: orgId,
        external_id: obj.id ?? null,
        status: 'skipped',
        payload: {
          reason: 'amount_zero_or_negative',
          event_type: event.type,
          event_id: event.id,
          // za diagnostiko: vsa znesek-polja, kot jih je poslal Stripe
          total: obj.total ?? null,
          amount_paid: obj.amount_paid ?? null,
          amount_due: obj.amount_due ?? null,
          amount_total: obj.amount_total ?? null,
          paid_out_of_band: obj.paid_out_of_band ?? null,
          billing_reason: obj.billing_reason ?? null,
        },
      })
      return NextResponse.json({ message: 'Znesek 0 — preskočeno' }, { status: 200 })
    }

    const amountNet = amountTotal / (org.vat_registered ? 1.22 : 1)
    const vatAmount = org.vat_registered ? amountTotal - amountNet : 0

    // Stranka — Stripe checkout session ima customer_details, invoice ima customer_email
    // PRELET 324: samostojno placilo (payment_intent) ima podatke o kupcu v
    // receipt_email in v podatkih bremenitve (charges), ne v customer_details.
    const bremenitev = obj.charges?.data?.[0]?.billing_details ?? {}
    const customerEmail = obj.customer_details?.email ?? obj.customer_email ?? obj.receipt_email ?? bremenitev.email ?? null
    const customerName = obj.customer_details?.name ?? obj.customer_name ?? bremenitev.name ?? obj.shipping?.name ?? customerEmail ?? 'Stranka iz Stripe'

    // PRELET 320: Stripe racun (invoice) ima opis prodaje v postavkah
    // (lines), ne v `description` - prej je na racunu pisalo samo
    // "Stripe plačilo #in_...". Zdaj vzamemo opise postavk (npr. "Masterclass").
    const opisPostavk = Array.isArray(obj.lines?.data)
      ? obj.lines.data.map((l: any) => l?.description).filter(Boolean).join(', ')
      : ''
    const description = (obj.description || opisPostavk || `Stripe plačilo #${obj.id}`).slice(0, 300)

    const lineItems = [{
      description,
      quantity: 1,
      unit_price: Math.round(amountNet * 100) / 100,
      amount_net: Math.round(amountNet * 100) / 100,
      vat_rate: org.vat_registered ? 22 : 0,
      vat_amount: Math.round(vatAmount * 100) / 100,
    }]

    const invoiceNumber = await generateInvoiceNumber(supabase, orgId)
    const issueDate = lokalniDatum()

    // PRELET 320: dejanski trenutek placila (ne trenutek obdelave). Pomembno,
    // ko se zamujen dogodek v Stripe rocno ponovno poslje ("Resend") - racun
    // se izda danes, datum opravljene storitve in placila pa ostaneta pravilna.
    // PRELET 324: pri racunu je trenutek placila status_transitions.paid_at;
    // pri checkoutu/placilu je to trenutek dogodka (obj.created je trenutek
    // ZACETKA placila - pri 3-D Secure lahko minut prej ali celo drug dan).
    const placanoSek = Number(obj.status_transitions?.paid_at ?? event.created ?? obj.created ?? 0)
    const placanoOb = placanoSek > 0 ? new Date(placanoSek * 1000) : new Date()
    const datumPlacila = lokalniDatum(placanoOb)

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
        service_date_from: datumPlacila,
        service_date_to: datumPlacila,
        line_items: lineItems,
        amount_net: Math.round(amountNet * 100) / 100,
        vat_amount: Math.round(vatAmount * 100) / 100,
        amount_total: Math.round(amountTotal * 100) / 100,
        status: 'paid',
        paid_at: placanoOb.toISOString(),
        paid_amount: amountTotal,
        notes: `Stripe plačilo — ${event.type} (${obj.id}).${znesekOpomba}`,
        external_reference: externalRef,
      })
      .select('id')
      .single()

    // PRELET 320: ce Stripe isti dogodek poslje dvakrat hkrati (ponovni
    // poskus med se tekoco obdelavo), sta prej obe obdelavi presli preverbo
    // "ze obstaja" in nastala sta DVA racuna. Unikatni indeks iz migracije
    // 159 drugi vpis zavrne (23505) - to ni napaka, ampak pravilen dvojnik.
    if (invErr?.code === '23505') {
      const { data: obstojeci } = await supabase
        .from('issued_invoices')
        .select('id')
        .eq('org_id', orgId)
        .eq('external_reference', externalRef)
        .maybeSingle()
      await zapisiLog(supabase, {
        org_id: orgId,
        external_id: obj.id ?? null,
        invoice_id: obstojeci?.id ?? null,
        status: 'skipped',
        payload: { reason: 'invoice_already_exists_concurrent', event_type: event.type, event_id: event.id },
      })
      return NextResponse.json({ message: 'Račun že obstaja', invoiceId: obstojeci?.id ?? null }, { status: 200 })
    }

    if (invErr || !invoice) {
      throw new Error(`Napaka pri ustvarjanju računa: ${invErr?.message}`)
    }

    // POPRAVLJENO (16.8.2026): prej brez preverbe napake - racun je nastal,
    // vnos v knjigo prihodkov pa ne. Ker webhook vrne uspeh, Stripe dogodka
    // NE bi ponovil, zato bi prihodek trajno manjkal v davcni evidenci, brez
    // sledi. Zdaj se zabelezi v integration_logs za rocni pregled.
    const { error: kpoErr } = await supabase.from('kpo_entries').insert({
      org_id: orgId,
      entry_date: issueDate,
      description: `Stripe — ${customerName}`,
      entry_type: 'income',
      income: amountNet,
      vat_out: vatAmount,
      invoice_id: invoice.id,
      category: 'spletna_prodaja',
      notes: `Avtomatski vnos iz Stripe`,
    })
    if (kpoErr) {
      console.error('Stripe webhook: racun', invoiceNumber, 'je nastal, vnos v KPO knjigo pa NI uspel:', kpoErr)
      await zapisiLog(supabase, {
        org_id: orgId,
        external_id: obj.id ?? null,
        invoice_id: invoice.id,
        status: 'failed',
        payload: {
          error: 'kpo_entry_failed',
          message: kpoErr.message,
          invoice_number: invoiceNumber,
          invoice_id: invoice.id,
          amount: amountTotal,
        },
      })
    }

    // ────────────────────────────────────────────────────────────────
    // FURS davcno potrjevanje (dodano 21.7.2026) - Stripe placilo se po
    // ZDavPR steje kot gotovinsko poslovanje (placilo preko posrednika,
    // ne neposredno nakazilo na TRR), zato MORA biti davcno potrjeno.
    //
    // KLJUCNO: ce FURS potrditev spodleti (timeout/napaka/ni certifikata/
    // ni Pro paketa), webhook NE sme vrniti napake - Stripe bi ga potem
    // agresivno retry-jal, kar bi le podvajalo neuspesne poskuse (racun
    // ze obstaja zaradi external_reference dedup zgoraj, a FURS klic bi
    // se vseeno ponavljal v neskoncnost). Napaka se namesto tega zabelezi
    // v furs_log (znotraj confirmIssuedInvoiceWithFurs) za rocno/kasnejso
    // dosaditev - enak vzorec kot POS zvoncek za nepotrjene racune.
    //
    // OPOMBA: fiskalizacija je trenutno vezana na Pro paket (isPro check
    // v api/furs/confirm/route.ts) - TU te omejitve namenoma NI, ker gre
    // za avtomatski webhook brez uporabniske seje. Ce org ni Pro in nima
    // certifikata/prostora nastavljenega, confirmIssuedInvoiceWithFurs
    // preprosto vrne { success:false, error:'...' } in se zabelezi v log,
    // racun pa ostane neizpodbitno ustvarjen (pravilno stanje za placnika).
    let fursResult: Awaited<ReturnType<typeof confirmIssuedInvoiceWithFurs>> | null = null
    try {
      fursResult = await confirmIssuedInvoiceWithFurs(supabase, orgId, invoice.id, 'card')
      if (!fursResult.success) {
        console.error('FURS fiskalizacija Stripe racuna ni uspela (zabelezeno v furs_log):', invoice.id, fursResult.error)
      }
    } catch (fursErr: any) {
      console.error('FURS fiskalizacija Stripe racuna - nepricakovana napaka:', invoice.id, fursErr.message)
    }

    // ────────────────────────────────────────────────────────────────
    // PDF racun + e-mail stranki (dodano 21.7.2026), po vzoru obrokov
    // (lib/installment-invoice.ts). Ovito v try/catch - napaka pri
    // generiranju/posiljanju maila NIKOLI ne sme podreti webhooka, racun
    // je ze ustvarjen in (poskusno) fiskaliziran ne glede na to.
    const finalInvoiceNumber = (fursResult?.success && fursResult.invoiceNumber) ? fursResult.invoiceNumber : invoiceNumber
    if (customerEmail) {
      try {
        const invoiceForPdf = {
          invoice_number: finalInvoiceNumber,
          invoice_type: 'invoice',
          client_name: customerName,
          client_email: customerEmail,
          issue_date: issueDate,
          due_date: issueDate,
          line_items: lineItems,
          amount_net: Math.round(amountNet * 100) / 100,
          vat_amount: Math.round(vatAmount * 100) / 100,
          amount_total: Math.round(amountTotal * 100) / 100,
          status: 'paid',
          paid_at: placanoOb.toISOString(),
          zoi: fursResult?.zoi ?? null,
          eor: fursResult?.eor ?? null,
          organizations: org,
        }
        const qrDataUrl = await generateUpnQr(invoiceForPdf, org)
        // FURS verifikacijski QR - samo ce je racun uspesno fiskaliziran
        let fursQrDataUrl: string | undefined
        if (fursResult?.success && fursResult.zoi) {
          try {
            fursQrDataUrl = await generateFursQr(fursResult.zoi, new Date(issueDate))
          } catch (qrErr: any) {
            console.error('FURS QR generiranje ni uspelo (racun bo poslan brez QR):', qrErr.message)
          }
        }
        const pdfElement = InvoicePDF({ invoice: invoiceForPdf, org, qrDataUrl, fursQrDataUrl })
        const pdfBuffer = await renderToBuffer(pdfElement as any)
        const emailHtml = buildInvoiceEmailHtml({
          orgName: org.name,
          invoiceNumber: finalInvoiceNumber,
          issueDate,
          amount: Number(amountTotal),
          dueDate: issueDate,
          customMessage: `Vaše Stripe plačilo je bilo uspešno zaključeno. V prilogi je račun.`,
          iban: org.iban ?? null,
          reference: null,
        })
        const { error: resendError } = await resend.emails.send({
          from: posiljateljZa(org.name),  // PRELET 277: v imenu podjetja
          to: [customerEmail],
          subject: `Račun ${finalInvoiceNumber}`,
          html: emailHtml,
          attachments: [{ filename: `racun-${finalInvoiceNumber}.pdf`, content: pdfBuffer }],
        } as any)
        if (resendError) {
          console.error('Napaka pri posiljanju e-maila za Stripe racun:', invoice.id, resendError.message)
        } else {
          await supabase.from('issued_invoices').update({ last_email_sent_at: new Date().toISOString() }).eq('id', invoice.id)
        }
      } catch (emailErr: any) {
        console.error('Nepricakovana napaka pri PDF/e-mailu za Stripe racun:', invoice.id, emailErr.message)
      }
    } else {
      console.warn('Stripe placilo brez e-maila stranke - racun ni bil poslan po posti:', invoice.id)
    }

    await zapisiLog(supabase, {
      org_id: orgId,
      external_id: obj.id,
      invoice_id: invoice.id,
      status: 'success',
      payload: { event_type: event.type, event_id: event.id, amount_total: amountTotal },
    })

    return NextResponse.json({
      success: true,
      invoiceId: invoice.id,
      invoiceNumber,
      message: `Račun ${invoiceNumber} ustvarjen za Stripe plačilo ${obj.id}`,
      fursConfirmed: fursResult?.success ?? false,
      fursError: fursResult?.success ? undefined : fursResult?.error,
    })

  } catch (e: any) {
    console.error('Stripe integration webhook error:', e)
    // DODANO (30.7.2026): beleži splošno napako - prej se je obdelava
    // lahko podrla brez sledi v /integracije ("zakaj se ni poknjižilo").
    // orgId/supabase sta zdaj dosegljiva tudi tu (dvignjena pred try).
    if (orgId && supabase) {
      await zapisiLog(supabase, {
        org_id: orgId,
        status: 'failed',
        payload: { error: String(e?.message || e) },
      })
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
