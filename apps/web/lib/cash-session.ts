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

// ===== TIPI =====

export interface CashSession {
  id: string
  business_id: string
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

  // DDV (bruto razdelitev po stopnji)
  vatBase22: number
  vat22: number
  vatBase95: number
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
export async function getCurrentSession(staffId?: string): Promise<CashSession | null> {
  // DODANO (16.8.2026): brez tega se poizvedba sprozi, preden je business_id
  // razrescen - streznik vrne napako 400 in v konzoli se pojavi
  // "getCurrentSession error" ob vsakem odprtju blagajne.
  if (!BUSINESS_ID) return null
  const db = createClient()
  // POPRAVLJENO (13.8.2026, KRITICNO): ce je staffId podan, filtriraj SAMO
  // na sejo TE osebe - vec ljudi ima lahko ODPRTO SVOJO sejo hkrati. Prej se
  // je filtriralo SAMO po business_id, zato so VSI videli isto (prvo odprto)
  // sejo, ne glede na to, kdo se je prijavil s PIN-om.
  let query = db
    .from('cash_sessions')
    .select('*')
    .eq('business_id', BUSINESS_ID)
    .eq('status', 'open')
  if (staffId) {
    query = query.eq('staff_id', staffId)
  }
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
}): Promise<{ session: CashSession | null; error: string | null }> {
  const db = createClient()

  // POPRAVLJENO (13.8.2026, KRITICNO): preveri "ze odprto" SAMO za TO osebo
  // (staffId), ne za celo podjetje - vec ljudi lahko ima odprto svojo sejo.
  const existing = await getCurrentSession(params.staffId)
  if (existing && existing.status === 'open') {
    return {
      session: null,
      error: 'Blagajna je že odprta. Najprej jo zaprite.',
    }
  }

  const { data, error } = await db
    .from('cash_sessions')
    .insert({
      business_id: BUSINESS_ID,
      opened_by: params.openedBy,
      staff_id: params.staffId || null,
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
export async function getSessionStats(session: CashSession): Promise<SessionStats> {
  const db = createClient()

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
    .select('id, tip_amount, cashier_id, payments(method, amount), order_lines(qty, unit_price, total, vat_rate, voided)')
    .eq('business_id', BUSINESS_ID)
    .eq('status', 'paid')
    .gte('closed_at', from)
    .lte('closed_at', to)

  // Filter po blagajniku te seje.
  if (session.staff_id) {
    ordersQuery = ordersQuery.eq('cashier_id', session.staff_id)
  }

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
    .eq('business_id', BUSINESS_ID)
    // POPRAVLJENO (19.8.2026): `created_at` v tabeli `refunds` ne obstaja -
    // pravi je `refunded_at`. Poizvedba je odpovedala, zato se vracila NISO
    // odstela od pricakovane gotovine: zakljucek blagajne je javljal manjko,
    // ceprav je bila gotovina pravilna.
    .gte('refunded_at', from)
    .lte('refunded_at', to)
  if (session.staff_id) {
    refundsQuery = refundsQuery.eq('cashier_id', session.staff_id)
  }
  const { data: refunds } = await refundsQuery

  // Akumulacija
  let cash = 0, card = 0, bon = 0, prep = 0, other = 0, tips = 0
  let cashCount = 0, cardCount = 0, bonCount = 0, prepCount = 0, otherCount = 0
  let vatBase22 = 0, vat22 = 0, vatBase95 = 0, vat95 = 0
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

    // DDV po vrsticah
    for (const l of (o as any).order_lines || []) {
      if (l.voided) continue
      // POPRAVLJENO (16.8.2026, DDV): prej "qty * unit_price" - BREZ doplacil
      // modifikatorjev. Stolpec order_lines.total jih ze vsebuje (zapise ga
      // replaceLines kot (unitPrice + doplacila) * qty), zato je bila osnova za
      // DDV na Z-POROCILU - uradnem davcnem dokumentu - prenizka za znesek
      // doplacil. Uporabimo total, s pripravljenim nadomestkom za stare zapise.
      const lineTotal = l.total != null
        ? Number(l.total)
        : Number(l.qty || 0) * Number(l.unit_price || 0)
      const rate = Number(l.vat_rate ?? 22)

      if (rate === 22) {
        const base = lineTotal / 1.22
        vatBase22 += base
        vat22 += lineTotal - base
      } else if (rate === 9.5) {
        const base = lineTotal / 1.095
        vatBase95 += base
        vat95 += lineTotal - base
      } else if (rate === 0) {
        // Nedavcni zavezanec - cela vrednost je osnova, DDV je 0
        vatBase0 += lineTotal
      } else {
        // VAROVALKA (24.7.2026): nepricakovana stopnja - namesto tihega
        // izginotja pristane tukaj kot znak za rocni pregled.
        vatBaseOther += lineTotal
      }
    }
  }

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
    vatBase22, vat22, vatBase95, vat95, vatBase0, vatBaseOther,
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
}): Promise<{ zReportNumber: number | null; difference: number; error: string | null }> {
  const db = createClient()

  // 1. Pridobi statistiko za to izmeno
  const stats = await getSessionStats(params.session)

  // 2. Izračunaj razliko gotovine
  const expected = stats.cashExpected
  const declared = params.cashClosingDeclared
  const difference = declared - expected

  // 3. Pridobi zadnjo Z-številko
  const { data: lastZ } = await db
    .from('z_reports')
    .select('report_number')
    .eq('business_id', BUSINESS_ID)
    .order('report_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const reportNumber = (lastZ?.report_number || 0) + 1

  // 4. Ustvari Z-poročilo
  const { data: zReport, error: zError } = await db
    .from('z_reports')
    .insert({
      business_id: BUSINESS_ID,
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
      order_count: stats.orderCount,
      staff_id: params.closedBy,
      cash_session_id: params.session.id,
      sent_to_racunko: false,
    })
    .select('id, report_number')
    .single()

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
export async function getLastCarryOver(): Promise<number | null> {
  const db = createClient()
  const { data } = await db
    .from('z_reports')
    .select('cash_carry_over')
    .eq('business_id', BUSINESS_ID)
    .order('report_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.cash_carry_over ?? null
}
