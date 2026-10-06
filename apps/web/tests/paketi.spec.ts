import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  efektivniPaket, imaPro, imaPos, jeIztekelPreizkus, jeVPreizkusu, dovoljeno, zahtevajPaket,
  funkcijaZaPot, funkcijaVloge, potrebenPaket, type Funkcija, type OrgNarocnina,
} from '../lib/paket'

/**
 * REVIZIJA PAKETOV (6.10.2026) – pravila paketov brez baze in brskalnika.
 *
 *   1. efektivni paket za vse testne organizacije (free, trial-pro,
 *      trial-pro_pos, pro, pro_pos, iztekel, preklican)
 *   2. vsaka vrstica s cenika: dovoljeno / zavrnjeno po paketu
 *   3. zahtevajPaket (API) z laznim Supabase
 *   4. vsaka placljiva API pot dejansko klice preverbo paketa
 *
 * Sprozilci v bazi: tests/paketi-baza.spec.ts.
 * Zagon:  cd apps/web && npx playwright test tests/paketi.spec.ts
 */

const ZDAJ = new Date('2026-10-06T12:00:00Z')
const cez = (dni: number) => new Date(ZDAJ.getTime() + dni * 86400_000).toISOString()

const ORG: Record<string, OrgNarocnina> = {
  free: { subscription_status: 'free' },
  'trial-pro': { subscription_status: 'pro', trial_ends_at: cez(5) },
  'trial-pro_pos': { subscription_status: 'pro_pos', trial_ends_at: cez(14) },
  pro: { subscription_status: 'pro', stripe_subscription_id: 'sub_1' },
  pro_pos: { subscription_status: 'pro_pos', stripe_subscription_id: 'sub_2' },
  iztekel: { subscription_status: 'pro_pos', trial_ends_at: cez(-0.01) },
  preklican: { subscription_status: 'cancelled' },
  'rocno-dodeljen': { subscription_status: 'pro_pos' }, // brez Stripa in brez preizkusa
}

// ═══════════════════ 1. EFEKTIVNI PAKET ═══════════════════

test('Efektivni paket za vse testne organizacije', () => {
  const r = Object.fromEntries(Object.entries(ORG).map(([k, o]) => [k, efektivniPaket(o, ZDAJ)]))
  expect(r).toEqual({
    free: 'free', 'trial-pro': 'pro', 'trial-pro_pos': 'pro_pos', pro: 'pro', pro_pos: 'pro_pos',
    iztekel: 'free', preklican: 'free', 'rocno-dodeljen': 'pro_pos',
  })
})

test('Iztekel preizkus = free TAKOJ, brez nocnega opravila', () => {
  const o = { subscription_status: 'pro_pos', trial_ends_at: '2026-10-06T11:59:59Z' }
  expect(jeIztekelPreizkus(o, ZDAJ)).toBe(true)
  expect(efektivniPaket(o, ZDAJ)).toBe('free')
  // Sekundo pred iztekom se velja.
  expect(efektivniPaket(o, new Date('2026-10-06T11:59:58Z'))).toBe('pro_pos')
})

test('Placana narocnina preglasi iztekel trial_ends_at', () => {
  const o = { subscription_status: 'pro', trial_ends_at: cez(-30), stripe_subscription_id: 'sub_x' }
  expect(efektivniPaket(o, ZDAJ)).toBe('pro')
  expect(jeVPreizkusu(o, ZDAJ)).toBe(false)
})

test('Preizkus traja 14 dni (handle_new_user)', () => {
  const o = { subscription_status: 'pro_pos', trial_ends_at: cez(14) }
  expect(jeVPreizkusu(o, ZDAJ)).toBe(true)
  expect(efektivniPaket(o, new Date(ZDAJ.getTime() + 13.99 * 86400_000))).toBe('pro_pos')
  expect(efektivniPaket(o, new Date(ZDAJ.getTime() + 14 * 86400_000))).toBe('free')
})

test('Neznane in prazne vrednosti so free', () => {
  for (const o of [null, undefined, {}, { subscription_status: 'PRO' }, { subscription_status: '' }]) {
    expect(efektivniPaket(o as any, ZDAJ)).toBe('free')
  }
})

// ═══════════════════ 2. CENIK ═══════════════════

const CENIK: { funkcija: Funkcija; free: boolean; pro: boolean; pos: boolean }[] = [
  { funkcija: 'furs', free: false, pro: true, pos: true },
  { funkcija: 'email', free: false, pro: true, pos: true },
  { funkcija: 'skener', free: false, pro: true, pos: true },
  { funkcija: 'ai', free: false, pro: true, pos: true },
  { funkcija: 'uvoz_banke', free: false, pro: true, pos: true },
  { funkcija: 'uvoz_pdf', free: false, pro: true, pos: true },
  { funkcija: 'eslog', free: false, pro: true, pos: true },
  { funkcija: 'izvoz', free: false, pro: true, pos: true },
  { funkcija: 'racunovodja', free: false, pro: true, pos: true },
  { funkcija: 'zahtevki', free: false, pro: true, pos: true },
  { funkcija: 'pos', free: false, pro: false, pos: true },
  { funkcija: 'zaloge', free: false, pro: false, pos: true },
  { funkcija: 'ekipa_pin', free: false, pro: false, pos: true },
  { funkcija: 'pos_kartica', free: false, pro: false, pos: true },
]

