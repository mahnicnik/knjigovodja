import { test, expect } from '@playwright/test'
import crypto from 'node:crypto'
import { confirmIssuedInvoiceWithFurs } from '../lib/furs-invoice-confirm'
import { laznaBaza } from './pomoc/lazna-baza'

/**
 * H1 (prelet 364): davcna potrditev racuna s portala porabi EN zaporedno
 * stevilko in EN ZOI, tudi ce FURS veckrat zapored ne odgovori. Ponovni
 * poskusi posljejo isto stevilko/ZOI z oznako SubsequentSubmit.
 *
 * Zagon: cd apps/web && npx playwright test tests/furs-rezervacija.spec.ts
 */

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const kljuc = () => ({ privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), certificatePem: 'CERT' })

function pripravi() {
  let zaporedna = 40
  const baza = laznaBaza({
    issued_invoices: [{
      id: 'inv1', org_id: 'o1', invoice_number: '2026-005', invoice_type: 'invoice', issue_date: '2026-10-01',
      amount_total: 400, line_items: [{ description: 'Trening', quantity: 10, unit_price: 40, vat_rate: 0 }],
      eor: null, zoi: null, furs_confirming_at: null, furs_rezervacija: null,
    }],
    organizations: [{ id: 'o1', tax_number: '12345678', furs_demo_mode: false, furs_test_mode: false, pos_business_id: 'b1' }],
    furs_certificates: [{ id: 'c1', org_id: 'o1', is_active: true }],
    business_premises: [{ id: 'p1', org_id: 'o1', is_active: true, channel: 'both', premise_id: 'PP1' }],
    electronic_devices: [{ id: 'd1', premise_id: 'p1', is_active: true, channel: 'both', device_id: 'NAP1' }],
  }, { get_next_pos_invoice_number: () => ++zaporedna })
  return { baza, porabljene: () => zaporedna - 40 }
}

test('H1: FURS ne odgovori 5× zapored → ena sama številka in en ZOI, ponovitve so naknadne', async () => {
  const { baza, porabljene } = pripravi()
  const poslano: any[] = []
  const neodziven = async (config: any, data: any) => {
    poslano.push({ premise: config.premiseId, device: config.deviceId, st: data.invoiceNumber, zoi: data.presetZoi, naknadno: !!data.subsequentSubmit, cas: data.issueDateTime.toISOString() })
    return { success: false, zoi: data.presetZoi, eor: null, errorMessage: 'Timeout', responseTime: null } as any
  }
  for (let i = 0; i < 5; i++) {
    const r = await confirmIssuedInvoiceWithFurs(baza, 'o1', 'inv1', 'card', undefined, { posli: neodziven, kljuc })
    expect(r.success).toBe(false)
    expect(r.invoiceNumber).toBe('PP1-NAP1-41')
  }
  expect(porabljene()).toBe(1)                                  // ena sama zaporedna stevilka
  expect(new Set(poslano.map(p => p.st))).toEqual(new Set([41]))
  expect(new Set(poslano.map(p => p.zoi)).size).toBe(1)          // en ZOI
  expect(poslano[0].zoi).toMatch(/^[0-9a-f]{32}$/)
  expect(new Set(poslano.map(p => p.cas)).size).toBe(1)          // isti cas izdaje
  expect(poslano.map(p => p.naknadno)).toEqual([false, true, true, true, true])
  const inv = baza.tabele.issued_invoices[0]
  expect(inv.furs_rezervacija).toMatchObject({ invoiceNumber: 'PP1-NAP1-41', sequence: 41, zoi: poslano[0].zoi })
  expect(inv.eor).toBeNull()
  expect(inv.furs_confirming_at).toBeNull() // kljucavnica sproscena za naslednji poskus

  // FURS se odzove: potrdi ISTO stevilko in ZOI.
  const ok = await confirmIssuedInvoiceWithFurs(baza, 'o1', 'inv1', 'card', undefined, {
    kljuc,
    posli: async (_c: any, d: any) => ({ success: true, zoi: d.presetZoi, eor: 'EOR-1', errorMessage: null, responseTime: new Date() }) as any,
  })
  expect(ok).toMatchObject({ success: true, invoiceNumber: 'PP1-NAP1-41', zoi: poslano[0].zoi, eor: 'EOR-1' })
  expect(porabljene()).toBe(1)
  expect(baza.tabele.issued_invoices[0]).toMatchObject({ invoice_number: 'PP1-NAP1-41', zoi: poslano[0].zoi, eor: 'EOR-1' })
})

test('H1: izjema pri klicu FURS ne porabi nove številke ob naslednjem poskusu', async () => {
  const { baza, porabljene } = pripravi()
  const pada = async () => { throw new Error('ECONNRESET') }
  await confirmIssuedInvoiceWithFurs(baza, 'o1', 'inv1', 'card', undefined, { posli: pada as any, kljuc })
  await confirmIssuedInvoiceWithFurs(baza, 'o1', 'inv1', 'card', undefined, { posli: pada as any, kljuc })
  expect(porabljene()).toBe(1)
})
