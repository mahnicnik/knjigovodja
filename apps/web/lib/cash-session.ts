/**
 * RAČUNKO POS — Cash Session Helper
 *
 * Upravlja otvoritev/zaključek blagajne (cash_sessions tabela).
 * Klicano iz pos/page.tsx za:
 *   - getCurrentSession() — preveri ali je blagajna odprta
 *   - openSession() — otvoritev z začetno gotovino
 *   - getSessionStats() — X-poročilo (vmesno stanje)
 *   - closeSession() — zaključek + razlika gotovine + Z-poročilo
 */

import { createClient } from '@/lib/supabase'
import { BUSINESS_ID } from '@/lib/pos-client'
import { ddvZPorocila } from '@/lib/pos-kpo'

// ===== TIPI =====

/**
 * LOCENE IZMENE PO NAPRAVI (trznice, 17.10.2026, migracija 188)
 *
 * Ce ima podjetje vklopljeno `organizations.izmene_po_napravi`, ima VSAKA
 * elektronska naprava svojo izmeno (svoj predal): odpre, vmesno stanje,
 * zakljuci in Z-porocilo se nanasajo samo na promet te naprave
 * (`orders.device_id`, `refunds.device_id`). Privzeto ostane skupna izmena
 * za celo podjetje (prelet 196) - nic se ne spremeni.
 *
 * Kontekst: v brskalniku (spletna/namizna blagajna) se vse privzame - odjemalec
 * iz '@/lib/supabase', BUSINESS_ID in izbrana naprava blagajne (localStorage).
 * Streznik (/api/pos/izmena, Android) poda svojega: odjemalec s sejo
 * telefona, business_id in napravo telefona.
 */
export interface IzmenaKontekst {
  db?: any
  businessId?: string
  /** electronic_devices.id; undefined = naprava blagajne iz brskalnika */
  deviceId?: string | null
}

const KLJUC_NAPRAVE = 'racunko_active_device' // isto kot pos/page.tsx (ACTIVE_DEVICE_KEY)

function napravaBrskalnika(): string | null {
  try {
    if (typeof window === 'undefined') return null
    return JSON.parse(window.localStorage.getItem(KLJUC_NAPRAVE) || 'null')?.id ?? null
  } catch { return null }
}

const nacinPredpomnilnik = new Map<string, { po: boolean; cas: number }>()

/** Ali ima podjetje loceno izmeno za vsako napravo (predpomnjeno 60 s). */
export async function izmenePoNapravi(db: any, businessId: string): Promise<boolean> {
  const p = nacinPredpomnilnik.get(businessId)
  if (p && Date.now() - p.cas < 60_000) return p.po
  const { data } = await db
    .from('organizations')
    .select('*')
    .or(`pos_business_id.eq.${businessId},id.eq.${businessId}`)
    .limit(1)
    .maybeSingle()
  const po = !!data?.izmene_po_napravi
  nacinPredpomnilnik.set(businessId, { po, cas: Date.now() })
  return po
}

async function razresi(ctx?: IzmenaKontekst) {
  const db = ctx?.db ?? createClient()
  const businessId = ctx?.businessId ?? BUSINESS_ID
  const poNapravi = businessId ? await izmenePoNapravi(db, businessId) : false
  const deviceId = poNapravi ? (ctx?.deviceId !== undefined ? ctx.deviceId : napravaBrskalnika()) : null
  return { db, businessId, poNapravi, deviceId }
}

export interface CashSession {
  id: string
  business_id: string
  /** Naprava izmene (samo pri locenih izmenah po napravi), sicer null */
  device_id?: string | null
  opened_by: string
  // DODANO (13.8.2026): locene seje po osebi - staff_id je PIN-preverjena
  // identiteta osebja (staff.id), locena od opened_by (Supabase auth naprave).
  staff_id: string | null
  opened_at: string
  cash_opening: number
  opening_note: string | null
  closed_by: string | null
  closed_at: string | null
  cash_closing_declared: number | null
  cash_closing_expected: number | null
  cash_difference: number | null
  closing_note: string | null
  z_report_id: string | null
  status: 'open' | 'closed'
  created_at: string
}

