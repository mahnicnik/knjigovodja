/**
 * PRELET 360: ZAHTEVKI ZA PLACILO NA PORTALU (Stripe, DEL B).
 * ═══════════════════════════════════════════════════════════
 *
 * Uporabnik na portalu proda storitev (npr. osebni trening), stranka placa s
 * kartico prek Stripe - takoj (QR koda na zaslonu) ali kasneje (e-posta s
 * povezavo /placaj/[zeton]). RACUN SE IZDA SELE PO PLACILU. Neplacan
 * zahtevek ni racun: nima stevilke racuna, ni v knjigi prihodkov, ni pri FURS.
 *
 * ZNESEK izracuna STREZNIK iz postavk (izracunajZahtevek) - enaka formula kot
 * obrazec racuna (kolicina × cena × (1 - popust), DDV po stopnji postavke).
 * Brskalnik zneska ne poslje.
 *
 * PO PLACILU (webhook checkout.session.completed ali rezerva - preverba
 * stanja iz portala / strani "Hvala") obdelajPlacanZahtevek():
 *   1. poslan -> placan       (atomarno)
 *   2. zaklep izdaje           (izdajanje_od; vzporeden klic pocaka)
 *   3. racun                   (issued_invoices, naslednja stevilka, placan,
 *                               external_reference 'stripe-zahtevek-<id>' -
 *                               enolicni indeks v bazi: najvec en racun)
 *   4. invoice_id na zahtevek  (TAKOJ - ponovni poskus ne izda drugega)
 *   5. davcna potrditev        (VEDNO, nacin placila kartica; ob neuspehu
 *                               racun ostane brez EOR, zahtevek dobi opozorilo,
 *                               dnevni cron in gumb "Potrdi zdaj" ga potrdita)
 *   6. knjiga prihodkov        (kpo_entries, najvec en vnos na racun)
 *   7. racun stranki po e-posti (najvec enkrat, racun_poslan_ob; SELE ko je
 *                               davcno potrjen - ob potrditvi dobi koncno stevilko)
 *
 * Preklican ali potekel zahtevek racuna NE ustvari. Ce bi stranka kljub temu
 * placala (session, ustvarjen tik pred preklicem), se denar samodejno vrne.
 *
 * Orkestracija je locena od baze (vmesnik ZahtevkiShramba), da jo lahko
 * testiramo: podvojen webhook NE sme izdati dveh racunov.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderToBuffer } from '@react-pdf/renderer'
import { lokalniDatum } from '@/lib/tax-constants'
import { confirmIssuedInvoiceWithFurs } from '@/lib/furs-invoice-confirm'
import { InvoicePDF, generateFursQr } from '@/lib/invoice-pdf'
import { logotipZaEmail } from '@/lib/logotip'
import { placanRacunEmailHtml } from '@/lib/zahtevki-posta'
import { resend, posiljateljZa } from '@/lib/resend'
import { vatExemptionText } from '@/lib/vat-exemptions'
import { stripeConnect } from '@/lib/stripe-connect'

// ─────────────────────────────────────────────────────────────────
// IZRACUN ZNESKA NA STREZNIKU
// ─────────────────────────────────────────────────────────────────

export type PostavkaVhod = {
  description?: unknown
  quantity?: unknown
  unit_price?: unknown
  vat_rate?: unknown
  discount_pct?: unknown
}

export type Postavka = {
  description: string
  quantity: number
  unit_price: number
  vat_rate: number
  discount_pct: number
}

export const DOVOLJENE_STOPNJE = [22, 9.5, 5, 0]
export const NAJMANJ_CENTI_ZAHTEVEK = 50
export const NAJVEC_EUR_ZAHTEVEK = 100_000
export const PRIVZETA_VELJAVNOST_DNI = 14

const r2 = (x: number) => Math.round(x * 100) / 100
const st = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) ? n : NaN
}

export class NeveljavenZahtevek extends Error {}

/**
 * Postavke iz brskalnika -> preverjene postavke + zneski. Nezavezanec za DDV
 * ima vedno 0 %. Vrze NeveljavenZahtevek z razlago za uporabnika.
 */
