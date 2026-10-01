/**
 * PRELET 357: ZAKLJUCEK PLACILA S STRIPE V BLAGAJNI.
 * ═══════════════════════════════════════════════════
 *
 * Kdo zakljuci racun: STREZNIK, ne blagajna. Webhook (ali preverba stanja iz
 * blagajne, ce webhook zamudi) poklice zakljuciPosPlacilo(). Tako racun ne
 * ostane odprt, ce prodajalec medtem zapre blagajno ali zaklene telefon -
 * stranka je placala, racun mora nastati.
 *
 * VRSTNI RED (FURS nikoli pred potrjenim placilom):
 *   1. cakanje -> placano    (atomarno; drugi klic ne naredi nicesar)
 *   2. zaklep zakljucka      (atomarno; vzporeden webhook pocaka)
 *   3. zapis placila         (pay_order, nacin 'card'; najvec enkrat)
 *   4. davcna potrditev      (obvezno; ob neuspehu ostane racun s stevilko
 *                             in ZOI, brez EOR -> zvonec v blagajni ga kaze,
 *                             "Poslji v potrditev" ga prijavi naknadno)
 *   5. konec                 (zakljuceno_ob + rezultat za prikaz v blagajni)
 *
 * Orkestracija je locena od baze (vmesnik PosShramba), da jo lahko testiramo:
 * podvojen webhook NE sme zakljuciti racuna dvakrat.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { confirmWithFurs, extractFromP12, type FursConfig, type FursInvoiceData } from '@/lib/furs'
import { getFursCertificate } from '@/lib/furs-cert'
import { centiNarocila, stripeConnect } from '@/lib/stripe-connect'

export type PlaciloVrstica = {
  id: string
  business_id: string
  org_id: string
  staff_id: string | null
  order_id: string
  premise_id: string | null
  znesek_centi: number
  status: 'cakanje' | 'placano' | 'poteklo' | 'preklicano' | 'vrnjeno'
  payment_intent_id: string | null
  payment_id: string | null
  zakljuceno_ob: string | null
  napaka: string | null
  rezultat: any
}

export type FursIzid = {
  success: boolean
  zoi: string | null
  eor: string | null
  invoiceNumber: string | null
  issuedAt: string | null
  napaka: string | null
}

export interface PosShramba {
  /** cakanje|poteklo -> placano. Vrne true, ce je TA klic spremenil stanje. */
  oznaciPlacano(id: string, paymentIntentId: string | null): Promise<boolean>
  /** Zaklene zakljucek (vzporedni klici). Vrne vrstico ali null, ce je zaklenjen/koncan. */
  zakleni(id: string): Promise<PlaciloVrstica | null>
  preberi(id: string): Promise<PlaciloVrstica | null>
  /** Zapise placilo narocila (pay_order). Vrne id zapisa placila in cas placila. */
  placajNarocilo(p: PlaciloVrstica): Promise<{ paymentId: string; paidAt: string }>
  /** Zapomni si zapis placila TAKOJ - ponovni poskus ga ne sme podvojiti. */
  shraniPaymentId(id: string, paymentId: string): Promise<void>
  /** Cas placila za ze zapisano placilo. */
  casPlacila(paymentId: string): Promise<string | null>
  potrdiFurs(p: PlaciloVrstica, paymentId: string, paidAt: string): Promise<FursIzid>
  koncaj(id: string, rezultat: FursIzid): Promise<void>
  sprosti(id: string, napaka: string): Promise<void>
  /**
   * PRELET 366 (H3): placilo, ki ga ni mogoce zakljuciti (preklicana vrstica,
   * spremenjen ali zaprt racun), se vrne stranki prek Stripe (idempotentno po
   * PaymentIntent) - stanje 'vrnjeno', napaka vidna v blagajni.
   */
  vrniDenar(p: PlaciloVrstica, paymentIntentId: string | null, razlog: string): Promise<{ refundId: string | null; napaka: string | null }>
}

/** Racun v blagajni se je med placilom spremenil ali zaprl - placila ni mogoce zakljuciti. */
export class NarociloNiZakljucljivo extends Error {}

