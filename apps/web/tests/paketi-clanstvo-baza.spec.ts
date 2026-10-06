import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

/**
 * MIGRACIJA 181b – ZASCITA CLANSTVA (K1) IN NAROCNINE (K2), lokalni PostgreSQL
 *
 * Posnetek produkcijske sheme (tests/fiksture/paketi-shema.sql) z obstojecimi
 * organizacijami -> 181b. Preveri, da vabila v ekipo delujejo naprej, da se
 * nihce ne more vec vpisati v tujo organizacijo ali si sam spremeniti paketa,
 * da se podatki ne spremenijo, ter skupno delovanje s 182 in obe obratni migraciji.
 *
 * Zagon:
 *   PAKETI_PG="-h /tmp -p 54329 -U postgres" npx playwright test tests/paketi-clanstvo-baza.spec.ts
 */

const PG = process.env.PAKETI_PG
test.skip(!PG, 'PAKETI_PG ni nastavljen (lokalni PostgreSQL)')
test.describe.configure({ mode: 'serial' })

const BAZA = 'paketi_clanstvo_test'
const MIG = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const pgArgs = () => (PG || '').split(' ').filter(Boolean)

function psql(sql: string, baza = BAZA): string {
  return execFileSync('psql', [...pgArgs(), '-d', baza, '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', sql], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}
function datoteka(ime: string) {
  execFileSync('psql', [...pgArgs(), '-d', BAZA, '-v', 'ON_ERROR_STOP=1', '-q', '-1', '-f', ime.startsWith('/') ? ime : join(MIG, ime)], { stdio: ['ignore', 'ignore', 'pipe'] })
}
function kot(uid: string, email: string, sql: string): string {
  const claims = JSON.stringify({ sub: uid, email, role: 'authenticated' })
  return psql(`set role authenticated; set request.jwt.claims = '${claims}'; ${sql}`)
}
function streznik(sql: string): string {
  return psql(`set role service_role; set request.jwt.claims = '{"role":"service_role"}'; ${sql}`)
}
function napaka(fn: () => unknown): string {
  try { fn() } catch (e: any) { return String(e.stderr || e.message) }
  return ''
}

const U = {
  lastnik: '00000000-0000-0000-0000-000000000001',
  blagajnik: '00000000-0000-0000-0000-000000000002',
  napadalec: '00000000-0000-0000-0000-0000000000aa',
  povabljen: '00000000-0000-0000-0000-000000000003',
  racunovodja: '00000000-0000-0000-0000-000000000004',
}
const ORG = { sirm: '10000000-0000-0000-0000-000000000001', free: '10000000-0000-0000-0000-00000000000f' }

const POLITIKE = `select string_agg(tablename || ':' || policyname || ':' || permissive || ':' || cmd || ':' || coalesce(qual, '-') || ':' || coalesce(with_check, '-'), E'\\n' order by tablename, policyname)
  from pg_policies where tablename in ('org_members', 'org_invites', 'organizations', 'orders', 'issued_invoices')`
const PODATKI = `select string_agg(concat_ws('|', id, subscription_status, plan, trial_ends_at, plan_expires_at, stripe_customer_id, stripe_subscription_id, updated_at), E'\\n' order by id) from organizations`
let politikePred = '', podatkiPred = ''

test.beforeAll(() => {
  psql(`drop database if exists ${BAZA}`, 'postgres')
  psql(`create database ${BAZA}`, 'postgres')
  datoteka(join(__dirname, 'fiksture', 'paketi-shema.sql'))
  psql(`
    insert into auth.users (id, email) values
      ('${U.lastnik}', 'lastnik@test.si'), ('${U.blagajnik}', 'blag@test.si'), ('${U.napadalec}', 'napad@test.si'),
      ('${U.povabljen}', 'nov.clan@test.si'), ('${U.racunovodja}', 'rac@test.si');
    delete from org_members; delete from organizations;
    insert into organizations (id, name, subscription_status, plan_expires_at, stripe_customer_id) values
      ('${ORG.sirm}', 'sirm', 'pro_pos', '2099-12-31', 'cus_sirm'),
      ('${ORG.free}', 'free', 'free', null, 'cus_free');
    insert into org_members (org_id, user_id, role) values
      ('${ORG.sirm}', '${U.lastnik}', 'owner'), ('${ORG.sirm}', '${U.blagajnik}', 'cashier'),
      ('${ORG.free}', gen_random_uuid(), 'owner');
  `)
  politikePred = psql(POLITIKE)
  podatkiPred = psql(PODATKI)
  datoteka('181b_zascita_clanstva_in_narocnine.sql')
})

test('Podatki organizacij po 181b NATANKO enaki (tudi updated_at)', () => {
  expect(psql(PODATKI)).toBe(podatkiPred)
})

// ── K1 ──
test('K1: napadalec se NE more vpisati kot owner v tujo organizacijo (tudi Free)', () => {
  for (const org of [ORG.sirm, ORG.free]) {
    expect(napaka(() => kot(U.napadalec, 'napad@test.si', `insert into org_members (org_id, user_id, role) values ('${org}', '${U.napadalec}', 'owner')`))).toContain('row-level security')
  }
  expect(psql(`select count(*) from org_members where user_id = '${U.napadalec}'`)).toBe('0')
})

test('K1: napadalec ne more vpisati niti nekoga drugega', () => {
  expect(napaka(() => kot(U.napadalec, 'napad@test.si', `insert into org_members (org_id, user_id, role) values ('${ORG.sirm}', '${U.povabljen}', 'admin')`))).toContain('row-level security')
})

test('Vabila: Nastavitve -> Ekipa (lastnik ustvari povabilo) deluje', () => {
  kot(U.lastnik, 'lastnik@test.si', `insert into org_invites (org_id, email, role, invited_by, expires_at) values ('${ORG.sirm}', 'nov.clan@test.si', 'cashier', '${U.lastnik}', now() + interval '7 days')`)
  expect(kot(U.lastnik, 'lastnik@test.si', `select count(*) from org_invites where org_id = '${ORG.sirm}'`)).toBe('1')
})

test('Vabila: blagajnik (ne lastnik/admin) NE more ustvariti povabila', () => {
  expect(napaka(() => kot(U.blagajnik, 'blag@test.si', `insert into org_invites (org_id, email, role) values ('${ORG.sirm}', 'napad@test.si', 'admin')`))).toContain('row-level security')
  // vidi pa jih kot doslej
  expect(kot(U.blagajnik, 'blag@test.si', `select count(*) from org_invites where org_id = '${ORG.sirm}'`)).toBe('1')
})

test('Vabila: povabljenec vidi SVOJE povabilo (/invite/[id]), tujega ne', () => {
  expect(kot(U.povabljen, 'nov.clan@test.si', `select count(*) from org_invites`)).toBe('1')
  expect(kot(U.napadalec, 'napad@test.si', `select count(*) from org_invites`)).toBe('0')
})

test('Vabila: napacna vloga ali tuj e-naslov ne velja', () => {
  expect(napaka(() => kot(U.povabljen, 'nov.clan@test.si', `insert into org_members (org_id, user_id, role) values ('${ORG.sirm}', '${U.povabljen}', 'owner')`))).toContain('row-level security')
  expect(napaka(() => kot(U.napadalec, 'napad@test.si', `insert into org_members (org_id, user_id, role) values ('${ORG.sirm}', '${U.napadalec}', 'cashier')`))).toContain('row-level security')
})

test('Vabila: sprejem na /invite/[id] deluje, povabilo se porabi, drugic ne gre', () => {
  kot(U.povabljen, 'nov.clan@test.si', `insert into org_members (org_id, user_id, role) values ('${ORG.sirm}', '${U.povabljen}', 'cashier')`)
  // stran poskusi oznaciti povabilo sama - brez napake (0 vrstic), sprozilec ga je ze porabil
  kot(U.povabljen, 'nov.clan@test.si', `update org_invites set accepted_at = now() where org_id = '${ORG.sirm}'`)
  expect(psql(`select count(*) from org_invites where accepted_at is null`)).toBe('0')
  psql(`delete from org_members where user_id = '${U.povabljen}'`)
  expect(napaka(() => kot(U.povabljen, 'nov.clan@test.si', `insert into org_members (org_id, user_id, role) values ('${ORG.sirm}', '${U.povabljen}', 'cashier')`))).toContain('row-level security')
})

test('Vabila: /api/team/invite (service role doda clana neposredno) deluje kot doslej', () => {
  streznik(`insert into org_members (org_id, user_id, role, invited_by) values ('${ORG.sirm}', '${U.racunovodja}', 'accountant', '${U.lastnik}')`)
  expect(psql(`select role from org_members where user_id = '${U.racunovodja}'`)).toBe('accountant')
})

test('Sprememba vloge in odstranitev clana (/api/team/change-role, remove-member - service role) delujeta', () => {
  // Opomba: produkcijski politiki members_update/delete_owner_admin se sklicujeta
  // na org_members znotraj org_members (PostgreSQL: infinite recursion), zato
  // aplikacija to dela prek API s service role. 181b tega ne spreminja.
  streznik(`update org_members set role = 'viewer' where user_id = '${U.racunovodja}'`)
  streznik(`delete from org_members where user_id = '${U.racunovodja}'`)
  expect(psql(`select count(*) from org_members where user_id = '${U.racunovodja}'`)).toBe('0')
})

test('Stara mobilna registracija: lastnik nove prazne organizacije se lahko vpise', () => {
  const id = '40000000-0000-0000-0000-000000000001'
  kot(U.napadalec, 'napad@test.si', `insert into organizations (id, name) values ('${id}', 'Moja')`)
  kot(U.napadalec, 'napad@test.si', `insert into org_members (org_id, user_id, role) values ('${id}', '${U.napadalec}', 'owner')`)
})

// ── K2 ──
test('K2: lastnik si NE more sam spremeniti paketa, preizkusa ali Stripe povezave', () => {
  for (const set of [`subscription_status = 'free'`, `plan = 'pro'`, `trial_ends_at = now() + interval '1 year'`, `plan_expires_at = '2100-01-01'`, `stripe_customer_id = 'cus_x'`, `stripe_subscription_id = 'sub_x'`]) {
    expect(napaka(() => kot(U.lastnik, 'lastnik@test.si', `update organizations set ${set} where id = '${ORG.sirm}'`)), set).toContain('Naročnino lahko spremeni samo strežnik')
  }
})

test('K2: lastnik lahko se vedno ureja ostale podatke (tudi z nespremenjenimi stolpci narocnine v istem UPDATE)', () => {
  kot(U.lastnik, 'lastnik@test.si', `update organizations set name = 'ŠIRM', subscription_status = subscription_status, stripe_customer_id = stripe_customer_id where id = '${ORG.sirm}'`)
  expect(psql(`select name || '|' || subscription_status from organizations where id = '${ORG.sirm}'`)).toBe('ŠIRM|pro_pos')
})

test('K2: organizacija iz brskalnika z zahtevanim pro_pos je free', () => {
  const id = '40000000-0000-0000-0000-000000000002'
  kot(U.napadalec, 'napad@test.si', `insert into organizations (id, name, subscription_status, plan, trial_ends_at, stripe_subscription_id) values ('${id}', 'X', 'pro_pos', 'pro', now() + interval '9 years', 'sub_fake')`)
  expect(psql(`select subscription_status || '|' || plan || '|' || coalesce(trial_ends_at::text, '-') || '|' || coalesce(stripe_subscription_id, '-') from organizations where id = '${id}'`)).toBe('free|solo|-|-')
})

test('K2: webhook/checkout (service role) in pg_cron (postgres) smeta spreminjati narocnino', () => {
  streznik(`update organizations set stripe_customer_id = 'cus_novi' where id = '${ORG.free}'`)
  psql(`update organizations set stripe_customer_id = 'cus_free' where id = '${ORG.free}'`) // postgres = pg_cron / SQL urejevalnik
  expect(psql(`select stripe_customer_id from organizations where id = '${ORG.free}'`)).toBe('cus_free')
})

test('Registracija (handle_new_user) deluje: ena organizacija, pro_pos, 14 dni', () => {
  psql(`insert into auth.users (id, email, raw_user_meta_data) values ('30000000-0000-0000-0000-000000000001', 'reg@test.si', '{"full_name":"Reg"}')`)
  expect(psql(`select count(*) || '|' || min(subscription_status) || '|' || round(extract(epoch from (min(trial_ends_at) - now())) / 86400)
    from organizations o join org_members m on m.org_id = o.id where m.user_id = '30000000-0000-0000-0000-000000000001'`)).toBe('1|pro_pos|14')
})

// ── Skupaj s 182 in obratni migraciji ──
test('181b + 182 skupaj: K1/K2 ostaneta zaprta, 182 deluje; idempotentnost', () => {
  datoteka('182_revizija_paketov.sql')
  datoteka('181b_zascita_clanstva_in_narocnine.sql')
  expect(napaka(() => kot(U.napadalec, 'napad@test.si', `insert into org_members (org_id, user_id, role) values ('${ORG.sirm}', '${U.napadalec}', 'owner')`))).toContain('row-level security')
  expect(napaka(() => kot(U.lastnik, 'lastnik@test.si', `update organizations set subscription_status = 'free' where id = '${ORG.sirm}'`))).toContain('samo strežnik')
  expect(psql(`select bool_and(obstojeca_pravila) from organizations where id in ('${ORG.sirm}', '${ORG.free}')`)).toBe('t')
})

test('182_down in 181b_down: politike natanko kot pred 181b', () => {
  datoteka('182_revizija_paketov_down.sql')
  datoteka('181b_zascita_clanstva_in_narocnine_down.sql')
  expect(psql(POLITIKE)).toBe(politikePred)
  expect(psql(`select count(*) from pg_trigger where tgname in ('trg_zasciti_stolpce_narocnine', 'trg_porabi_povabilo_ob_vstopu')`)).toBe('0')
  // stara luknja je spet tu - dokaz, da je down res obraten
  kot(U.napadalec, 'napad@test.si', `insert into org_members (org_id, user_id, role) values ('${ORG.free}', '${U.napadalec}', 'owner')`)
})