export function izracunajZahtevek(vhod: PostavkaVhod[] | unknown, o: { zavezanecDdv: boolean }) {
  if (!Array.isArray(vhod) || vhod.length === 0) throw new NeveljavenZahtevek('Dodajte vsaj eno postavko.')
  if (vhod.length > 100) throw new NeveljavenZahtevek('Največ 100 postavk.')
  const postavke: Postavka[] = []
  for (const [i, p] of (vhod as PostavkaVhod[]).entries()) {
    const opis = String(p?.description ?? '').trim().slice(0, 300)
    const kolicina = st(p?.quantity ?? 1)
    const cena = st(p?.unit_price ?? 0)
    const popust = st(p?.discount_pct ?? 0)
    let stopnja = st(p?.vat_rate ?? 0)
    const prazna = !opis && (!cena || cena === 0)
    if (prazna) continue
    if (!opis) throw new NeveljavenZahtevek(`Postavka ${i + 1}: vpišite opis.`)
    if (!Number.isFinite(kolicina) || kolicina <= 0) throw new NeveljavenZahtevek(`Postavka ${i + 1}: količina mora biti večja od 0.`)
    if (!Number.isFinite(cena) || cena < 0) throw new NeveljavenZahtevek(`Postavka ${i + 1}: cena ne sme biti negativna.`)
    if (!Number.isFinite(popust) || popust < 0 || popust > 100) throw new NeveljavenZahtevek(`Postavka ${i + 1}: popust mora biti med 0 in 100 %.`)
    if (!o.zavezanecDdv) stopnja = 0
    if (!DOVOLJENE_STOPNJE.includes(stopnja)) throw new NeveljavenZahtevek(`Postavka ${i + 1}: neveljavna stopnja DDV.`)
    postavke.push({ description: opis, quantity: kolicina, unit_price: r2(cena), vat_rate: stopnja, discount_pct: popust })
  }
  if (postavke.length === 0) throw new NeveljavenZahtevek('Dodajte vsaj eno postavko.')

  // Enako kot obrazec racuna (app/invoices/new) in PDF (lib/invoice-pdf).
  const neto = (p: Postavka) => p.quantity * p.unit_price * (1 - p.discount_pct / 100)
  const znesekNeto = r2(postavke.reduce((s, p) => s + neto(p), 0))
  const ddv = r2(postavke.reduce((s, p) => s + neto(p) * p.vat_rate / 100, 0))
  const skupaj = r2(znesekNeto + ddv)
  const centi = Math.round(skupaj * 100)
  if (centi < NAJMANJ_CENTI_ZAHTEVEK) throw new NeveljavenZahtevek('Najmanjši znesek za plačilo s kartico je 0,50 €.')
  if (skupaj > NAJVEC_EUR_ZAHTEVEK) throw new NeveljavenZahtevek('Znesek je previsok za plačilo s kartico.')
  return { postavke, neto: znesekNeto, ddv, skupaj, centi, imaNicelno: postavke.some(p => p.vat_rate === 0) }
}

/** Nakljucen zeton za javno povezavo /placaj/[zeton] (~190 bitov). */
export function novZeton(): string {
  const bajti = crypto.getRandomValues(new Uint8Array(24))
  return Buffer.from(bajti).toString('base64url')
}

export const jeVeljavenZeton = (z: string) => /^[A-Za-z0-9_-]{20,64}$/.test(z)

export function jeVeljavenEmail(e: string) {
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(e)
}