export interface SessionStats {
  // PROMET PO PLAČILU
  cash: number
  card: number
  bon: number
  prep: number
  other: number
  totalRevenue: number

  // ŠTEVILO
  cashCount: number
  cardCount: number
  bonCount: number
  prepCount: number
  otherCount: number
  orderCount: number

  // NAPITNINE
  tips: number

  // VRAČILA
  refundCount: number
  refundTotal: number
  cashRefundTotal: number

  // DDV (bruto razdelitev po stopnji)
  vatBase22: number
  vat22: number
  vatBase95: number
  vatBase5: number
  vat5: number
  vat95: number
  vatBase0: number
  vatBaseOther: number

  // GOTOVINA IZRAČUN
  cashExpected: number  // opening + cash - refunds (gotovinski del)
}

// ===== POMOŽNE FUNKCIJE =====
// BUSINESS_ID uvozen iz pos-client.ts (24.7.2026, audit R1) - prej lokalna
// trdo kodirana konstanta (samo Nikova org), zdaj deljena ziva spremenljivka.

const MAX_OPEN_HOURS = 24 // če je odprto več kot 24h, pri otvoritvi avto-zapri

/**
 * Vrne trenutno odprto izmeno za to blagajno (če obstaja).
 * Če je izmena starejša od 24h, vrne null (in jo treba ročno zapreti).
 */
export async function getCurrentSession(staffId?: string, ctx?: IzmenaKontekst): Promise<CashSession | null> {
  const { db, businessId, poNapravi, deviceId } = await razresi(ctx)
  // DODANO (16.8.2026): brez tega se poizvedba sprozi, preden je business_id
  // razrescen - streznik vrne napako 400 in v konzoli se pojavi
  // "getCurrentSession error" ob vsakem odprtju blagajne.
  if (!businessId) return null
  // POPRAVLJENO (13.8.2026, KRITICNO): ce je staffId podan, filtriraj SAMO
  // na sejo TE osebe - vec ljudi ima lahko ODPRTO SVOJO sejo hkrati. Prej se
  // je filtriralo SAMO po business_id, zato so VSI videli isto (prvo odprto)
  // sejo, ne glede na to, kdo se je prijavil s PIN-om.
  let query = db
    .from('cash_sessions')
    .select('*')
    .eq('business_id', businessId)
    .eq('status', 'open')
  // Trznice (17.10.2026): pri locenih izmenah samo izmena TE naprave.
  // Brez izbrane naprave ni izmene (blagajna najprej zahteva napravo).
  if (poNapravi) {
    if (!deviceId) return null
    query = query.eq('device_id', deviceId)
  }
  /**
   * POPRAVLJENO (prelet 196): IZMENA JE SKUPNA, NE OSEBNA.
   *
   * Filtriranje po `staff_id` je bilo uvedeno 13.8.2026 za primer, ko ima
   * vsak blagajnik SVOJ predal. V lokalu z enim samim predalom je ucinek
   * nasproten: blagajno zjutraj odpre en clovek, vsakemu naslednjemu, ki se
   * prijavi s PIN-om, pa sistem javi, da je blagajna zaprta, in ne more
   * izdati racuna.
   *
   * Blagajna se odpre enkrat na dan in velja za celotno podjetje. Kdo je
   * izdal posamezen racun, je zabelezeno pri racunu (`cashier_id`), zato se
   * promet po blagajnikih vidi tudi brez locenih izmen.
   *
   * `staffId` ostaja v podpisu, ker ga klici se posiljajo - le filtriranja
   * po njem ne izvajamo vec.
   */
  void staffId
  const { data, error } = await query
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('getCurrentSession error:', error)
    return null
  }

  if (!data) return null

  // Preveri ali ni "obvisela" izmena starejša od MAX_OPEN_HOURS
  const openedAt = new Date(data.opened_at)
  const hoursOpen = (Date.now() - openedAt.getTime()) / 1000 / 60 / 60

  if (hoursOpen > MAX_OPEN_HOURS) {
    // Stara izmena — vrnemo jo ampak označimo kot "stale"
    // V UI bomo prikazali opozorilo, da jo zapri.
    return { ...data, _stale: true } as any
  }

  return data
}

