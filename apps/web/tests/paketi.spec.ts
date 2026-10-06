import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  efektivniPaket, imaPro, imaPos, jeObstojeca, jeIztekelPreizkus, jeVPreizkusu, dovoljeno, zahtevajPaket,
  funkcijaZaPot, funkcijaVloge, potrebenPaket, STRANI_PAKETA, type Funkcija, type OrgNarocnina,
} from '../lib/paket'
import { odlociONarocnini, izStripeNarocnine, paketIzCene, type CeneStripe } from '../lib/narocnina-stripe'
import { opomnikZaOrg, besediloOpomnika, type OrgZaOpomnik } from '../lib/opomniki-preizkusa'

/**
 * REVIZIJA PAKETOV (migracija 182) – brez baze in brskalnika.
 *
 *   1. REGRESIJA OBSTOJECIH: za vsak obstojeci tip (free, pro, pro_pos,
 *      preizkus, iztekel) so vse funkcije, strani in API kot pred spremembo
 *   2. DOKAZ: POS, FURS, namizna/mobilna blagajna in njuni testi so
 *      nespremenjeni; obstojece preverbe v API so samo DOPOLNJENE
 *   3. nove organizacije: cenik po paketih, iztekel preizkus
 *   4. Stripe webhook (nove organizacije), opomniki pred iztekom
 *
 * Sprozilci v bazi: tests/paketi-baza.spec.ts.
 * Zagon:  cd apps/web && npx playwright test tests/paketi.spec.ts
 */

const ZDAJ = new Date('2026-10-06T12:00:00Z')
const cez = (dni: number) => new Date(ZDAJ.getTime() + dni * 86400_000).toISOString()
const KOREN = join(__dirname, '..')
const REPO = join(KOREN, '..', '..')
const IZHODISCE = '5315714' // zadnji commit na main pred revizijo

const VSE_FUNKCIJE: Funkcija[] = ['furs', 'email', 'skener', 'ai', 'uvoz_banke', 'uvoz_pdf', 'eslog', 'izvoz', 'racunovodja', 'zahtevki', 'pos', 'zaloge', 'ekipa_pin', 'pos_kartica']

// Obstojece organizacije - tipi iz produkcije 6.10.2026 (obstojeca_pravila = true)
const OBSTOJECE: Record<string, OrgNarocnina> = {
  free: { subscription_status: 'free', obstojeca_pravila: true },
  pro: { subscription_status: 'pro', obstojeca_pravila: true },
  pro_pos: { subscription_status: 'pro_pos', obstojeca_pravila: true },
  preizkus: { subscription_status: 'pro_pos', trial_ends_at: cez(5), obstojeca_pravila: true },
  iztekel: { subscription_status: 'pro_pos', trial_ends_at: cez(-3), obstojeca_pravila: true },
}
// Stanje PRED migracijo (stolpca se ni) ali neprebrana organizacija
const PRED_MIGRACIJO: Record<string, OrgNarocnina> = {
  'free brez stolpca': { subscription_status: 'free' },
  'iztekel brez stolpca': { subscription_status: 'pro_pos', trial_ends_at: cez(-3) },
  'neprebrana (null)': null,
}
// Nove organizacije (obstojeca_pravila = false)
const NOVE: Record<string, OrgNarocnina> = {
  free: { subscription_status: 'free', obstojeca_pravila: false },
  'trial-pro': { subscription_status: 'pro', trial_ends_at: cez(5), obstojeca_pravila: false },
  'trial-pro_pos': { subscription_status: 'pro_pos', trial_ends_at: cez(14), obstojeca_pravila: false },
  pro: { subscription_status: 'pro', stripe_subscription_id: 'sub_1', obstojeca_pravila: false },
  pro_pos: { subscription_status: 'pro_pos', stripe_subscription_id: 'sub_2', obstojeca_pravila: false },
  iztekel: { subscription_status: 'pro_pos', trial_ends_at: cez(-0.01), obstojeca_pravila: false },
  preklican: { subscription_status: 'cancelled', obstojeca_pravila: false },
}

