import { test, expect } from '@playwright/test'
import { preveriPogoje } from '../lib/stripe-connect'
import { laznaBaza } from './pomoc/lazna-baza'

/**
 * PRELET 372: preveriPogoje v zivem in testnem nacinu s seznamom
 * STRIPE_CONNECT_DOVOLJENE_ORG. Zagon: npx playwright test tests/zivi-nacin.spec.ts
 */
test.describe.configure({ mode: 'serial' })

const ORG_A = '11111111-aaaa-bbbb-cccc-000000000001'
const ORG_B = '22222222-aaaa-bbbb-cccc-000000000002'
function baza(livemode: boolean) {
  const org = (id: string) => ({
    id, subscription_status: 'pro', furs_demo_mode: false, furs_test_mode: false,
    stripe_account_id: 'acct_' + id.slice(0, 4), stripe_charges_enabled: true, stripe_account_livemode: livemode,
  })
  return laznaBaza({
    organizations: [org(ORG_A), org(ORG_B)],
    furs_certificates: [ORG_A, ORG_B].map(o => ({ org_id: o, is_active: true, is_test: false, valid_to: '2030-01-01' })),
    business_premises: [ORG_A, ORG_B].map(o => ({ org_id: o, is_active: true, channel: 'both' })),
  })
}
const env = { ...process.env }
test.afterEach(() => {
  for (const k of ['STRIPE_CONNECT_SECRET_KEY', 'STRIPE_CONNECT_DOVOLJENE_ORG']) {
    if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]
  }
})

test('Zivi nacin: organizacija s seznama sme, ostale "kmalu na voljo"', async () => {
  process.env.STRIPE_CONNECT_SECRET_KEY = 'sk_live_x'
  process.env.STRIPE_CONNECT_DOVOLJENE_ORG = ORG_A
  const a = await preveriPogoje(baza(true) as any, ORG_A)
  expect(a).toMatchObject({ kmalu: false, nastavljeno: true, stripeAktiven: true, accountId: 'acct_1111' })
  const b = await preveriPogoje(baza(true) as any, ORG_B)
  expect(b).toMatchObject({ kmalu: true, nastavljeno: false, stripePovezan: false, stripeAktiven: false, accountId: null })
})

test('Zivi nacin: prazen seznam = nihce', async () => {
  process.env.STRIPE_CONNECT_SECRET_KEY = 'sk_live_x'
  process.env.STRIPE_CONNECT_DOVOLJENE_ORG = ''
  const a = await preveriPogoje(baza(true) as any, ORG_A)
  expect(a).toMatchObject({ kmalu: true, stripeAktiven: false })
})

test('Testni nacin: seznam ne velja', async () => {
  process.env.STRIPE_CONNECT_SECRET_KEY = 'sk_test_x'
  process.env.STRIPE_CONNECT_DOVOLJENE_ORG = ''
  const b = await preveriPogoje(baza(false) as any, ORG_B)
  expect(b).toMatchObject({ kmalu: false, nastavljeno: true, stripeAktiven: true })
})