/**
 * Odpri novo izmeno (otvoritev blagajne).
 */
export async function openSession(params: {
  cashOpening: number
  openedBy: string
  staffId?: string
  note?: string
}, ctx?: IzmenaKontekst): Promise<{ session: CashSession | null; error: string | null }> {
  const { db, businessId, poNapravi, deviceId } = await razresi(ctx)
  if (poNapravi && !deviceId) {
    return { session: null, error: 'Izberi davčno napravo te blagajne - vsaka naprava ima svojo izmeno.' }
  }

  // POPRAVLJENO (prelet 196): preverimo, ali je blagajna ze odprta za
  // PODJETJE. Prej se je preverjalo po osebi, zato je vsak nov blagajnik
  // odprl SVOJO izmeno in ob koncu dneva je bilo Z-obracunov toliko, kolikor
  // je bilo ljudi - namesto enega za en predal.
  const existing = await getCurrentSession(undefined, { db, businessId, deviceId })
  if (existing && existing.status === 'open') {
    return {
      session: null,
      error: poNapravi ? 'Izmena te naprave je že odprta. Najprej jo zaprite.' : 'Blagajna je že odprta. Najprej jo zaprite.',
    }
  }

  const { data, error } = await db
    .from('cash_sessions')
    .insert({
      business_id: businessId,
      opened_by: params.openedBy,
      staff_id: params.staffId || null,
      device_id: poNapravi ? deviceId : null,
      cash_opening: params.cashOpening,
      opening_note: params.note || null,
      status: 'open',
    })
    .select('*')
    .single()

  if (error) {
    return { session: null, error: error.message }
  }

  return { session: data, error: null }
}

/**
 * Vrne statistiko trenutne izmene (X-poročilo).
 * Šteje vse plačane orderje od otvoritve do zdaj (ali do closedAt).
 */