/** Paket, kot ga je koda brala PRED revizijo: samo subscription_status. */
const stariPaket = (o: OrgNarocnina) => (o?.subscription_status === 'pro' || o?.subscription_status === 'pro_pos') ? o.subscription_status : 'free'

// ═══════════════════ 1. REGRESIJA OBSTOJECIH ═══════════════════

for (const [tip, org] of Object.entries({ ...OBSTOJECE, ...PRED_MIGRACIJO })) {
  test(`Regresija obstojecih [${tip}]: vse NOVE preverbe dovolijo, paket kot pred spremembo`, async () => {
    expect(jeObstojeca(org)).toBe(true)
    // Vse funkcije s cenika (nove preverbe v API, Ekipa, team/invite, change-role)
    for (const f of VSE_FUNKCIJE) expect(dovoljeno(org, f, ZDAJ), f).toBe(true)
    // Vse strani paketa (middleware): nobena se ne prepise na /paket
    for (const s of STRANI_PAKETA) expect(dovoljeno(org, s.funkcija, ZDAJ), s.predpona).toBe(true)
    // API: zahtevajPaket vedno null (dovoljeno)
    for (const f of VSE_FUNKCIJE) expect(await zahtevajPaket(lazniSupabase(org), 'org', f)).toBe(null)
    // Prikaz paketa (Nastavitve, Racuni, Prenosi): enako kot stara koda
    expect(efektivniPaket(org, ZDAJ)).toBe(stariPaket(org))
  })
}

test('Regresija obstojecih: posnetek pred -> po (matrika funkcij za vse tipi) je enak', () => {
  // PRED: nove preverbe niso obstajale = vse dovoljeno; paket = subscription_status.
  const posnetek = (fn: (o: OrgNarocnina, f: Funkcija) => boolean, paket: (o: OrgNarocnina) => string) =>
    Object.entries(OBSTOJECE).map(([t, o]) => `${t}:${paket(o)}:${VSE_FUNKCIJE.map(f => fn(o, f) ? 1 : 0).join('')}`)
  const pred = posnetek(() => true, stariPaket)
  const po = posnetek((o, f) => dovoljeno(o, f, ZDAJ), o => efektivniPaket(o, ZDAJ))
  expect(po).toEqual(pred)
})

// ═══════════════════ 2. DOKAZ: NIC SE NI SPREMENILO, KJER NE SME ═══════════════════

const git = (args: string) => execSync(`git ${args}`, { cwd: REPO, encoding: 'utf8' })
const imaIzhodisce = (() => { try { git(`cat-file -e ${IZHODISCE}^{commit}`); return true } catch { return false } })()