export type IzidZakljucka =
  | { stanje: 'zakljuceno'; rezultat: FursIzid; ponovno: boolean }
  | { stanje: 'v_teku' }
  | { stanje: 'ni_placano'; status: string }
  | { stanje: 'vrnjeno'; napaka: string }
  | { stanje: 'napaka'; napaka: string }

export async function zakljuciPosPlacilo(
  s: PosShramba,
  placiloId: string,
  paymentIntentId: string | null = null,
): Promise<IzidZakljucka> {
  await s.oznaciPlacano(placiloId, paymentIntentId)

  // PRELET 366 (H3b): stranka je placala sejo vrstice, ki je bila medtem
  // preklicana (npr. expire ni uspel) - racuna ni, denar gre nazaj.
  const prej = await s.preberi(placiloId)
  if (prej && prej.status === 'preklicano' && !prej.zakljuceno_ob) {
    const razlog = 'Stranka je plačala že preklicano plačilo — denar je bil samodejno vrnjen, račun ni zaključen.'
    const r = await s.vrniDenar(prej, paymentIntentId ?? prej.payment_intent_id, razlog)
    return { stanje: 'vrnjeno', napaka: r.napaka || razlog }
  }

  const zaklenjena = await s.zakleni(placiloId)
  if (!zaklenjena) {
    const zdaj = await s.preberi(placiloId)
    if (!zdaj) return { stanje: 'napaka', napaka: 'Plačilo ne obstaja' }
    if (zdaj.status === 'vrnjeno' && zdaj.zakljuceno_ob) return { stanje: 'vrnjeno', napaka: zdaj.napaka || 'Plačilo je vrnjeno.' }
    if (zdaj.zakljuceno_ob) return { stanje: 'zakljuceno', rezultat: zdaj.rezultat, ponovno: true }
    if (zdaj.status !== 'placano' && zdaj.status !== 'vrnjeno') return { stanje: 'ni_placano', status: zdaj.status }
    return { stanje: 'v_teku' }
  }
  if (zaklenjena.status !== 'placano') {
    await s.sprosti(placiloId, zaklenjena.napaka || '')
    return { stanje: 'ni_placano', status: zaklenjena.status }
  }

  try {
    let paymentId = zaklenjena.payment_id
    let paidAt: string | null = null
    if (!paymentId) {
      const r = await s.placajNarocilo(zaklenjena)
      paymentId = r.paymentId
      paidAt = r.paidAt
      await s.shraniPaymentId(placiloId, paymentId)
    } else {
      paidAt = await s.casPlacila(paymentId)
    }
    const furs = await s.potrdiFurs(zaklenjena, paymentId, paidAt || new Date().toISOString())
    await s.koncaj(placiloId, furs)
    return { stanje: 'zakljuceno', rezultat: furs, ponovno: false }
  } catch (e: any) {
    const napaka = e?.message || String(e)
    if (e instanceof NarociloNiZakljucljivo) {
      // PRELET 366 (H3a): racun spremenjen/zaprt med placilom - samodejno vracilo.
      const r = await s.vrniDenar(zaklenjena, paymentIntentId ?? zaklenjena.payment_intent_id, napaka + ' Denar je bil samodejno vrnjen stranki.')
      return { stanje: 'vrnjeno', napaka: r.napaka || napaka }
    }
    await s.sprosti(placiloId, napaka)
    return { stanje: 'napaka', napaka }
  }
}

// ─────────────────────────────────────────────────────────────────
// SUPABASE IZVEDBA (service_role)
// ─────────────────────────────────────────────────────────────────

const STOLPCI = 'id, business_id, org_id, staff_id, order_id, premise_id, znesek_centi, status, payment_intent_id, payment_id, zakljuceno_ob, napaka, rezultat'

