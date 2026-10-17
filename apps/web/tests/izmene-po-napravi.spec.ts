import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { laznaBaza } from './pomoc/lazna-baza'
import { getCurrentSession, openSession, getSessionStats, closeSession, getLastCarryOver } from '../lib/cash-session'

/**
 * LOCENE IZMENE PO NAPRAVI (trznice, 17.10.2026, migracija 188)
 *
 * Pri `organizations.izmene_po_napravi` ima vsaka naprava svojo izmeno in
 * Z-porocilo; promet in vracila se stejejo po `device_id`. Privzeto (false)
 * ostane skupna izmena - obnasanje mora biti TOCNO kot prej.
 *
 * Zagon:  cd apps/web && npx playwright test tests/izmene-po-napravi.spec.ts
 */

const BIZ = 'biz-1'
const A = 'nap-A', B = 'nap-B'
const ODPRTO = '2026-10-17T06:00:00.000Z'

const narocilo = (id: string, naprava: string | null, gotovina: number, kartica = 0) => ({
  id, business_id: BIZ, status: 'paid', closed_at: '2026-10-17T09:00:00.000Z', device_id: naprava,
  total: gotovina + kartica, tip_amount: 0, invoice_number: null, cashier_id: null,
  payments: [...(gotovina ? [{ method: 'cash', amount: gotovina }] : []), ...(kartica ? [{ method: 'card', amount: kartica }] : [])],
  order_lines: [{ qty: 1, unit_price: gotovina + kartica, total: gotovina + kartica, vat_rate: 22, voided: false }],
})

function bazaSkupna() {
  return laznaBaza({
    organizations: [{ id: 'org-1', pos_business_id: BIZ, izmene_po_napravi: false }],
    cash_sessions: [
      { id: 's-skupna', business_id: BIZ, status: 'open', device_id: null, opened_at: ODPRTO, cash_opening: 100, closed_at: null },
    ],
    orders: [narocilo('o1', A, 10), narocilo('o2', A, 0, 7.5), narocilo('o3', B, 20), narocilo('o4', null, 5)],
    refunds: [
      { business_id: BIZ, amount: 2, method: 'cash', refunded_at: '2026-10-17T10:00:00.000Z', device_id: A },
      { business_id: BIZ, amount: 3, method: 'cash', refunded_at: '2026-10-17T10:00:00.000Z', device_id: B },
    ],
    z_reports: [{ id: 'z-old', business_id: BIZ, report_number: 7, device_id: A, cash_carry_over: 42 }],
  })
}

// Nacin (izmene_po_napravi) se predpomni po businessId, zato ima vsak nacin svoje podjetje.
test.describe.configure({ mode: 'serial' })

test('skupna izmena (privzeto): ista izmena za vse naprave, promet VSEH naprav', async () => {
  const db = bazaSkupna()
  const sA = await getCurrentSession(undefined, { db, businessId: BIZ, deviceId: A })
  const sNic = await getCurrentSession(undefined, { db, businessId: BIZ, deviceId: null })
  expect(sA?.id).toBe('s-skupna')
  expect(sNic?.id).toBe('s-skupna')
  const st = await getSessionStats(sA!, { db, businessId: BIZ })
  expect(st.orderCount).toBe(4)
  expect(st.cash).toBe(35)            // 10 + 20 + 5
  expect(st.card).toBe(7.5)
  expect(st.refundTotal).toBe(5)       // 2 + 3
  expect(st.cashExpected).toBe(130)    // 100 + 35 - 5
})