test.describe('Dokaz nespremenjenosti (git diff od izhodisca)', () => {
  test.skip(!imaIzhodisce, `commit ${IZHODISCE} ni v zgodovini (plitev klon)`)

  test('POS, FURS knjiznice, namizna blagajna: diff je PRAZEN', () => {
    const diff = git(`diff --stat ${IZHODISCE} -- apps/web/app/pos apps/web/components/pos 'apps/web/lib/pos-*' 'apps/web/lib/furs*' apps/desktop`)
    expect(diff.trim()).toBe('')
  })

  test('Mobilna aplikacija: spremenjena SAMO register.tsx (tocka C)', () => {
    const datoteke = git(`diff --name-only ${IZHODISCE} -- apps/mobile`).trim().split('\n').filter(Boolean)
    expect(datoteke).toEqual(['apps/mobile/app/register.tsx'])
  })

  test('api/furs in api/pos: samo DODANE vrstice (preverba paketa), nobena odstranjena', () => {
    const diff = git(`diff -U0 ${IZHODISCE} -- apps/web/app/api/furs apps/web/app/api/pos`)
    const odstranjene = diff.split('\n').filter(v => v.startsWith('-') && !v.startsWith('---'))
    expect(odstranjene).toEqual([])
    const dodane = diff.split('\n').filter(v => v.startsWith('+') && !v.startsWith('+++')).map(v => v.slice(1).trim()).filter(Boolean)
    // Vsaka dodana vrstica je del preverbe paketa ali komentar
    for (const v of dodane) {
      expect(v, v).toMatch(/^(\/\/|import \{ zahtevajPaket \} from '@\/lib\/paket'|const zavrnjenoPaket = await zahtevajPaket\(|if \(zavrnjenoPaket\) return zavrnjenoPaket)/)
    }
  })

  test('Testi POS in FURS so nespremenjeni (spremenjeni/novi so samo testi paketov)', () => {
    const datoteke = git(`diff --name-only ${IZHODISCE} -- apps/web/tests`).trim().split('\n').filter(Boolean)
    for (const d of datoteke) expect(d).toMatch(/tests\/(paketi(-baza)?\.spec\.ts|fiksture\/paketi-shema\.sql)$/)
  })

  test('Obstojece preverbe v API in stari webhook: samo DODANE vrstice', () => {
    const poti = [
      'app/api/ai-chat/route.ts', 'app/api/scan-receipt/route.ts', 'app/api/banka/parse-pdf/route.ts',
      'app/api/kartice/parse-statement/route.ts', 'app/api/place/parse-payslip/route.ts', 'app/api/invoices/import-pdf/route.ts',
      'app/api/invoices/[id]/send/route.tsx', 'app/api/invoices/[id]/eracun/route.ts', 'app/api/exports/accounting/route.ts',
      'app/api/team/invite/route.ts', 'app/api/team/change-role/route.ts', 'app/api/zaloge/uvoz-dobavnice/route.ts',
      'app/api/stripe/webhook/route.ts', 'lib/stripe-connect.ts', 'lib/role-access.ts', 'app/api/support-chat/route.ts',
    ].map(p => `'apps/web/${p}'`).join(' ')
    const diff = git(`diff -U0 ${IZHODISCE} -- ${poti}`)
    expect(diff.split('\n').filter(v => v.startsWith('-') && !v.startsWith('---'))).toEqual([])
  })
})

// ═══════════════════ 3. NOVE ORGANIZACIJE ═══════════════════

test('Nove: efektivni paket (iztekel preizkus = free takoj, brez nocnega opravila)', () => {
  const r = Object.fromEntries(Object.entries(NOVE).map(([k, o]) => [k, efektivniPaket(o, ZDAJ)]))
  expect(r).toEqual({ free: 'free', 'trial-pro': 'pro', 'trial-pro_pos': 'pro_pos', pro: 'pro', pro_pos: 'pro_pos', iztekel: 'free', preklican: 'free' })
})

test('Nove: preizkus traja 14 dni', () => {
  const o = NOVE['trial-pro_pos']
  expect(jeVPreizkusu(o, ZDAJ)).toBe(true)
  expect(efektivniPaket(o, new Date(ZDAJ.getTime() + 13.99 * 86400_000))).toBe('pro_pos')
  expect(efektivniPaket(o, new Date(ZDAJ.getTime() + 14 * 86400_000))).toBe('free')
  expect(jeIztekelPreizkus({ ...o, stripe_subscription_id: 'sub' }, new Date('2030-01-01'))).toBe(false)
})

const CENIK: { funkcija: Funkcija; free: boolean; pro: boolean; pos: boolean }[] = [
  ...(['furs', 'email', 'skener', 'ai', 'uvoz_banke', 'uvoz_pdf', 'eslog', 'izvoz', 'racunovodja', 'zahtevki'] as Funkcija[]).map(funkcija => ({ funkcija, free: false, pro: true, pos: true })),
  ...(['pos', 'zaloge', 'ekipa_pin', 'pos_kartica'] as Funkcija[]).map(funkcija => ({ funkcija, free: false, pro: false, pos: true })),
]
for (const v of CENIK) {
  test(`Nove, cenik: ${v.funkcija} – free ${v.free ? '✓' : '✗'}, pro ${v.pro ? '✓' : '✗'}, pro_pos ${v.pos ? '✓' : '✗'}`, () => {
    expect(dovoljeno(NOVE.free, v.funkcija, ZDAJ)).toBe(v.free)
    expect(dovoljeno(NOVE.pro, v.funkcija, ZDAJ)).toBe(v.pro)
    expect(dovoljeno(NOVE['trial-pro'], v.funkcija, ZDAJ)).toBe(v.pro)
    expect(dovoljeno(NOVE.pro_pos, v.funkcija, ZDAJ)).toBe(v.pos)
    expect(dovoljeno(NOVE['trial-pro_pos'], v.funkcija, ZDAJ)).toBe(v.pos)
    expect(dovoljeno(NOVE.iztekel, v.funkcija, ZDAJ)).toBe(false)
    expect(dovoljeno(NOVE.preklican, v.funkcija, ZDAJ)).toBe(false)
  })
}

test('imaPro / imaPos, vloge', () => {
  expect([imaPro(NOVE.free, ZDAJ), imaPro(NOVE.pro, ZDAJ), imaPos(NOVE.pro, ZDAJ), imaPos(NOVE.pro_pos, ZDAJ)]).toEqual([false, true, false, true])
  expect([funkcijaVloge('accountant'), funkcijaVloge('viewer'), funkcijaVloge('cashier'), funkcijaVloge('admin')]).toEqual(['racunovodja', 'racunovodja', 'ekipa_pin', null])
  expect(potrebenPaket('ekipa_pin')).toBe('pro_pos')
})

function lazniSupabase(org: OrgNarocnina): any {
  return {
    from: (t: string) => {
      expect(t).toBe('organizations')
      const q = { select: (stolpci: string) => { expect(stolpci).toBe('*'); return q }, eq: () => q, maybeSingle: async () => ({ data: org ?? null }) }
      return q
    },
  }
}

test('zahtevajPaket: nova Free -> 403 s potrebnim paketom; nova Pro za blagajno -> 403; Pro + POS -> dovoljeno', async () => {
  const r = await zahtevajPaket(lazniSupabase(NOVE.free), 'org', 'pos', 'Blagajna')
  expect(r?.status).toBe(403)
  expect((await r!.json()).paket).toBe('pro_pos')
  expect((await zahtevajPaket(lazniSupabase(NOVE.pro), 'org', 'pos'))?.status).toBe(403)
  expect(await zahtevajPaket(lazniSupabase(NOVE.pro_pos), 'org', 'pos')).toBe(null)
})

test('Strani paketa (middleware): /pos, /zaloge, /ai, /scan, /banka; evidence ostanejo odprte', () => {
  expect(['/pos', '/pos/zakljucek', '/zaloge', '/ai', '/scan', '/banka'].map(funkcijaZaPot)).toEqual(['pos', 'pos', 'zaloge', 'ai', 'skener', 'uvoz_banke'])
  for (const p of ['/invoices', '/kpo', '/ddv', '/ddv/evidenca', '/zakljucki', '/dashboard', '/nastavitve', '/posta', '/aidan']) expect(funkcijaZaPot(p), p).toBe(null)
  const mw = readFileSync(join(KOREN, 'middleware.ts'), 'utf8')
  expect(mw).toContain("select('role, organizations(*)')")
  expect(mw).toContain('NextResponse.rewrite')
})

test('Cenik (landing): KPO/DDV evidenca tudi v brezplacnem paketu; Nastavitve: »do 5 računov«', () => {
  const { PAKETI } = require('../components/landing/podatki')
  expect(PAKETI.find((p: any) => p.id === 'brezplacno').funkcije).toContain('Evidenca DDV in KPO knjiga')
  const nast = readFileSync(join(KOREN, 'app/nastavitve/page.tsx'), 'utf8')
  expect(nast).toContain('Brezplačni plan — do 5 računov.')
  expect(nast).not.toContain('računov/mesec')
})

test('Mobilna registracija ne vstavlja vec organizacije in clanstva', () => {
  const reg = readFileSync(join(REPO, 'apps/mobile/app/register.tsx'), 'utf8')
  expect(reg).not.toMatch(/from\('organizations'\)/)
  expect(reg).not.toMatch(/from\('org_members'\)/)
  expect(reg).toContain('org_name: orgName')
})

test('Checkout: trial_end samo, ce je do izteka preizkusa vec kot 48 ur', () => {
  const s = readFileSync(join(KOREN, 'app/api/stripe/checkout/route.ts'), 'utf8')
  expect(s).toContain('48 * 3600')
  expect(s).toContain('...(trialEnd ? { trial_end: trialEnd } : {})')
})

// ═══════════════════ 4. STRIPE WEBHOOK (nove organizacije) ═══════════════════

const CENE: CeneStripe = { pro: ['price_pro_m', 'price_pro_y'], proPos: ['price_pos_m', 'price_pos_y'] }
const KONEC = 1798761600 // 2027-01-01
const nar = (status: string, priceId = 'price_pro_m', id = 'sub_1') => ({ id, status, priceId, konecObdobja: KONEC })

test('Webhook: vse 4 cene -> pravi paket; neznana ali prazna cena -> null', () => {
  expect(['price_pro_m', 'price_pro_y', 'price_pos_m', 'price_pos_y'].map(p => paketIzCene(p, CENE))).toEqual(['pro', 'pro', 'pro_pos', 'pro_pos'])
  expect(paketIzCene('price_999', CENE)).toBe(null)
  expect(paketIzCene('', { pro: ['p', ''], proPos: [''] })).toBe(null)
})

test('Webhook: aktivna/trialing narocnina nastavi paket, id, konec obdobja, pocisti preizkus', () => {
  expect(odlociONarocnini({ id: 'o', stripe_subscription_id: null }, nar('trialing', 'price_pos_y'), CENE)).toEqual({ tip: 'posodobi', polja: {
    subscription_status: 'pro_pos', stripe_subscription_id: 'sub_1', trial_ends_at: null, plan_expires_at: '2027-01-01T00:00:00.000Z',
  } })
})

test('Webhook: past_due ohrani dostop; unpaid/canceled/incomplete_expired/paused -> free; incomplete ne dodeli', () => {
  const org = { id: 'o', stripe_subscription_id: 'sub_1' }
  expect((odlociONarocnini(org, nar('past_due'), CENE) as any).polja.subscription_status).toBe('pro')
  for (const s of ['unpaid', 'canceled', 'incomplete_expired', 'paused']) {
    expect(odlociONarocnini(org, nar(s), CENE), s).toEqual({ tip: 'posodobi', polja: { subscription_status: 'free', stripe_subscription_id: null, plan_expires_at: null } })
  }
  expect(odlociONarocnini({ id: 'o', stripe_subscription_id: null }, nar('incomplete'), CENE).tip).toBe('preskoci')
})

test('Webhook: preklic stare narocnine ne prepise nove; neznana cena -> napaka (Stripe ponovi)', () => {
  expect(odlociONarocnini({ id: 'o', stripe_subscription_id: 'sub_nova' }, nar('canceled', 'price_pro_m', 'sub_stara'), CENE).tip).toBe('preskoci')
  expect(odlociONarocnini({ id: 'o', stripe_subscription_id: null }, nar('active', 'price_999'), CENE).tip).toBe('napaka')
})

test('Webhook: current_period_end na narocnini ali na postavki', () => {
  expect(izStripeNarocnine({ id: 's', status: 'active', current_period_end: 5, items: { data: [{ price: { id: 'p' } }] } }).konecObdobja).toBe(5)
  expect(izStripeNarocnine({ id: 's', status: 'active', items: { data: [{ price: { id: 'p' }, current_period_end: 7 }] } })).toEqual({ id: 's', status: 'active', priceId: 'p', konecObdobja: 7 })
})

test('Webhook: obstojece organizacije gredo skozi STARO obdelavo (nova samo ob obstojeca_pravila === false)', () => {
  const s = readFileSync(join(KOREN, 'app/api/stripe/webhook/route.ts'), 'utf8')
  expect(s).toContain("if (!org || org.obstojeca_pravila !== false) return null")
  expect(s).toContain("if (event.type === 'charge.refunded')")
})

// ═══════════════════ 5. OPOMNIKI PRED IZTEKOM PREIZKUSA ═══════════════════

const opomOrg = (o: Partial<OrgZaOpomnik>): OrgZaOpomnik => ({
  id: 'o', name: 'Ana s.p.', trial_ends_at: cez(3), stripe_subscription_id: null, obstojeca_pravila: false,
  preizkus_opomnik_3d_ob: null, preizkus_opomnik_0d_ob: null, ...o,
})

test('Opomnik: 3 dni prej, na dan izteka, najvec enkrat', () => {
  expect(opomnikZaOrg(opomOrg({ trial_ends_at: cez(2.9) }), ZDAJ)).toBe('3d')
  expect(opomnikZaOrg(opomOrg({ trial_ends_at: cez(3.5) }), ZDAJ)).toBe(null)
  expect(opomnikZaOrg(opomOrg({ trial_ends_at: cez(2.9), preizkus_opomnik_3d_ob: cez(0) }), ZDAJ)).toBe(null)
  expect(opomnikZaOrg(opomOrg({ trial_ends_at: cez(0.5) }), ZDAJ)).toBe('0d')
  expect(opomnikZaOrg(opomOrg({ trial_ends_at: cez(-0.2) }), ZDAJ)).toBe('0d')
  expect(opomnikZaOrg(opomOrg({ trial_ends_at: cez(0.5), preizkus_opomnik_0d_ob: cez(0) }), ZDAJ)).toBe(null)
  expect(opomnikZaOrg(opomOrg({ trial_ends_at: cez(-2) }), ZDAJ)).toBe(null)
})

test('Opomnik: nikoli za obstojece organizacije in placane narocnine', () => {
  expect(opomnikZaOrg(opomOrg({ trial_ends_at: cez(2.9), obstojeca_pravila: true }), ZDAJ)).toBe(null)
  expect(opomnikZaOrg(opomOrg({ trial_ends_at: cez(2.9), obstojeca_pravila: null }), ZDAJ)).toBe(null)
  expect(opomnikZaOrg(opomOrg({ trial_ends_at: cez(0.5), stripe_subscription_id: 'sub' }), ZDAJ)).toBe(null)
})

test('Opomnik: besedilo (datum v Ljubljani, podatki ostanejo, povezava na Naročnino)', () => {
  const b = besediloOpomnika({ name: 'Ana s.p.', trial_ends_at: '2026-10-09T10:00:00Z' }, '3d', 'https://x.si')
  expect(b.zadeva).toContain('čez 3 dni')
  expect(b.besedilo).toContain('9. oktober 2026')
  expect(b.besedilo).toContain('12:00')
  expect(b.besedilo).toContain('podatki in izdani računi pa ostanejo')
  expect(b.besedilo).toContain('https://x.si/nastavitve?razdelek=plan')
  expect(besediloOpomnika({ name: null, trial_ends_at: '2026-10-09T10:00:00Z' }, '0d', 'https://x.si').besedilo).not.toContain('2 dni pred')
})