/** Postavke za Stripe Checkout: ena vrstica z opisom (popusti in DDV so ze v znesku). */
export function postavkeZaStripe(z: { postavke: Postavka[]; znesek: number | string; stevilka?: string | null }, podjetje: string) {
  const centi = Math.round(Number(z.znesek) * 100)
  const fmt = (k: number) => (Number.isInteger(k) ? String(k) : String(k).replace('.', ','))
  const opis = (z.postavke || []).map(p => `${fmt(p.quantity)}× ${p.description}`).join(', ').slice(0, 480)
  return [{
    quantity: 1,
    price_data: {
      currency: 'eur',
      unit_amount: centi,
      product_data: {
        name: `${podjetje || 'Plačilo'}${z.stevilka ? ` — ${z.stevilka}` : ''}`.slice(0, 250),
        ...(opis ? { description: opis } : {}),
      },
    },
  }]
}

/** Stanje za prikaz: poslan zahtevek s pretekim rokom je potekel (tudi pred cronom). */
export function prikazanoStanje(z: { status: string; velja_do: string | null }, zdaj = Date.now()) {
  if (z.status === 'poslan' && z.velja_do && new Date(z.velja_do).getTime() < zdaj) return 'potekel'
  return z.status
}

/** Konec Stripe sessiona: najvec 24 ur (omejitev Stripe), najmanj 30 min, ne cez veljavnost zahtevka. */
export function konecSessiona(veljaDo: string, zdaj = Date.now()) {
  const najvec = zdaj + 24 * 3600_000 - 60_000
  const najmanj = zdaj + 31 * 60_000
  const konec = Math.max(najmanj, Math.min(najvec, new Date(veljaDo).getTime()))
  return { expiresAt: Math.floor(konec / 1000), podaljsajZahtevek: konec > new Date(veljaDo).getTime() }
}

// ─────────────────────────────────────────────────────────────────
// ORKESTRACIJA PO PLACILU (testabilna)
// ─────────────────────────────────────────────────────────────────

export type ZahtevekVrstica = {
  id: string
  org_id: string
  stevilka: string | null
  stranka_ime: string
  stranka_email: string
  stranka_naslov: string | null
  stranka_davcna: string | null
  postavke: Postavka[]
  znesek_neto: number | string
  ddv: number | string
  znesek: number | string
  opomba: string | null
  vat_exemption_code: string | null
  vat_exemption_text: string | null
  service_date: string | null
  service_date_to: string | null
  header_text: string | null
  status: 'poslan' | 'placan' | 'potekel' | 'preklican'
  checkout_session_id: string | null
  payment_intent_id: string | null
  invoice_id: string | null
  placano_ob: string | null
  izdajanje_od: string | null
  racun_poslan_ob: string | null
  napaka: string | null
}

const nepotrjenOpozorilo = (n: string | null) =>
  `Račun ni davčno potrjen: ${n || 'FURS ni odgovoril'}. Potrdi se naknadno (dnevno samodejno ali z gumbom »Potrdi zdaj«); stranki ga pošljemo po potrditvi.`

export type FursRezultat = { success: boolean; napaka: string | null }

export interface ZahtevkiShramba {
  preberi(id: string): Promise<ZahtevekVrstica | null>
  /** poslan -> placan. Vrne true, ce je TA klic spremenil stanje. */
  oznaciPlacan(id: string, o: { sessionId: string; paymentIntentId: string | null }): Promise<boolean>
  /** Zaklene izdajo (izdajanje_od). null = zaklenjeno drugje. */
  zakleni(id: string): Promise<ZahtevekVrstica | null>
  /** Izda racun ali vrne ze izdanega za ta zahtevek (enolicna referenca). */
  izdajRacun(z: ZahtevekVrstica): Promise<{ id: string }>
  shraniRacun(id: string, invoiceId: string): Promise<void>
  vpisiVKnjigo(z: ZahtevekVrstica, invoiceId: string): Promise<void>
  potrdiFurs(z: ZahtevekVrstica, invoiceId: string): Promise<FursRezultat>
  posljiRacun(z: ZahtevekVrstica, invoiceId: string): Promise<void>
  koncaj(id: string, opozorilo: string | null): Promise<void>
  sprosti(id: string, napaka: string | null): Promise<void>
  /** Placilo preklicanega/poteklega zahtevka - denar vrnemo, racuna ni. */
  vrniPlaciloBrezRacuna(z: ZahtevekVrstica, paymentIntentId: string | null, razlog: string): Promise<void>
}