export async function getSessionStats(session: CashSession, ctx?: IzmenaKontekst): Promise<SessionStats> {
  const db = ctx?.db ?? createClient()
  // Izmena pripada podjetju, ki ga zapis nosi - ne globalnemu BUSINESS_ID.
  const businessId = session.business_id || ctx?.businessId || BUSINESS_ID

  const from = session.opened_at
  const to = session.closed_at || new Date().toISOString()

  // PROMET — payments joinanih z orders. tip_amount dodan (R8, 24.7.2026) -
  // napitnine so na ORDERS, ne na payments (payments.tip ne obstaja).
  // POPRAVLJENO (16.8.2026, KRITICNO): promet se je filtriral SAMO po casovnem
  // oknu seje, ne po blagajniku. Odkar ima vsak svojo blagajno, se je promet
  // ene osebe stel v zakljucek DRUGE - Ana je v svojem zakljucku videla
  // Bojanov racun in njeno pricakovano stanje je bilo previsoko. Ko bi Bojan
  // zakljucil svojo sejo, bi bil isti racun stet DVAKRAT (v obeh Z-porocilih).
  //
  // Zdaj se prometu doda filter po cashier_id = staff_id seje. Ce seja nima
  // staff_id (starejsi zapisi pred locitvijo blagajn), obdrzimo staro
  // obnasanje, da zgodovinski zakljucki ostanejo enaki.
  let ordersQuery = db
    .from('orders')
    .select('id, total, tip_amount, invoice_number, cashier_id, payments(method, amount), order_lines(qty, unit_price, total, vat_rate, voided)')
    .eq('business_id', businessId)
    .eq('status', 'paid')
    .gte('closed_at', from)
    .lte('closed_at', to)
  // Trznice (17.10.2026): izmena naprave steje samo promet TE naprave. Izmena
  // brez naprave (skupna, vsi obstojeci zapisi) - nespremenjeno.
  if (session.device_id) ordersQuery = ordersQuery.eq('device_id', session.device_id)

  /**
   * POPRAVLJENO (prelet 204): PROMET CELOTNE IZMENE, NE SAMO ENE OSEBE.
   *
   * NAPAKA: promet se je filtriral po `cashier_id = session.staff_id`, torej
   * po osebi, ki je izmeno ODPRLA. Ker je izmena od preleta 196 SKUPNA za
   * celotno podjetje, so v vmesnem stanju in v zakljucku izpadli vsi racuni,
   * ki jih je izdal kdorkoli drug.
   *
   * V praksi: v izmeni je bilo 24 racunov, vmesno stanje jih je stelo 13.
   * Blagajnik bi ob zakljucku videl manjko, ki ga ni bilo - denar v predalu
   * bi bil visji od pricakovanega, razlika pa nepojasnjena.
   *
   * Filter po osebi je bil uveden 16.8.2026, ko je imel vsak blagajnik svojo
   * sejo in svoj predal. Pri enem predalu je ucinek nasproten, zato ga
   * odstranjujem. Kdo je izdal posamezen racun, ostaja zabelezeno pri racunu
   * (`cashier_id`), zato je promet po blagajnikih se vedno mogoce porocati.
   */

  const { data: orders, error: ordersError } = await ordersQuery
  if (ordersError) {
    console.error('getSessionStats: napaka pri branju narocil', ordersError)
  }

  // VRAČILA - method dodan (R10, 24.7.2026), da se od gotovine odstejejo
  // SAMO gotovinska vracila, ne tudi kartcna.
  // POPRAVLJENO (16.8.2026): tudi vracila se filtrirajo po blagajniku seje -
  // sicer bi se vracilo ene osebe odstelo od gotovine druge.
  let refundsQuery = db
    .from('refunds')
    .select('amount, method')
    .eq('business_id', businessId)
    // POPRAVLJENO (19.8.2026): `created_at` v tabeli `refunds` ne obstaja -
    // pravi je `refunded_at`. Poizvedba je odpovedala, zato se vracila NISO
    // odstela od pricakovane gotovine: zakljucek blagajne je javljal manjko,
    // ceprav je bila gotovina pravilna.
    .gte('refunded_at', from)
    .lte('refunded_at', to)
  // PRELET 204: enako kot pri prometu - vracila celotne izmene. Sicer bi se
  // vracilo, ki ga je opravil drug blagajnik, ne odstelo od pricakovane
  // gotovine in bi zakljucek javil presezek. (Pri izmeni naprave: vracila
  // te naprave - spodaj.)
  if (session.device_id) refundsQuery = refundsQuery.eq('device_id', session.device_id)
  const { data: refunds } = await refundsQuery

  // Akumulacija
  let cash = 0, card = 0, bon = 0, prep = 0, other = 0, tips = 0
  let cashCount = 0, cardCount = 0, bonCount = 0, prepCount = 0, otherCount = 0
  let vatBase22 = 0, vat22 = 0, vatBase95 = 0, vat95 = 0, vatBase5 = 0, vat5 = 0
  // R9 (24.7.2026): 0% za nedavcne zavezance + varovalka za nepricakovane
  // stopnje (namesto tihega izginotja iz DDV osnove).
  let vatBase0 = 0, vatBaseOther = 0

  for (const o of orders || []) {
    // R8: napitnina je na orderu, ne na posameznem placilu
    tips += Number((o as any).tip_amount || 0)

    for (const p of (o as any).payments || []) {
      const amt = Number(p.amount || 0)

      if (p.method === 'cash')      { cash += amt; cashCount++ }
      else if (p.method === 'card') { card += amt; cardCount++ }
      else if (p.method === 'bon')  { bon += amt; bonCount++ }
      else if (p.method === 'prep') { prep += amt; prepCount++ }
      else                          { other += amt; otherCount++ }
    }
  }

  // DDV PO STOPNJAH (revizija V3, oktober 2026): seštevek DDV, ZAOKROZENEGA PO
  // RACUNU in stopnji, s popustom na racunu (lib/pos-kpo ddvZPorocila) - enako
  // kot FURS razclenitev, KPO in DDV obracun. Prej: nezaokrozene vrstice BREZ
  // popusta - SIRM Z#30 je kazal 103,75 EUR DDV namesto 94,75 (popust 50 EUR),
  // Z#16 0,29 namesto 0,14. Racuni, poravnani s karto obiskov (pkg), niso
  // promet (storitev je bila obdavcena ob nakupu karte - 25.8.2026).
  for (const v of ddvZPorocila((orders || []) as any)) {
    if (v.stopnja === 22) { vatBase22 += v.osnova; vat22 += v.ddv }
    else if (v.stopnja === 9.5) { vatBase95 += v.osnova; vat95 += v.ddv }
    else if (v.stopnja === 5) { vatBase5 += v.osnova; vat5 += v.ddv }
    else if (v.stopnja === 0) vatBase0 += v.osnova
    // VAROVALKA (24.7.2026): nepricakovana stopnja - za rocni pregled.
    else vatBaseOther += v.osnova
  }
  const r2 = (n: number) => Math.round(n * 100) / 100
  vatBase22 = r2(vatBase22); vat22 = r2(vat22); vatBase95 = r2(vatBase95); vat95 = r2(vat95)
  vatBase5 = r2(vatBase5); vat5 = r2(vat5); vatBase0 = r2(vatBase0); vatBaseOther = r2(vatBaseOther)

  const refundTotal = (refunds || []).reduce((s, r) => s + Number(r.amount || 0), 0)
  const refundCount = (refunds || []).length
  // R10: od pricakovane gotovine odstejemo SAMO gotovinska vracila (metoda
  // 'cash' ali NULL - obstojeci zapisi brez metode se varno obravnavajo kot
  // gotovina, najbolj konservativna privzeta vrednost).
  const refund_cash = refund => refund.method === 'cash' || !refund.method
  const cashRefundTotal = (refunds || []).filter(refund_cash).reduce((s, r) => s + Number(r.amount || 0), 0)

  const totalRevenue = cash + card + bon + prep + other
  const cashExpected = Number(session.cash_opening) + cash - cashRefundTotal

  return {
    cash, card, bon, prep, other, totalRevenue,
    cashCount, cardCount, bonCount, prepCount, otherCount,
    orderCount: (orders || []).length,
    tips,
    refundCount, refundTotal,
    // DODANO (26.8.2026): SAMO gotovinska vracila. Izpis Z-porocila je od
    // pricakovane gotovine odsteval VSA vracila (tudi karticna), izracun
    // `cashExpected` pa samo gotovinska - vrstice se pri karticnem vracilu
    // niso izsle.
    cashRefundTotal,
    vatBase22, vat22, vatBase95, vat95, vatBase5, vat5, vatBase0, vatBaseOther,
    cashExpected,
  }
}