export function supabaseShramba(admin: SupabaseClient): PosShramba {
  return {
    async oznaciPlacano(id, pi) {
      const { data } = await admin.from('pos_placila_stripe')
        .update({ status: 'placano', placano_ob: new Date().toISOString(), ...(pi ? { payment_intent_id: pi } : {}) })
        .eq('id', id).in('status', ['cakanje', 'poteklo'])
        .select('id')
      return !!data && data.length > 0
    },
    async zakleni(id) {
      const meja = new Date(Date.now() - 2 * 60 * 1000).toISOString()
      const { data } = await admin.from('pos_placila_stripe')
        .update({ zakljucevanje_od: new Date().toISOString() })
        .eq('id', id).is('zakljuceno_ob', null)
        .or(`zakljucevanje_od.is.null,zakljucevanje_od.lt.${meja}`)
        .select(STOLPCI)
      return (data && data[0]) as PlaciloVrstica || null
    },
    async preberi(id) {
      const { data } = await admin.from('pos_placila_stripe').select(STOLPCI).eq('id', id).maybeSingle()
      return (data as PlaciloVrstica) || null
    },
    async placajNarocilo(p) {
      const { data: order } = await admin.from('orders').select('id, status, total').eq('id', p.order_id).maybeSingle()
      if (!order) throw new NarociloNiZakljucljivo('Račun v blagajni ne obstaja več.')
      if (order.status === 'paid' || order.status === 'voided') {
        throw new NarociloNiZakljucljivo('Račun je bil medtem že zaključen drugače.')
      }
      const znesek = p.znesek_centi / 100
      // PRELET 365 (H2): primerjava v celih centih, enakost.
      if (centiNarocila(order.total) !== p.znesek_centi) {
        throw new NarociloNiZakljucljivo(`Račun se je med plačilom spremenil (${Number(order.total).toFixed(2)} €, plačano ${znesek.toFixed(2)} €).`)
      }
      const { data, error } = await admin.rpc('pay_order', {
        p_order_id: p.order_id,
        p_method: 'card',
        p_amount: znesek,
        p_received: null,
        p_furs: true,
        p_cashier_id: p.staff_id,
      })
      if (error) throw new Error('Plačila ni bilo mogoče zapisati: ' + error.message)
      const paymentId = (data as any)?.payment_id
      const { data: pay } = await admin.from('payments').select('paid_at').eq('id', paymentId).maybeSingle()
      return { paymentId, paidAt: pay?.paid_at || new Date().toISOString() }
    },
    async shraniPaymentId(id, paymentId) {
      const { error } = await admin.from('pos_placila_stripe').update({ payment_id: paymentId }).eq('id', id)
      if (error) throw new Error('Zapisa plačila ni bilo mogoče povezati: ' + error.message)
    },
    async casPlacila(paymentId) {
      const { data } = await admin.from('payments').select('paid_at').eq('id', paymentId).maybeSingle()
      return data?.paid_at ?? null
    },
    async potrdiFurs(p, paymentId, paidAt) {
      return potrdiNarociloPriFurs(admin, {
        orgId: p.org_id, orderId: p.order_id, premiseUuid: p.premise_id, paymentId, issuedAt: paidAt,
      })
    },
    async koncaj(id, rezultat) {
      await admin.from('pos_placila_stripe').update({
        zakljuceno_ob: new Date().toISOString(),
        zakljucevanje_od: null,
        napaka: rezultat.success ? null : rezultat.napaka,
        rezultat,
      }).eq('id', id)
    },
    async sprosti(id, napaka) {
      await admin.from('pos_placila_stripe').update({ zakljucevanje_od: null, napaka: napaka || null }).eq('id', id)
    },
    async vrniDenar(p, pi, razlog) {
      let refundId: string | null = null
      let napaka: string | null = null
      try {
        if (!pi) throw new Error('plačilu manjka oznaka pri Stripe')
        const { data: org } = await admin.from('organizations').select('stripe_account_id').eq('id', p.org_id).single()
        if (!org?.stripe_account_id) throw new Error('Stripe ni več povezan')
        const r = await stripeConnect().refunds.create(
          { payment_intent: pi, reason: 'requested_by_customer', metadata: { vrsta: 'pos', placilo_id: p.id, order_id: p.order_id, samodejno: '1' } },
          { stripeAccount: org.stripe_account_id, idempotencyKey: `pos-vracilo-pi-${pi}` },
        )
        refundId = r.id
      } catch (e: any) {
        napaka = `Plačila ni bilo mogoče zaključiti in samodejno vračilo ni uspelo (${e?.message || e}) — vrnite denar v blagajni (gumb »Vrni denar«) ali v Stripe.`
      }
      await admin.from('pos_placila_stripe').update({
        ...(refundId ? { status: 'vrnjeno', refund_id: refundId, vrnjeno_ob: new Date().toISOString(), zakljuceno_ob: new Date().toISOString() } : { status: 'placano' }),
        ...(pi ? { payment_intent_id: pi } : {}),
        zakljucevanje_od: null,
        napaka: napaka || razlog,
      }).eq('id', p.id)
      return { refundId, napaka }
    },
  }
}