export type IzidZahtevka = {
  stanje: 'izdan' | 'ze' | 'napaka' | 'preskoceno' | 'v_teku'
  napaka?: string
  invoiceId?: string | null
  fursPotrjen?: boolean
}

export async function obdelajPlacanZahtevekZ(
  s: ZahtevkiShramba,
  zahtevekId: string,
  o: { sessionId: string; paymentIntentId: string | null },
): Promise<IzidZahtevka> {
  const z = await s.preberi(zahtevekId)
  if (!z) return { stanje: 'preskoceno', napaka: 'Zahtevek ne obstaja' }
  if (z.invoice_id && z.racun_poslan_ob) return { stanje: 'ze', invoiceId: z.invoice_id }
  if (!z.invoice_id && (z.status === 'preklican' || z.status === 'potekel')) {
    await s.vrniPlaciloBrezRacuna(z, o.paymentIntentId, z.status === 'preklican'
      ? 'Stranka je plačala že preklican zahtevek — denar je bil samodejno vrnjen, račun ni bil izdan.'
      : 'Stranka je plačala potekel zahtevek — denar je bil samodejno vrnjen, račun ni bil izdan.')
    return { stanje: 'preskoceno', napaka: `zahtevek ${z.status}` }
  }

  await s.oznaciPlacan(zahtevekId, o)
  const zak = await s.zakleni(zahtevekId)
  if (!zak) {
    const zdaj = await s.preberi(zahtevekId)
    if (zdaj?.invoice_id && zdaj.racun_poslan_ob) return { stanje: 'ze', invoiceId: zdaj.invoice_id }
    return { stanje: 'v_teku' }
  }
  if (zak.status !== 'placan') {
    await s.sprosti(zahtevekId, zak.napaka)
    return { stanje: 'preskoceno', napaka: `zahtevek ${zak.status}` }
  }
  if (zak.invoice_id && zak.racun_poslan_ob) {
    await s.sprosti(zahtevekId, zak.napaka)
    return { stanje: 'ze', invoiceId: zak.invoice_id }
  }

  try {
    const ponovno = !!zak.invoice_id
    const racunId = zak.invoice_id || (await s.izdajRacun(zak)).id
    if (!zak.invoice_id) await s.shraniRacun(zahtevekId, racunId)
    const furs = await s.potrdiFurs(zak, racunId)
    // Knjiga po potrditvi: opis nosi koncno stevilko racuna.
    await s.vpisiVKnjigo(zak, racunId)
    // Racun gre stranki SELE potrjen: ob potrditvi dobi koncno stevilko
    // (prostor-naprava-zaporedna), stranka ne sme dobiti druge.
    let opozorilo: string | null = furs.success ? null : nepotrjenOpozorilo(furs.napaka)
    if (furs.success) {
      try {
        await s.posljiRacun(zak, racunId)
      } catch (e: any) {
        opozorilo = `Računa ni bilo mogoče poslati stranki: ${e?.message || e}`
      }
    }
    await s.koncaj(zahtevekId, opozorilo)
    return { stanje: ponovno ? 'ze' : 'izdan', invoiceId: racunId, fursPotrjen: furs.success }
  } catch (e: any) {
    const napaka = e?.message || String(e)
    await s.sprosti(zahtevekId, napaka)
    return { stanje: 'napaka', napaka }
  }
}

// ─────────────────────────────────────────────────────────────────
// SUPABASE IZVEDBA (service_role)
// ─────────────────────────────────────────────────────────────────

export const REF_PREDPONA = 'stripe-zahtevek-'