/**
 * Zapri izmeno (zaključek blagajne).
 * Ustvari Z-poročilo, izračuna razliko gotovine, posodobi cash_sessions.
 */
export async function closeSession(params: {
  session: CashSession
  cashClosingDeclared: number
  closedBy: string
  note?: string
  sendEmail?: boolean
}, ctx?: IzmenaKontekst): Promise<{ zReportNumber: number | null; difference: number; error: string | null }> {
  const db = ctx?.db ?? createClient()
  const businessId = params.session.business_id || ctx?.businessId || BUSINESS_ID

  // 1. Pridobi statistiko za to izmeno
  const stats = await getSessionStats(params.session, { db, businessId })

  // 2. Izračunaj razliko gotovine
  const expected = stats.cashExpected
  const declared = params.cashClosingDeclared
  const difference = declared - expected

  // 3.+4. Z-stevilka in Z-porocilo. Trznice (17.10.2026): ko zakljucuje vec
  // naprav hkrati, bi "zadnja + 1" dvema dala isto stevilko - baza ima zdaj
  // unikatnost (business_id, report_number), ob trku poskusimo z naslednjo.
  let reportNumber = 0
  let zReport: any = null
  let zError: any = null
  for (let poskus = 0; poskus < 5; poskus++) {
  const { data: lastZ } = await db
    .from('z_reports')
    .select('report_number')
    .eq('business_id', businessId)
    .order('report_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  reportNumber = (lastZ?.report_number || 0) + 1

  const vstavljen = await db
    .from('z_reports')
    .insert({
      business_id: businessId,
      device_id: params.session.device_id ?? null,
      report_number: reportNumber,
      opened_at: params.session.opened_at,
      closed_at: new Date().toISOString(),
      cash_opening: Number(params.session.cash_opening),
      cash_closing: declared,
      total_cash: stats.cash,
      total_card: stats.card,
      total_bon: stats.bon,
      total_other: stats.other + stats.prep,
      total_revenue: stats.totalRevenue,
      total_refunds: stats.refundTotal,
      total_vat_22: stats.vat22,
      total_vat_95: stats.vat95,
      total_vat_base_0: stats.vatBase0,
      total_vat_base_other: stats.vatBaseOther,
      // REVIZIJA V3: 5 % stopnja (prej ni bila shranjena nikjer - migracija 179)
      total_vat_5: stats.vat5,
      total_vat_base_5: stats.vatBase5,
      order_count: stats.orderCount,
      staff_id: params.closedBy,
      cash_session_id: params.session.id,
      sent_to_racunko: false,
    })
    .select('id, report_number')
    .single()
  zReport = vstavljen.data
  zError = vstavljen.error
  if (!zError || zError.code !== '23505') break // 23505 = unikatnost (trk stevilke)
  }

  if (zError) {
    return { zReportNumber: null, difference, error: zError.message }
  }

  // 5. Posodobi cash_sessions na 'closed'
  const { error: sError } = await db
    .from('cash_sessions')
    .update({
      closed_by: params.closedBy,
      closed_at: new Date().toISOString(),
      cash_closing_declared: declared,
      cash_closing_expected: expected,
      cash_difference: difference,
      closing_note: params.note || null,
      z_report_id: zReport.id,
      status: 'closed',
    })
    .eq('id', params.session.id)

  if (sError) {
    return { zReportNumber: reportNumber, difference, error: sError.message }
  }

  return { zReportNumber: reportNumber, difference, error: null }
}

/**
 * Formatira razliko gotovine v človeški obliki.
 */
export function formatDifference(diff: number): string {
  if (Math.abs(diff) < 0.01) return 'Ujema se'
  const sign = diff > 0 ? '+' : ''
  const word = diff > 0 ? '(višek)' : '(manjko)'
  return `${sign}${diff.toFixed(2).replace('.', ',')} € ${word}`
}

/**
 * Vrne priporočeno začetno gotovino za novo izmeno
 * (= pričakovana gotovina zadnje zaprte izmene).
 */
export async function getLastCarryOver(ctx?: IzmenaKontekst): Promise<number | null> {
  const { db, businessId, poNapravi, deviceId } = await razresi(ctx)
  // Trznice (17.10.2026): pri locenih izmenah prenos iz zadnjega Z-porocila
  // TE naprave (vsak predal ima svojo gotovino).
  let q = db
    .from('z_reports')
    .select('cash_carry_over')
    .eq('business_id', businessId)
  if (poNapravi && deviceId) q = q.eq('device_id', deviceId)
  const { data } = await q
    .order('report_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.cash_carry_over ?? null
}