test.describe('po napravi', () => {
  // svoje podjetje, da predpomnilnik nacina ne pomesa obeh primerov
  const BIZP = 'biz-p'
  const bazaP = () => laznaBaza({
      organizations: [{ id: 'org-p', pos_business_id: BIZP, izmene_po_napravi: true }],
      cash_sessions: [{ id: 's-A', business_id: BIZP, status: 'open', device_id: A, opened_at: ODPRTO, cash_opening: 50, closed_at: null }],
      orders: [narocilo('o1', A, 10), narocilo('o2', A, 0, 7.5), narocilo('o3', B, 20), narocilo('o4', null, 5)].map(o => ({ ...o, business_id: BIZP })),
      refunds: [
        { business_id: BIZP, amount: 2, method: 'cash', refunded_at: '2026-10-17T10:00:00.000Z', device_id: A },
        { business_id: BIZP, amount: 3, method: 'cash', refunded_at: '2026-10-17T10:00:00.000Z', device_id: B },
      ],
      z_reports: [{ id: 'z-old', business_id: BIZP, report_number: 7, device_id: A, cash_carry_over: 42 }],
    })

  test('naprava A vidi svojo izmeno, naprava B nima izmene, brez naprave ni izmene', async () => {
    const db = bazaP()
    expect((await getCurrentSession(undefined, { db, businessId: BIZP, deviceId: A }))?.id).toBe('s-A')
    expect(await getCurrentSession(undefined, { db, businessId: BIZP, deviceId: B })).toBeNull()
    expect(await getCurrentSession(undefined, { db, businessId: BIZP, deviceId: null })).toBeNull()
  })

  test('vmesno stanje naprave A steje samo njen promet in njena vracila', async () => {
    const db = bazaP()
    const s = await getCurrentSession(undefined, { db, businessId: BIZP, deviceId: A })
    const st = await getSessionStats(s!, { db, businessId: BIZP })
    expect(st.orderCount).toBe(2)
    expect(st.cash).toBe(10)
    expect(st.card).toBe(7.5)
    expect(st.totalRevenue).toBe(17.5)
    expect(st.refundTotal).toBe(2)
    expect(st.cashExpected).toBe(58)   // 50 + 10 - 2
  })

  test('naprava B lahko odpre svojo izmeno, A drugic ne; brez naprave ne', async () => {
    const db = bazaP()
    const b = await openSession({ cashOpening: 30, openedBy: 'u1' }, { db, businessId: BIZP, deviceId: B })
    expect(b.error).toBeNull()
    expect(b.session?.device_id).toBe(B)
    const a2 = await openSession({ cashOpening: 30, openedBy: 'u1' }, { db, businessId: BIZP, deviceId: A })
    expect(a2.error).toContain('Izmena te naprave je že odprta')
    const nic = await openSession({ cashOpening: 30, openedBy: 'u1' }, { db, businessId: BIZP, deviceId: null })
    expect(nic.error).toContain('Izberi davčno napravo')
  })

  test('zakljucek naprave A: Z-porocilo z napravo, razlika iz njenega predala', async () => {
    const db = bazaP()
    const s = await getCurrentSession(undefined, { db, businessId: BIZP, deviceId: A })
    const r = await closeSession({ session: s!, cashClosingDeclared: 57, closedBy: 'u1' }, { db, businessId: BIZP })
    expect(r.error).toBeNull()
    expect(r.zReportNumber).toBe(8)
    expect(r.difference).toBe(-1)       // 57 - 58
    const { data: z } = await db.from('z_reports').select('*').eq('business_id', BIZP).eq('report_number', 8).maybeSingle()
    expect(z.device_id).toBe(A)
    expect(z.total_revenue).toBe(17.5)
    expect(z.total_cash).toBe(10)
  })

  test('prenos zacetne gotovine iz zadnjega Z-porocila TE naprave', async () => {
    const db = bazaP()
    expect(await getLastCarryOver({ db, businessId: BIZP, deviceId: A })).toBe(42)
    expect(await getLastCarryOver({ db, businessId: BIZP, deviceId: B })).toBeNull()
  })
})

test('Android in splet: naprava na narocilu/vracilu, izmena prek API', () => {
  const REPO = join(__dirname, '..', '..', '..')
  const beri = (...p: string[]) => readFileSync(join(REPO, ...p), 'utf8')
  const mob = beri('apps', 'mobile', 'app', 'pos.tsx')
  expect(mob).toContain('device_id: naprava?.id ?? null,')
  expect(mob).toContain('stanjeIzmene(auth!.orgId, naprava?.id ?? null)')
  expect(mob).toContain("p_cashier_id: trenutnaOseba()?.id ?? null,")
  const klient = beri('apps', 'web', 'lib', 'pos-client.ts')
  expect(klient).toContain(".update({ device_id: naprava }).eq('id', params.orderId).neq('status', 'paid')")
  const stran = beri('apps', 'web', 'app', 'pos', 'page.tsx')
  expect(stran).toContain('device_id: getActiveDevice()?.id ?? null,')
  const api = beri('apps', 'web', 'app', 'api', 'pos', 'izmena', 'route.ts')
  expect(api).toContain("if (izmena.device_id && izmena.device_id !== deviceId)")
  expect(api).toContain("zahtevajPaket(supabase, orgId, 'pos', 'Blagajna')")
  const sql = beri('supabase', 'migrations', '188_izmene_po_napravi.sql')
  expect(sql).toContain('add column if not exists izmene_po_napravi boolean not null default false')
  expect(sql).toContain('create unique index if not exists z_reports_business_stevilka')
})