// ─────────────────────────────────────────────────────────────────
// DAVCNA POTRDITEV NAROCILA BLAGAJNE NA STREZNIKU
// ─────────────────────────────────────────────────────────────────
//
// Enaki koraki kot app/api/furs/invoice (spletna pot, brez dela brez
// povezave), le da tece brez uporabniske seje in nacin placila je KARTICA.
// Obstojece poti NE spreminjamo - blagajna jo se naprej klice za gotovino in
// terminal.
//
// Razlika ob NEUSPEHU: stevilka in ZOI se ZAPISETA na racun (orders.
// invoice_number, payments.furs_zoi). Racun je stranka ze placala, zato mora
// obstajati; brez EOR ga zvonec v blagajni kaze kot nepotrjenega in gumb
// "Poslji v potrditev" (api/furs/resubmit) ga prijavi naknadno z ISTO
// stevilko, ZOI in casom izdaje (= cas placila).

export async function potrdiNarociloPriFurs(
  admin: SupabaseClient,
  a: { orgId: string; orderId: string; premiseUuid: string | null; paymentId: string; issuedAt: string },
): Promise<FursIzid> {
  const { data: order } = await admin.from('orders')
    .select('*, order_lines(total, qty, unit_price, vat_rate, voided)')
    .eq('id', a.orderId).single()
  if (!order) return { success: false, zoi: null, eor: null, invoiceNumber: null, issuedAt: null, napaka: 'Račun ni najden' }

  const { data: pay } = await admin.from('payments').select('furs_zoi, furs_eor').eq('id', a.paymentId).maybeSingle()
  if (pay?.furs_eor) {
    return { success: true, zoi: pay.furs_zoi, eor: pay.furs_eor, invoiceNumber: order.invoice_number, issuedAt: a.issuedAt, napaka: null }
  }
  // Stevilka je ze dodeljena (prejsnji poskus je dobil ZOI, FURS pa ni
  // odgovoril) - NE dodeljujemo nove; racun caka na naknadno potrditev.
  if (order.invoice_number) {
    return { success: false, zoi: pay?.furs_zoi ?? null, eor: null, invoiceNumber: order.invoice_number, issuedAt: a.issuedAt, napaka: 'Račun čaka na naknadno davčno potrditev.' }
  }

  const { data: org } = await admin.from('organizations').select('*').eq('id', a.orgId).single()
  if (!org?.tax_number) return { success: false, zoi: null, eor: null, invoiceNumber: null, issuedAt: null, napaka: 'Davčna številka ni nastavljena.' }

  // Predstavitev (prelet 356): enako kot api/furs/invoice - nic ne gre FURS-u.
  if (org.furs_demo_mode) {
    const { data: seq, error: seqErr } = await admin.rpc('next_invoice_number', {
      p_business_id: order.business_id, p_premise_id: null, p_device_id: null, p_leto: null,
    })
    if (seqErr) return { success: false, zoi: null, eor: null, invoiceNumber: null, issuedAt: null, napaka: 'Številke računa ni bilo mogoče dodeliti: ' + seqErr.message }
    const stevilka = `DEMO1-BLAG1-${seq}`
    const demoKoda = `DEMO-${String(a.orderId).replace(/-/g, '').slice(0, 12).toUpperCase()}`
    await admin.from('pos_invoice_numbers').insert({
      business_id: order.business_id, sequence_number: seq, invoice_number: stevilka,
      order_id: order.id, status: 'issued', note: 'Predstavitveni način - ni prijavljen FURS (Stripe)',
    })
    await admin.from('orders').update({ invoice_number: stevilka }).eq('id', a.orderId)
    await admin.from('payments').update({ furs_zoi: demoKoda, furs_eor: demoKoda, furs_sent_at: new Date().toISOString() }).eq('id', a.paymentId)
    return { success: true, zoi: demoKoda, eor: demoKoda, invoiceNumber: stevilka, issuedAt: a.issuedAt, napaka: null }
  }

  const { cert, isTest } = await getFursCertificate(admin, a.orgId)
  if (!cert) return { success: false, zoi: null, eor: null, invoiceNumber: null, issuedAt: null, napaka: `FURS ${isTest ? 'testni' : 'produkcijski'} certifikat ni naložen.` }

  let pq = admin.from('business_premises').select('*').eq('org_id', a.orgId).eq('is_active', true)
  if (a.premiseUuid) pq = pq.eq('id', a.premiseUuid)
  const { data: premise } = await pq.limit(1).maybeSingle()
  if (!premise) return { success: false, zoi: null, eor: null, invoiceNumber: null, issuedAt: null, napaka: 'Poslovni prostor ni dodan.' }
  const { data: device } = await admin.from('electronic_devices').select('*')
    .eq('premise_id', premise.id).eq('is_active', true).limit(1).maybeSingle()
  const deviceIdCode = device?.device_id ?? 'RACUNKO01'

  const { data: seqData, error: seqError } = await admin.rpc('next_invoice_number', {
    p_business_id: order.business_id, p_premise_id: premise.id, p_device_id: device?.id ?? null, p_leto: null,
  })
  if (seqError) return { success: false, zoi: null, eor: null, invoiceNumber: null, issuedAt: null, napaka: 'Številke računa ni bilo mogoče dodeliti: ' + seqError.message }
  const sequenceNumber = seqData as number
  const invoiceNumberFull = `${premise.premise_id}-${deviceIdCode}-${sequenceNumber}`

  await admin.from('pos_invoice_numbers').insert({
    business_id: order.business_id, sequence_number: sequenceNumber, invoice_number: invoiceNumberFull,
    order_id: order.id, status: 'failed', note: 'Stevilka rezervirana, cakanje na odgovor FURS (Stripe)',
  })

  const amountTotal = Number(order.total)
  const linije = (order.order_lines || []).filter((l: any) => !l.voided)
  let vatBreakdown: { rate: number; net: number; vat: number }[] | undefined
  if (linije.length > 0) {
    const vsota = linije.reduce((s: number, l: any) => s + Number(l.total ?? (Number(l.qty || 0) * Number(l.unit_price || 0))), 0)
    const faktor = vsota > 0 ? amountTotal / vsota : 1
    const poStopnji = new Map<number, number>()
    for (const l of linije) {
      const bruto = Number(l.total ?? (Number(l.qty || 0) * Number(l.unit_price || 0))) * faktor
      const stopnja = Number(l.vat_rate ?? 22)
      poStopnji.set(stopnja, (poStopnji.get(stopnja) || 0) + bruto)
    }
    vatBreakdown = Array.from(poStopnji.entries()).map(([rate, bruto]) => {
      const net = rate > 0 ? bruto / (1 + rate / 100) : bruto
      return { rate, net: Math.round(net * 100) / 100, vat: Math.round((bruto - net) * 100) / 100 }
    }).sort((x, y) => y.rate - x.rate)
  }

  const fursData: FursInvoiceData = {
    invoiceNumber: sequenceNumber,
    issueDateTime: new Date(a.issuedAt),
    amountTotal,
    vatBreakdown,
    paymentType: 'card',
    invoiceType: 'invoice',
    customerVatNumber: order.buyer_tax_number || null,
  } as FursInvoiceData

  const p12 = Buffer.from(cert.certificate_data, 'base64')
  const { privateKeyPem, certificatePem } = extractFromP12(p12, cert.certificate_password ?? '')
  const config: FursConfig = {
    taxNumber: cert.tax_number || org.tax_number,
    premiseId: premise.premise_id,
    deviceId: deviceIdCode,
    privateKeyPem,
    certificatePem,
    isTest,
  }

  const { data: log } = await admin.from('furs_log').insert({
    org_id: a.orgId, invoice_id: null, status: 'pending',
    raw_request: { source: 'pos_stripe', orderId: a.orderId, invoiceNumber: sequenceNumber, invoiceNumberFull, premiseId: premise.premise_id, deviceId: deviceIdCode, paymentType: 'card' },
  }).select('id').single()

  let result: Awaited<ReturnType<typeof confirmWithFurs>>
  try {
    result = await confirmWithFurs(config, fursData)
  } catch (e: any) {
    result = { success: false, zoi: null, eor: null, errorMessage: e?.message || 'Povezava s FURS ni uspela', responseTime: null }
  }

  await admin.from('furs_log').update({
    zoi: result.zoi, eor: result.eor,
    status: result.success ? 'success' : 'error',
    error_message: result.errorMessage,
    response_at: result.responseTime?.toISOString(),
  }).eq('id', log?.id)

  // Stevilka in ZOI gresta na racun VEDNO - stranka je placala, racun obstaja.
  await admin.from('orders').update({ invoice_number: invoiceNumberFull }).eq('id', a.orderId)
  await admin.from('payments').update({
    furs_zoi: result.zoi,
    furs_eor: result.success ? result.eor : null,
    furs_sent_at: new Date().toISOString(),
  }).eq('id', a.paymentId)

  if (result.success && result.zoi && result.eor) {
    await admin.from('pos_invoice_numbers').update({ status: 'issued', note: null })
      .eq('business_id', order.business_id).eq('sequence_number', sequenceNumber).eq('invoice_number', invoiceNumberFull)
    return { success: true, zoi: result.zoi, eor: result.eor, invoiceNumber: invoiceNumberFull, issuedAt: a.issuedAt, napaka: null }
  }
  await admin.from('pos_invoice_numbers').update({
    status: result.zoi ? 'issued' : 'failed',
    note: 'Plačano s Stripe, FURS ni potrdil: ' + (result.errorMessage || 'neznana napaka') + ' - naknadna potrditev',
  }).eq('business_id', order.business_id).eq('sequence_number', sequenceNumber).eq('invoice_number', invoiceNumberFull)
  return {
    success: false, zoi: result.zoi, eor: null, invoiceNumber: invoiceNumberFull, issuedAt: a.issuedAt,
    napaka: result.errorMessage || 'FURS ni potrdil računa.',
  }
}