export function supabaseZahtevki(
  admin: SupabaseClient,
  o: { vrniDenar?: (orgId: string, paymentIntentId: string, idempotencyKey: string) => Promise<string | null> } = {},
): ZahtevkiShramba {
  return {
    async preberi(id) {
      const { data } = await admin.from('placilni_zahtevki').select('*').eq('id', id).maybeSingle()
      return (data as ZahtevekVrstica) || null
    },
    async oznaciPlacan(id, p) {
      const { data } = await admin.from('placilni_zahtevki').update({
        status: 'placan',
        placano_ob: new Date().toISOString(),
        checkout_session_id: p.sessionId,
        ...(p.paymentIntentId ? { payment_intent_id: p.paymentIntentId } : {}),
      }).eq('id', id).eq('status', 'poslan').select('id')
      return !!data && data.length > 0
    },
    async zakleni(id) {
      const meja = new Date(Date.now() - 2 * 60 * 1000).toISOString()
      const { data } = await admin.from('placilni_zahtevki')
        .update({ izdajanje_od: new Date().toISOString() })
        .eq('id', id)
        .or(`izdajanje_od.is.null,izdajanje_od.lt.${meja}`)
        .select('*')
      return ((data && data[0]) as ZahtevekVrstica) || null
    },
    async izdajRacun(z) {
      const ref = REF_PREDPONA + z.id
      const obstojeci = async () => {
        const { data } = await admin.from('issued_invoices').select('id').eq('org_id', z.org_id).eq('external_reference', ref).maybeSingle()
        return data?.id as string | undefined
      }
      const ze = await obstojeci()
      if (ze) return { id: ze }

      const danes = lokalniDatum()
      const placanoOb = z.placano_ob || new Date().toISOString()
      const datumPlacila = lokalniDatum(new Date(placanoOb))
      const vrstica: Record<string, any> = {
        org_id: z.org_id,
        invoice_type: 'invoice',
        client_name: z.stranka_ime,
        client_email: z.stranka_email,
        client_address: z.stranka_naslov || null,
        client_tax_number: z.stranka_davcna || null,
        issue_date: danes,
        due_date: danes,
        service_date: z.service_date || datumPlacila,
        service_date_from: z.service_date || datumPlacila,
        service_date_to: z.service_date_to || null,
        header_text: z.header_text || null,
        line_items: z.postavke,
        amount_net: Number(z.znesek_neto),
        vat_amount: Number(z.ddv),
        amount_total: Number(z.znesek),
        status: 'paid',
        paid_at: placanoOb,
        paid_amount: Number(z.znesek),
        notes: z.opomba || null,
        vat_exemption_code: z.vat_exemption_code || null,
        vat_exemption_text: z.vat_exemption_text || null,
        external_reference: ref,
        stripe_payment_id: z.payment_intent_id || z.checkout_session_id,
        source: 'zahtevek',
      }
      // Naslednja stevilka - enaka RPC kot obrazec "Nov racun"; ob trku
      // (vzporeden rocni racun) poskusimo znova.
      let zadnja = ''
      for (let poskus = 0; poskus < 4; poskus++) {
        const { data: st } = await admin.rpc('get_next_manual_invoice_number', { p_org_id: z.org_id, p_year: new Date().getFullYear() })
        const stevilka = String(st || `${new Date().getFullYear()}-001`)
        const { data, error } = await admin.from('issued_invoices')
          .insert({ ...vrstica, invoice_number: stevilka, reference: `SI00 ${stevilka}` })
          .select('id').single()
        if (!error && data) return { id: data.id }
        if (error?.code !== '23505') throw new Error('Vpis računa ni uspel: ' + error?.message)
        const ponovni = await obstojeci()
        if (ponovni) return { id: ponovni }
        zadnja = error.message
      }
      throw new Error('Številke računa ni bilo mogoče dodeliti: ' + zadnja)
    },
    async shraniRacun(id, invoiceId) {
      const { error } = await admin.from('placilni_zahtevki').update({ invoice_id: invoiceId }).eq('id', id)
      if (error) throw new Error('Računa ni bilo mogoče povezati z zahtevkom: ' + error.message)
    },
    async vpisiVKnjigo(z, invoiceId) {
      const { data: inv } = await admin.from('issued_invoices').select('invoice_number, issue_date, amount_net, vat_amount').eq('id', invoiceId).single()
      const { data: obst } = await admin.from('kpo_entries').select('id').eq('invoice_id', invoiceId).limit(1)
      if (obst && obst.length > 0) {
        // Naknadna potrditev spremeni stevilko racuna - opis sledi.
        await admin.from('kpo_entries').update({ description: `Račun #${inv?.invoice_number ?? ''} — ${z.stranka_ime}` }).eq('id', obst[0].id)
        return
      }
      const { error } = await admin.from('kpo_entries').insert({
        org_id: z.org_id,
        entry_date: inv?.issue_date || lokalniDatum(),
        description: `Račun #${inv?.invoice_number ?? ''} — ${z.stranka_ime}`,
        entry_type: 'income',
        income: Number(inv?.amount_net ?? z.znesek_neto),
        vat_out: Number(inv?.vat_amount ?? z.ddv),
        invoice_id: invoiceId,
        category: 'Storitev',
        notes: `Plačano s kartico prek Stripe (zahtevek ${z.stevilka || z.id})`,
      })
      if (error) throw new Error('Vpis v knjigo prihodkov ni uspel: ' + error.message)
    },
    async potrdiFurs(z, invoiceId) {
      try {
        const r = await confirmIssuedInvoiceWithFurs(admin, z.org_id, invoiceId, 'card')
        return { success: !!r.success, napaka: r.success ? null : (r.error || 'FURS ni potrdil računa') }
      } catch (e: any) {
        return { success: false, napaka: e?.message || 'Povezava s FURS ni uspela' }
      }
    },
    async posljiRacun(z, invoiceId) {
      if (z.racun_poslan_ob) return
      await posljiRacunStranki(admin, invoiceId, z.stranka_email)
      await admin.from('placilni_zahtevki').update({ racun_poslan_ob: new Date().toISOString() }).eq('id', z.id)
    },
    async koncaj(id, opozorilo) {
      await admin.from('placilni_zahtevki').update({ izdajanje_od: null, napaka: opozorilo }).eq('id', id)
    },
    async sprosti(id, napaka) {
      await admin.from('placilni_zahtevki').update({ izdajanje_od: null, napaka: napaka || null }).eq('id', id)
    },
    async vrniPlaciloBrezRacuna(z, pi, razlog) {
      let refundId: string | null = null
      let opis = razlog
      if (pi && o.vrniDenar) {
        try { refundId = await o.vrniDenar(z.org_id, pi, `zahtevek-brez-racuna-${z.id}-${pi}`) } catch (e: any) {
          opis = `Stranka je plačala ${z.status === 'preklican' ? 'preklican' : 'potekel'} zahtevek, samodejno vračilo ni uspelo (${e?.message || e}) — denar vrnite v Stripe nadzorni plošči.`
        }
      } else {
        opis = 'Stranka je plačala zahtevek, ki ne velja več — denar vrnite v Stripe nadzorni plošči.'
      }
      await admin.from('placilni_zahtevki').update({
        napaka: opis,
        ...(pi ? { payment_intent_id: pi } : {}),
        ...(refundId ? { refund_id: refundId, vrnjeno_ob: new Date().toISOString() } : {}),
      }).eq('id', z.id)
    },
  }
}