for (const v of CENIK) {
  test(`Cenik: ${v.funkcija} – free ${v.free ? '✓' : '✗'}, pro ${v.pro ? '✓' : '✗'}, pro_pos ${v.pos ? '✓' : '✗'}`, () => {
    expect(dovoljeno(ORG.free, v.funkcija, ZDAJ)).toBe(v.free)
    expect(dovoljeno(ORG.pro, v.funkcija, ZDAJ)).toBe(v.pro)
    expect(dovoljeno(ORG['trial-pro'], v.funkcija, ZDAJ)).toBe(v.pro)
    expect(dovoljeno(ORG.pro_pos, v.funkcija, ZDAJ)).toBe(v.pos)
    expect(dovoljeno(ORG['trial-pro_pos'], v.funkcija, ZDAJ)).toBe(v.pos)
    // Iztekel in preklican = free.
    expect(dovoljeno(ORG.iztekel, v.funkcija, ZDAJ)).toBe(v.free)
    expect(dovoljeno(ORG.preklican, v.funkcija, ZDAJ)).toBe(v.free)
  })
}

test('imaPro / imaPos', () => {
  expect([imaPro(ORG.free, ZDAJ), imaPro(ORG.pro, ZDAJ), imaPro(ORG.pro_pos, ZDAJ)]).toEqual([false, true, true])
  expect([imaPos(ORG.free, ZDAJ), imaPos(ORG.pro, ZDAJ), imaPos(ORG.pro_pos, ZDAJ)]).toEqual([false, false, true])
})

test('Vloge: racunovodja/gledalec = Pro, blagajnik = Pro + POS, admin brez omejitve', () => {
  expect(funkcijaVloge('accountant')).toBe('racunovodja')
  expect(funkcijaVloge('viewer')).toBe('racunovodja')
  expect(funkcijaVloge('cashier')).toBe('ekipa_pin')
  expect(funkcijaVloge('admin')).toBe(null)
  expect(potrebenPaket('ekipa_pin')).toBe('pro_pos')
})

// ═══════════════════ 3. API: zahtevajPaket ═══════════════════

function lazniSupabase(org: OrgNarocnina) {
  return {
    from: (t: string) => {
      expect(t).toBe('organizations')
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: org ?? null }) }
      return q
    },
  }
}

test('zahtevajPaket: Free -> 403 s sporocilom in potrebnim paketom', async () => {
  const r = await zahtevajPaket(lazniSupabase(ORG.free), 'org', 'pos', 'Blagajna')
  expect(r?.status).toBe(403)
  const telo = await r!.json()
  expect(telo.paket).toBe('pro_pos')
  expect(telo.error).toContain('Blagajna je na voljo v paketu Pro + POS')
})

test('zahtevajPaket: Pro za blagajno -> 403, Pro + POS -> dovoljeno', async () => {
  expect((await zahtevajPaket(lazniSupabase(ORG.pro), 'org', 'pos'))?.status).toBe(403)
  expect(await zahtevajPaket(lazniSupabase(ORG.pro_pos), 'org', 'pos')).toBe(null)
  expect(await zahtevajPaket(lazniSupabase(ORG['trial-pro_pos']), 'org', 'zaloge')).toBe(null)
})

test('zahtevajPaket: nečlan (RLS vrne null) -> 403', async () => {
  expect((await zahtevajPaket(lazniSupabase(null), 'tuja', 'furs'))?.status).toBe(403)
})

// ═══════════════════ 4. STRANI IN API POTI ═══════════════════

test('Strani paketa (middleware): /pos, /zaloge, /ai, /scan, /banka', () => {
  expect(funkcijaZaPot('/pos')).toBe('pos')
  expect(funkcijaZaPot('/pos/zakljucek')).toBe('pos')
  expect(funkcijaZaPot('/zaloge')).toBe('zaloge')
  expect(funkcijaZaPot('/ai')).toBe('ai')
  expect(funkcijaZaPot('/scan')).toBe('skener')
  expect(funkcijaZaPot('/banka')).toBe('uvoz_banke')
  // Evidence ostanejo berljive (10-letna hramba).
  for (const p of ['/invoices', '/kpo', '/ddv', '/zakljucki', '/dashboard', '/nastavitve', '/posta', '/aidan']) {
    expect(funkcijaZaPot(p), p).toBe(null)
  }
})

const KORENSKA = join(__dirname, '..')
const PREVERBA = /zahtevajPaket\(|imaPro\(|imaPos\(|dovoljeno\(|paketPos|paketPortal/

const PLACLJIVE_POTI = [
  'app/api/furs/confirm/route.ts', 'app/api/furs/invoice/route.ts',
  'app/api/invoices/[id]/send/route.tsx', 'app/api/invoices/[id]/eracun/route.ts', 'app/api/invoices/import-pdf/route.ts',
  'app/api/scan-receipt/route.ts', 'app/api/ai-chat/route.ts', 'app/api/banka/parse-pdf/route.ts',
  'app/api/kartice/parse-statement/route.ts', 'app/api/place/parse-payslip/route.ts',
  'app/api/exports/accounting/route.ts', 'app/api/team/invite/route.ts',
  'app/api/pos/import-delivery/route.ts', 'app/api/pos/parse-cenik/route.ts', 'app/api/pos/stripe/placilo/route.ts',
  'app/api/zaloge/uvoz-dobavnice/route.ts',
]

for (const pot of PLACLJIVE_POTI) {
  test(`API ${pot.replace('app/api/', '').replace(/\/route\.tsx?$/, '')} preverja paket na strezniku`, () => {
    const vsebina = readFileSync(join(KORENSKA, pot), 'utf8')
    expect(vsebina).toMatch(PREVERBA)
    // Nobena placljiva pot ne sme vec sama primerjati subscription_status.
    expect(vsebina).not.toMatch(/subscription_status\s*(===|!==)/)
  })
}