/**
 * PRELET 366 (H3b): zapre Checkout sejo in pove, ali je Stripe to POTRDIL.
 *  - 'zaprta'  : seje ni (ali je potekla/zaprta) - placila po njej ne bo,
 *  - 'placano' : stranka je ze placala - placilo je treba zakljuciti,
 *  - 'napaka'  : stanja ni mogoce potrditi - vrstice NE smemo preklicati.
 */
export async function zapriSejo(stripe: any, sessionId: string | null, stripeAccount: string): Promise<
  { stanje: 'zaprta' } | { stanje: 'placano'; paymentIntentId: string | null } | { stanje: 'napaka'; napaka: string }
> {
  if (!sessionId) return { stanje: 'zaprta' }
  try {
    await stripe.checkout.sessions.expire(sessionId, {}, { stripeAccount })
    return { stanje: 'zaprta' }
  } catch (e: any) {
    const sess = await stripe.checkout.sessions.retrieve(sessionId, {}, { stripeAccount }).catch(() => null)
    if (sess?.payment_status === 'paid') {
      const pi = typeof sess.payment_intent === 'string' ? sess.payment_intent : sess.payment_intent?.id || null
      return { stanje: 'placano', paymentIntentId: pi }
    }
    if (sess?.status === 'expired') return { stanje: 'zaprta' }
    return { stanje: 'napaka', napaka: e?.message || String(e) }
  }
}

