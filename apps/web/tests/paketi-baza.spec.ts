import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * REVIZIJA PAKETOV – SPROZILCI IN RLS V BAZI (migracija 182)
 *
 * Tece na LOKALNEM PostgreSQL (ne na produkciji): vsak zagon ustvari svezo
 * bazo, nalozi posnetek produkcijske sheme PRED migracijo
 * (tests/fiksture/paketi-shema.sql) in nato migracijo 182.
 *
 * Zagon:
 *   PAKETI_PG="-h /tmp -p 54329 -U postgres" npx playwright test tests/paketi-baza.spec.ts
 * Brez PAKETI_PG se testi preskocijo.
 */

const PG = process.env.PAKETI_PG
test.skip(!PG, 'PAKETI_PG ni nastavljen (lokalni PostgreSQL)')
test.describe.configure({ mode: 'serial' })

const BAZA = 'paketi_test'
const pgArgs = () => (PG || '').split(' ').filter(Boolean)

function psql(sql: string, baza = BAZA): string {
  return execFileSync('psql', [...pgArgs(), '-d', baza, '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', sql], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}
function psqlDatoteka(pot: string) {
  execFileSync('psql', [...pgArgs(), '-d', BAZA, '-v', 'ON_ERROR_STOP=1', '-q', '-f', pot], { stdio: ['ignore', 'ignore', 'pipe'] })
}
/** Izvede SQL kot prijavljen uporabnik (RLS velja). */
function kot(uid: string, email: string, sql: string): string {
  const claims = JSON.stringify({ sub: uid, email, role: 'authenticated' })
  return psql(`set role authenticated; set request.jwt.claims = '${claims}'; ${sql}`)
}
/** Izvede SQL s strezniskim kljucem (service role). */
function streznik(sql: string): string {
  return psql(`set role service_role; set request.jwt.claims = '{"role":"service_role"}'; ${sql}`)
}
function napaka(fn: () => unknown): string {
  try { fn() } catch (e: any) { return String(e.stderr || e.message) }
  return ''
}

const U = {
  free: '00000000-0000-0000-0000-00000000000f',
  napadalec: '00000000-0000-0000-0000-0000000000aa',
  pro: '00000000-0000-0000-0000-0000000000b1',
  racunovodja: '00000000-0000-0000-0000-0000000000c1',
}
const ORG = {
  free: '10000000-0000-0000-0000-00000000000f',
  trialPro: '10000000-0000-0000-0000-0000000000a1',
  trialPos: '10000000-0000-0000-0000-0000000000a2',
  iztekel: '10000000-0000-0000-0000-0000000000a3',
  pro: '10000000-0000-0000-0000-0000000000b1',
  proPos: '10000000-0000-0000-0000-0000000000b2',
  preklican: '10000000-0000-0000-0000-0000000000c1',
}

test.beforeAll(() => {
  psql(`drop database if exists ${BAZA}`, 'postgres')
  psql(`create database ${BAZA}`, 'postgres')
  psqlDatoteka(join(__dirname, 'fiksture', 'paketi-shema.sql'))
  psqlDatoteka(join(__dirname, '..', '..', '..', 'supabase', 'migrations', '182_revizija_paketov.sql'))
  psql(`
    insert into auth.users values
      ('${U.free}', 'free@test.si'), ('${U.napadalec}', 'napad@test.si'),
      ('${U.pro}', 'pro@test.si'), ('${U.racunovodja}', 'rac@test.si');
    insert into organizations (id, name, subscription_status, trial_ends_at, stripe_subscription_id) values
      ('${ORG.free}', 'free', 'free', null, null),
      ('${ORG.trialPro}', 'trial-pro', 'pro', now() + interval '5 days', null),
      ('${ORG.trialPos}', 'trial-pro_pos', 'pro_pos', now() + interval '14 days', null),
      ('${ORG.iztekel}', 'iztekel', 'pro_pos', now() - interval '1 hour', null),
      ('${ORG.pro}', 'pro', 'pro', null, 'sub_pro'),
      ('${ORG.proPos}', 'pro_pos', 'pro_pos', null, 'sub_pos'),
      ('${ORG.preklican}', 'preklican', 'cancelled', null, null);
    insert into org_members (org_id, user_id, role) values
      ('${ORG.free}', '${U.free}', 'owner'),
      ('${ORG.pro}', '${U.pro}', 'owner');
    -- Vsaka organizacija ima lastnika (kot v produkciji: handle_new_user).
    insert into org_members (org_id, user_id, role)
      select id, gen_random_uuid(), 'owner' from organizations
      where id not in ('${ORG.free}', '${ORG.pro}');
  `)
})

test('efektivni_paket: free, trial-pro, trial-pro_pos, iztekel, pro, pro_pos, preklican', () => {
  const r = psql(`select string_agg(name || '=' || efektivni_paket(id), ',' order by name) from organizations`)
  expect(r).toBe('free=free,iztekel=free,preklican=free,pro=pro,pro_pos=pro_pos,trial-pro=pro,trial-pro_pos=pro_pos')
})

test('Iztekel preizkus s placano narocnino ostane placljiv', () => {
  psql(`update organizations set stripe_subscription_id = 'sub_x' where id = '${ORG.iztekel}'`)
  expect(psql(`select efektivni_paket('${ORG.iztekel}')`)).toBe('pro_pos')
  psql(`update organizations set stripe_subscription_id = null where id = '${ORG.iztekel}'`)
})

// ── K4: 5 racunov ──

test('Free: 5 racunov gre, 6. je zavrnjen v bazi', () => {
  for (let i = 1; i <= 5; i++) kot(U.free, 'free@test.si', `insert into issued_invoices (org_id, invoice_number) values ('${ORG.free}', 'R-${i}')`)
  const e = napaka(() => kot(U.free, 'free@test.si', `insert into issued_invoices (org_id, invoice_number) values ('${ORG.free}', 'R-6')`))
  expect(e).toContain('Brezplačni paket omogoča do 5 računov')
})

test('Free: dobropis (storno) in dobavnica ne stejeta in sta vedno dovoljena', () => {
  kot(U.free, 'free@test.si', `insert into issued_invoices (org_id, invoice_number, invoice_type) values ('${ORG.free}', 'D-1', 'credit_note')`)
  kot(U.free, 'free@test.si', `insert into issued_invoices (org_id, invoice_number, invoice_type) values ('${ORG.free}', 'DOB-1', 'delivery_note')`)
  expect(psql(`select count(*) from issued_invoices where org_id = '${ORG.free}'`)).toBe('7')
})

test('Free: dobropisa ni mogoce naknadno spremeniti v racun', () => {
  const e = napaka(() => kot(U.free, 'free@test.si', `update issued_invoices set invoice_type = 'invoice' where invoice_number = 'D-1'`))
  expect(e).toContain('do 5 računov')
})

test('Free: omejitev velja tudi za service role (ponavljajoci racuni, /api/v1)', () => {
  const e = napaka(() => streznik(`insert into issued_invoices (org_id, invoice_number) values ('${ORG.free}', 'CRON-1')`))
  expect(e).toContain('do 5 računov')
})

test('Pro, preizkus: brez omejitve; iztekel preizkus: omejitev', () => {
  for (let i = 1; i <= 7; i++) streznik(`insert into issued_invoices (org_id, invoice_number) values ('${ORG.pro}', 'P-${i}'), ('${ORG.trialPos}', 'T-${i}')`)
  for (let i = 1; i <= 5; i++) streznik(`insert into issued_invoices (org_id, invoice_number) values ('${ORG.iztekel}', 'I-${i}')`)
  expect(napaka(() => streznik(`insert into issued_invoices (org_id, invoice_number) values ('${ORG.iztekel}', 'I-6')`))).toContain('do 5 računov')
})

// ── K2: narocnina ──

test('Lastnik si NE more sam spremeniti paketa ali podaljsati preizkusa', () => {
  for (const set of [`subscription_status = 'pro_pos'`, `trial_ends_at = now() + interval '1 year'`, `stripe_subscription_id = 'sub_fake'`, `plan_expires_at = '2099-01-01'`, `stripe_customer_id = 'cus_x'`]) {
    const e = napaka(() => kot(U.free, 'free@test.si', `update organizations set ${set} where id = '${ORG.free}'`))
    expect(e, set).toContain('Naročnino lahko spremeni samo strežnik')
  }
  expect(psql(`select subscription_status from organizations where id = '${ORG.free}'`)).toBe('free')
})

test('Lastnik lahko se vedno ureja ostale podatke organizacije', () => {
  kot(U.free, 'free@test.si', `update organizations set name = 'Novo ime' where id = '${ORG.free}'`)
  expect(psql(`select name from organizations where id = '${ORG.free}'`)).toBe('Novo ime')
})

test('Nova organizacija iz brskalnika je vedno free, tudi ce zahteva pro_pos', () => {
  // Brez RETURNING: novo vrstico bi moral uporabnik takoj prebrati, a se ni
  // njen clan (enako pade apps/mobile/app/register.tsx - glej porocilo).
  const id = '20000000-0000-0000-0000-000000000001'
  kot(U.napadalec, 'napad@test.si', `insert into organizations (id, name, subscription_status, trial_ends_at, stripe_subscription_id) values ('${id}', 'X', 'pro_pos', now() + interval '10 years', 'sub_fake')`)
  expect(psql(`select subscription_status || '|' || coalesce(trial_ends_at::text, '-') || '|' || coalesce(stripe_subscription_id, '-') from organizations where id = '${id}'`)).toBe('free|-|-')
})

test('Streznik (webhook) paket lahko spremeni', () => {
  streznik(`update organizations set subscription_status = 'pro', stripe_subscription_id = 'sub_1' where id = '${ORG.preklican}'`)
  expect(psql(`select efektivni_paket('${ORG.preklican}')`)).toBe('pro')
})

// ── K1: clanstvo ──

test('Napadalec se NE more vpisati kot owner v tujo organizacijo', () => {
  const e = napaka(() => kot(U.napadalec, 'napad@test.si', `insert into org_members (org_id, user_id, role) values ('${ORG.proPos}', '${U.napadalec}', 'owner')`))
  expect(e).toContain('row-level security')
  expect(psql(`select count(*) from org_members where user_id = '${U.napadalec}'`)).toBe('0')
})

test('Mobilna registracija: lastnik nove prazne organizacije se lahko vpise', () => {
  const id = '20000000-0000-0000-0000-000000000002'
  kot(U.napadalec, 'napad@test.si', `insert into organizations (id, name) values ('${id}', 'Moja')`)
  kot(U.napadalec, 'napad@test.si', `insert into org_members (org_id, user_id, role) values ('${id}', '${U.napadalec}', 'owner')`)
  expect(psql(`select role from org_members where org_id = '${id}'`)).toBe('owner')
})

test('Povabilo: vstop z veljavnim povabilom gre, povabilo se porabi; drugic ne gre', () => {
  streznik(`insert into org_invites (org_id, email, role, invited_by, expires_at) values ('${ORG.pro}', 'rac@test.si', 'accountant', '${U.pro}', now() + interval '7 days')`)
  kot(U.racunovodja, 'rac@test.si', `insert into org_members (org_id, user_id, role) values ('${ORG.pro}', '${U.racunovodja}', 'accountant')`)
  expect(psql(`select count(*) from org_invites where accepted_at is null`)).toBe('0')
  psql(`delete from org_members where user_id = '${U.racunovodja}'`)
  const e = napaka(() => kot(U.racunovodja, 'rac@test.si', `insert into org_members (org_id, user_id, role) values ('${ORG.pro}', '${U.racunovodja}', 'accountant')`))
  expect(e).toContain('row-level security')
})

test('Povabilo za drugo vlogo ali drug e-naslov ne velja', () => {
  streznik(`insert into org_invites (org_id, email, role, invited_by, expires_at) values ('${ORG.pro}', 'rac@test.si', 'viewer', '${U.pro}', now() + interval '7 days')`)
  expect(napaka(() => kot(U.racunovodja, 'rac@test.si', `insert into org_members (org_id, user_id, role) values ('${ORG.pro}', '${U.racunovodja}', 'admin')`))).toContain('row-level security')
  expect(napaka(() => kot(U.napadalec, 'napad@test.si', `insert into org_members (org_id, user_id, role) values ('${ORG.pro}', '${U.napadalec}', 'viewer')`))).toContain('row-level security')
})

test('Clan, ki ni lastnik/admin, ne more ustvariti povabila', () => {
  streznik(`insert into org_members (org_id, user_id, role) values ('${ORG.pro}', '${U.racunovodja}', 'accountant')`)
  const e = napaka(() => kot(U.racunovodja, 'rac@test.si', `insert into org_invites (org_id, email, role, invited_by) values ('${ORG.pro}', 'napad@test.si', 'admin', '${U.pro}')`))
  expect(e).toContain('row-level security')
})

// ── Vloge po paketu ──

test('Free: racunovodje in blagajnika ni mogoce dodati (tudi streznik ne)', () => {
  expect(napaka(() => streznik(`insert into org_members (org_id, user_id, role) values ('${ORG.free}', '${U.racunovodja}', 'accountant')`))).toContain('Dostop za računovodjo')
  expect(napaka(() => streznik(`insert into org_members (org_id, user_id, role) values ('${ORG.free}', '${U.racunovodja}', 'cashier')`))).toContain('Pro + POS')
})

test('Pro: racunovodja da, blagajnik ne; Pro + POS: blagajnik da', () => {
  expect(napaka(() => streznik(`insert into org_members (org_id, user_id, role) values ('${ORG.pro}', '${U.napadalec}', 'cashier')`))).toContain('Pro + POS')
  streznik(`insert into org_members (org_id, user_id, role) values ('${ORG.proPos}', '${U.napadalec}', 'cashier')`)
  expect(psql(`select role from org_members where org_id = '${ORG.proPos}' and user_id = '${U.napadalec}'`)).toBe('cashier')
})

test('Migracija je idempotentna', () => {
  psqlDatoteka(join(__dirname, '..', '..', '..', 'supabase', 'migrations', '182_revizija_paketov.sql'))
  expect(readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'migrations', '182_revizija_paketov.sql'), 'utf8')).toContain('efektivni_paket')
})
