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

// ===== TIPI =====

export interface CashSession {
  id: string
  business_id: string
  opened_by: string
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

  // GOTOVINA IZRAČUN
  cashExpected: number  // opening + cash - refunds (gotovinski del)
}

// ===== POMOŽNE FUNKCIJE =====

const BUSINESS_ID = '00000000-0000-0000-0000-000000000001'
const MAX_OPEN_HOURS = 24 // če je odprto več kot 24h, pri otvoritvi avto-zapri

/**
 * Vrne trenutno odprto izmeno za to blagajno (če obstaja).
 * Če je izmena starejša od 24h, vrne null (in jo treba ročno zapreti).
 */
export async function getCurrentSession(): Promise<CashSession | null> {
  const db = createClient()
  const { data, error } = await db
    .from('cash_sessions')
    .select('*')
    .eq('business_id', BUSINESS_ID)
    .eq('status', 'open')
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
  note?: string
}): Promise<{ session: CashSession | null; error: string | null }> {
  const db = createClient()

  // Preveri da ni odprte izmene
  const existing = await getCurrentSession()
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

  // PROMET — payments joinanih z orders
  const { data: orders } = await db
    .from('orders')
    .select('id, payments(method, amount, tip), order_lines(qty, unit_price, vat_rate, voided)')
    .eq('business_id', BUSINESS_ID)
    .eq('status', 'paid')
    .gte('closed_at', from)
    .lte('closed_at', to)

  // VRAČILA
  const { data: refunds } = await db
    .from('refunds')
    .select('amount')
    .eq('business_id', BUSINESS_ID)
    .gte('created_at', from)
    .lte('created_at', to)

  // Akumulacija
  let cash = 0, card = 0, bon = 0, prep = 0, other = 0, tips = 0
  let cashCount = 0, cardCount = 0, bonCount = 0, prepCount = 0, otherCount = 0
  let vatBase22 = 0, vat22 = 0, vatBase95 = 0, vat95 = 0

  for (const o of orders || []) {
    for (const p of (o as any).payments || []) {
      const amt = Number(p.amount || 0)
      const tip = Number(p.tip || 0)
      tips += tip

      if (p.method === 'cash')      { cash += amt; cashCount++ }
      else if (p.method === 'card') { card += amt; cardCount++ }
      else if (p.method === 'bon')  { bon += amt; bonCount++ }
      else if (p.method === 'prep') { prep += amt; prepCount++ }
      else                          { other += amt; otherCount++ }
    }

    // DDV po vrsticah
    for (const l of (o as any).order_lines || []) {
      if (l.voided) continue
      const lineTotal = Number(l.qty || 0) * Number(l.unit_price || 0)
      const rate = Number(l.vat_rate || 22)

      if (rate === 22) {
        const base = lineTotal / 1.22
        vatBase22 += base
        vat22 += lineTotal - base
      } else if (rate === 9.5) {
        const base = lineTotal / 1.095
        vatBase95 += base
        vat95 += lineTotal - base
      }
    }
  }

  const refundTotal = (refunds || []).reduce((s, r) => s + Number(r.amount || 0), 0)
  const refundCount = (refunds || []).length

  const totalRevenue = cash + card + bon + prep + other
  const cashExpected = Number(session.cash_opening) + cash - refundTotal

  return {
    cash, card, bon, prep, other, totalRevenue,
    cashCount, cardCount, bonCount, prepCount, otherCount,
    orderCount: (orders || []).length,
    tips,
    refundCount, refundTotal,
    vatBase22, vat22, vatBase95, vat95,
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