// ─────────────────────────────────────────────────────────────────
// PRELET 367 (M6): KDO SME VRNITI DENAR PREK STRIPE
// ─────────────────────────────────────────────────────────────────

/**
 * Vracilo prek Stripe je dovoljeno:
 *  - lastniku/administratorju podjetja ALI osebju blagajne s pravico
 *    "Storno racuna" (voidReceipt) oz. "Vracilo" (refund), IN
 *  - za ZAKLJUCEN racun samo, ce je racun ze storniran (orders.status =
 *    'voided') - denar ne gre nazaj za veljaven, davcno potrjen racun;
 *  - za placilo, ki ga ni bilo mogoce zakljuciti (racuna ni), brez storna.
 */
export function vraciloDovoljeno(o: {
  lastnik: boolean
  dovoljenjaOsebja: Record<string, any> | null
  zakljuceno: boolean
  statusRacuna: string | null
}): { ok: true } | { ok: false; razlog: string; status: number } {
  const imaPravico = o.lastnik || !!(o.dovoljenjaOsebja?.voidReceipt || o.dovoljenjaOsebja?.refund)
  if (!imaPravico) return { ok: false, status: 403, razlog: 'Vračilo lahko izvede lastnik ali osebje s pravico »Storno računa«.' }
  if (o.zakljuceno && o.statusRacuna !== 'voided') {
    return { ok: false, status: 409, razlog: 'Račun ni storniran. Najprej ga stornirajte (storno pri FURS), nato vrnite denar.' }
  }
  return { ok: true }
}