/** Racun (ze izdan) po e-posti stranki - PDF z davcno potrditvijo. */
export async function posljiRacunStranki(admin: SupabaseClient, invoiceId: string, email: string) {
  const { data: inv } = await admin.from('issued_invoices').select('*').eq('id', invoiceId).single()
  if (!inv) throw new Error('Račun ni najden')
  const { data: org } = await admin.from('organizations').select('*').eq('id', inv.org_id).single()
  let fursQr: string | undefined
  if (inv.zoi && inv.eor && !String(inv.zoi).startsWith('DEMO-')) {
    try { fursQr = await generateFursQr(inv.zoi, new Date(inv.furs_confirmed_at || inv.issue_date)) } catch { /* brez QR */ }
  }
  const pdf = await renderToBuffer(InvoicePDF({ invoice: inv, org, qrDataUrl: '', fursQrDataUrl: fursQr }) as any)
  const logo = await logotipZaEmail(org)
  const html = placanRacunEmailHtml({
    org, logoCid: logo?.cid ?? null, stevilka: inv.invoice_number, znesek: Number(inv.amount_total),
    datumPlacila: inv.paid_at, potrjen: !!inv.eor,
  })
  const zadeva = `Račun ${inv.invoice_number} — ${org.name}`
  const { data: poslano, error } = await resend.emails.send({
    from: posiljateljZa(org.name), to: [email], subject: zadeva, html,
    ...(org.email ? { replyTo: org.email } : {}),
    attachments: [{ filename: `racun-${inv.invoice_number}.pdf`, content: pdf }, ...(logo ? [logo.priloga] : [])],
  } as any)
  await admin.from('invoice_emails').insert({
    invoice_id: invoiceId, org_id: inv.org_id, to_email: email, subject: zadeva,
    status: error ? 'failed' : 'sent', error_message: error?.message ?? null, resend_email_id: poslano?.id ?? null,
  })
  if (error) throw new Error(error.message)
  await admin.from('issued_invoices').update({ last_email_sent_at: new Date().toISOString() }).eq('id', invoiceId)
}