/** Dovoljenja osebja (staff) blagajne podjetja - enako kot pin_login. */
export async function dovoljenjaOsebja(admin: SupabaseClient, orgId: string, staffId: string | null | undefined) {
  if (!staffId || !/^[0-9a-f-]{36}$/i.test(staffId)) return null
  const { data: org } = await admin.from('organizations').select('pos_business_id').eq('id', orgId).maybeSingle()
  if (!org?.pos_business_id) return null
  const { data: st } = await admin.from('staff').select('role, permissions, active')
    .eq('id', staffId).eq('business_id', org.pos_business_id).maybeSingle()
  if (!st || st.active === false) return null
  if (st.permissions) return st.permissions as Record<string, any>
  const { data } = await admin.rpc('role_default_permissions', { p_role: st.role })
  return (data as Record<string, any>) || null
}

// ─────────────────────────────────────────────────────────────────
// PRELET 370 (M1): ODZIV WEBHOOKA IN DOKONCANJE V CRONU
// ─────────────────────────────────────────────────────────────────

/**
 * HTTP status webhooka za izid zakljucka. 'v_teku' (vzporedna obdelava drzi
 * kljucavnico) in 'napaka' vrneta 500 - Stripe dogodek ponovi, ko je
 * zakljucek koncan ali kljucavnica potekla. Prej je 'v_teku' vracal 200 in
 * placilo je ostalo nezakljuceno, ce je prvi obdelovalec padel.
 */
export function statusWebhooka(izid: IzidZakljucka): 200 | 500 {
  return izid.stanje === 'napaka' || izid.stanje === 'v_teku' ? 500 : 200
}

/** Placane, a nezakljucene vrstice, ki jih nihce ne obdeluje (kljucavnica prosta ali potekla). */
export function zaDokoncanje<T extends { status: string; zakljuceno_ob: string | null; zakljucevanje_od?: string | null }>(vrstice: T[], zdaj = Date.now()): T[] {
  const meja = zdaj - 2 * 60_000
  return vrstice.filter(v => v.status === 'placano' && !v.zakljuceno_ob &&
    (!v.zakljucevanje_od || new Date(v.zakljucevanje_od).getTime() < meja))
}