/**
 * Klican iz Connect webhooka (app/api/pos/stripe/webhook) ob
 * checkout.session.completed z metadata.vrsta = 'zahtevek', in iz rezervnih
 * preverb (portal, stran "Hvala"). Idempotentno.
 */
export async function obdelajPlacanZahtevek(
  admin: SupabaseClient,
  zahtevekId: string,
  o: { sessionId: string; paymentIntentId: string | null; osnova?: string },
): Promise<{ stanje: 'izdan' | 'ze' | 'napaka' | 'preskoceno'; napaka?: string; invoiceId?: string | null }> {
  const izid = await obdelajPlacanZahtevekZ(supabaseZahtevki(admin, {
    vrniDenar: async (orgId, pi, kljuc) => {
      const { data: org } = await admin.from('organizations').select('stripe_account_id').eq('id', orgId).single()
      if (!org?.stripe_account_id) throw new Error('Stripe ni povezan')
      const r = await stripeConnect().refunds.create(
        { payment_intent: pi, reason: 'requested_by_customer', metadata: { vrsta: 'zahtevek', zahtevek_id: zahtevekId } },
        { stripeAccount: org.stripe_account_id, idempotencyKey: kljuc },
      )
      return r.id
    },
  }), zahtevekId, { sessionId: o.sessionId, paymentIntentId: o.paymentIntentId })
  // Vzporedna obdelava: 500 -> Stripe dogodek ponovi, takrat je ze 'ze'.
  if (izid.stanje === 'v_teku') return { stanje: 'napaka', napaka: 'Izdaja računa za ta zahtevek že poteka.' }
  return izid as any
}

/** charge.refunded: zahtevek dobi cas vracila (racun stornira uporabnik). */
export async function oznaciZahtevekVrnjen(admin: SupabaseClient, paymentIntentId: string) {
  await admin.from('placilni_zahtevki')
    .update({ vrnjeno_ob: new Date().toISOString() })
    .eq('payment_intent_id', paymentIntentId)
    .is('vrnjeno_ob', null)
}

/** Besedilo klavzule (obrazec poslje kodo in morebitno lastno besedilo). */
export function klavzula(koda: string | null | undefined, lastno: string | null | undefined) {
  if (!koda) return { code: null, text: null }
  return { code: koda, text: vatExemptionText(koda, lastno || '') || null }
}

// ─────────────────────────────────────────────────────────────────
// KDAJ JE MOZNOST NA VOLJO
// ─────────────────────────────────────────────────────────────────

export type PogojiZahtevka = {
  nastavljeno: boolean
  stripeAktiven: boolean
  stripePovezan?: boolean
  fursOk: boolean
  fursRazlog: string | null
  paketPortal: boolean
}

/**
 * Zahtevek za placilo je na voljo samo s povezanim Stripe (charges_enabled),
 * veljavnim FURS certifikatom s poslovnim prostorom (ali v predstavitvi) in v
 * paketu Pro ali Pro + POS. Vrne razlog za uporabnika in kam naj gre, ali null.
 */
export function razlogNedostopnosti(p: PogojiZahtevka | null | undefined): { razlog: string; povezava: string; gumb: string } | null {
  if (!p) return { razlog: 'Preverjam nastavitve plačil …', povezava: '/nastavitve?razdelek=placila', gumb: 'Nastavitve' }
  if (!p.paketPortal) return { razlog: 'Zahtevki za plačilo s kartico so na voljo v paketih Pro in Pro + POS.', povezava: '/nastavitve?razdelek=plan', gumb: 'Paketi' }
  if (!p.nastavljeno) return { razlog: 'Plačila s kartico (Stripe) na strežniku še niso nastavljena.', povezava: '/nastavitve?razdelek=placila', gumb: 'Plačila s kartico' }
  if (!p.stripeAktiven) {
    return {
      razlog: p.stripePovezan
        ? 'Stripe je povezan, a še ne sprejema plačil — dokončajte vpis podatkov pri Stripe.'
        : 'Za zahtevke za plačilo najprej povežite Stripe.',
      povezava: '/nastavitve?razdelek=placila', gumb: 'Plačila s kartico',
    }
  }
  if (!p.fursOk) return { razlog: (p.fursRazlog || 'Davčno potrjevanje ni nastavljeno.') + ' Vsak račun, plačan s kartico, se vedno davčno potrdi.', povezava: '/nastavitve?razdelek=blagajna', gumb: 'Nastavitve FURS' }
  return null
}

/** Vloge, ki zahtevkov ne smejo ustvarjati ali spreminjati (le gledajo). */
export const BREZ_PRAVIC = ['accountant', 'viewer', 'cashier']

/**
 * Dokoncanje placanega zahtevka (gumb "Potrdi zdaj" in dnevni cron):
 *  - placan brez racuna (prekinjena obdelava) -> obdelajPlacanZahtevek,
 *  - racun brez EOR -> davcna potrditev (obstojeca confirmIssuedInvoiceWithFurs),
 *  - potrjen racun, ki se ni bil poslan -> poslje ga stranki.
 */
export async function dokoncajZahtevek(admin: SupabaseClient, z: ZahtevekVrstica): Promise<{ furs: boolean | null; poslan: boolean | null; napaka: string | null }> {
  if (z.status !== 'placan') return { furs: null, poslan: null, napaka: 'Zahtevek ni plačan.' }
  if (!z.invoice_id) {
    const r = await obdelajPlacanZahtevek(admin, z.id, { sessionId: z.checkout_session_id || '', paymentIntentId: z.payment_intent_id })
    return { furs: null, poslan: null, napaka: r.napaka || null }
  }
  const s = supabaseZahtevki(admin)
  const zak = await s.zakleni(z.id)
  if (!zak) return { furs: null, poslan: null, napaka: 'Obdelava že poteka.' }
  try {
    const furs = await s.potrdiFurs(zak, zak.invoice_id!)
    await s.vpisiVKnjigo(zak, zak.invoice_id!)
    let opozorilo: string | null = furs.success ? null : nepotrjenOpozorilo(furs.napaka)
    let poslan: boolean | null = null
    if (furs.success && !zak.racun_poslan_ob) {
      try { await s.posljiRacun(zak, zak.invoice_id!); poslan = true } catch (e: any) {
        poslan = false
        opozorilo = (opozorilo ? opozorilo + ' ' : '') + `Računa ni bilo mogoče poslati stranki: ${e?.message || e}`
      }
    }
    await s.koncaj(z.id, opozorilo)
    return { furs: furs.success, poslan, napaka: opozorilo }
  } catch (e: any) {
    await s.sprosti(z.id, e?.message || String(e))
    return { furs: null, poslan: null, napaka: e?.message || String(e) }
  }
}
