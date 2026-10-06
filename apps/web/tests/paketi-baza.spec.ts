import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

/**
 * REVIZIJA PAKETOV – MIGRACIJA 182 NA LOKALNEM PostgreSQL
 *
 * Vsak zagon ustvari svezo bazo s posnetkom produkcijske sheme PRED
 * migracijo (tests/fiksture/paketi-shema.sql), vanjo vstavi OBSTOJECE
 * organizacije vseh tipov, naredi posnetek stanja, uporabi 182 in preveri:
 *   1. REGRESIJA OBSTOJECIH: podatki in vse, kar so lahko pocele, ostane enako
 *   2. NOVE organizacije: nova pravila (5 racunov, narocnina, blagajna, vloge, clanstvo)
 *   3. registracija (tudi mobilna): organizacija natanko enkrat, preizkus 14 dni
 *   4. obratna migracija 182_down in ponovna uporaba 182
 *
 * Zagon:
 *   PAKETI_PG="-h /tmp -p 54329 -U postgres" npx playwright test tests/paketi-baza.spec.ts
 * Brez PAKETI_PG se testi preskocijo.
 */

const PG = process.env.PAKETI_PG
test.skip(!PG, 'PAKETI_PG ni nastavljen (lokalni PostgreSQL)')
test.describe.configure({ mode: 'serial' })

const BAZA = 'paketi_test'
const MIGRACIJE = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const pgArgs = () => (PG || '').split(' ').filter(Boolean)

function psql(sql: string, baza = BAZA): string {
  return execFileSync('psql', [...pgArgs(), '-d', baza, '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', sql], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}
function datoteka(pot: string) {
  execFileSync('psql', [...pgArgs(), '-d', BAZA, '-v', 'ON_ERROR_STOP=1', '-q', '-1', '-f', pot], { stdio: ['ignore', 'ignore', 'pipe'] })
}
const gor = () => datoteka(join(MIGRACIJE, '182_revizija_paketov.sql'))
const dol = () => datoteka(join(MIGRACIJE, '182_revizija_paketov_down.sql'))

/** SQL kot prijavljen uporabnik (RLS velja). */
function kot(uid: string, email: string, sql: string): string {
  const claims = JSON.stringify({ sub: uid, email, role: 'authenticated' })
  return psql(`set role authenticated; set request.jwt.claims = '${claims}'; ${sql}`)
}
/** SQL s strezniskim kljucem (service role). */
function streznik(sql: string): string {
  return psql(`set role service_role; set request.jwt.claims = '{"role":"service_role"}'; ${sql}`)
}
function napaka(fn: () => unknown): string {
  try { fn() } catch (e: any) { return String(e.stderr || e.message) }
  return ''
}

// Uporabniki
const U = {
  free: '00000000-0000-0000-0000-00000000000f',
  pos: '00000000-0000-0000-0000-0000000000b2',
  napadalec: '00000000-0000-0000-0000-0000000000aa',
  racunovodja: '00000000-0000-0000-0000-0000000000c1',
}
// OBSTOJECE organizacije (nastanejo PRED migracijo) - vsi tipi iz produkcije
const OBST = {
  free: '10000000-0000-0000-0000-00000000000f',       // kot Domen Erzen: Free z vec kot 5 racuni
  freePos: '10000000-0000-0000-0000-0000000000f2',    // kot Aljosa: Free, ki uporablja blagajno
  pro: '10000000-0000-0000-0000-0000000000b1',
  proPos: '10000000-0000-0000-0000-0000000000b2',     // kot SIRM: Pro + POS, rocno dodeljen
  preizkus: '10000000-0000-0000-0000-0000000000a1',
  iztekel: '10000000-0000-0000-0000-0000000000a3',
}
const BIZ = { freePos: '20000000-0000-0000-0000-0000000000f2', proPos: '20000000-0000-0000-0000-000000000001' }

// Stolpci, ki se za obstojece NE smejo spremeniti
const POSNETEK = `select string_agg(concat_ws('|', id, name, plan, subscription_status, trial_ends_at, plan_expires_at,
  stripe_customer_id, stripe_subscription_id, tax_number, pos_business_id, created_at, updated_at), E'\\n' order by id)
  from organizations where id::text like '10000000-%'`
let posnetekPred = ''

test.beforeAll(() => {
  psql(`drop database if exists ${BAZA}`, 'postgres')
  psql(`create database ${BAZA}`, 'postgres')
  datoteka(join(__dirname, 'fiksture', 'paketi-shema.sql'))
  psql(`
    insert into auth.users (id, email) values
      ('${U.free}', 'free@test.si'), ('${U.pos}', 'pos@test.si'),
      ('${U.napadalec}', 'napad@test.si'), ('${U.racunovodja}', 'rac@test.si');
    -- auth.users vstavek zgoraj je ustvaril 4 organizacije prek handle_new_user
    -- (PRED migracijo -> obstojece). Pocistimo, da so testne organizacije jasne.
    delete from org_members; delete from organizations;
    insert into organizations (id, name, subscription_status, trial_ends_at, plan_expires_at, stripe_customer_id, pos_business_id) values
      ('${OBST.free}', 'obst-free', 'free', null, null, 'cus_free', null),
      ('${OBST.freePos}', 'obst-free-pos', 'free', null, null, null, '${BIZ.freePos}'),
      ('${OBST.pro}', 'obst-pro', 'pro', null, '2027-08-27', null, null),
      ('${OBST.proPos}', 'obst-pro_pos', 'pro_pos', null, '2099-12-31', 'cus_sirm', '${BIZ.proPos}'),
      ('${OBST.preizkus}', 'obst-preizkus', 'pro_pos', now() + interval '5 days', null, null, null),
      ('${OBST.iztekel}', 'obst-iztekel', 'pro_pos', now() - interval '2 days', null, null, null);
    insert into org_members (org_id, user_id, role) values
      ('${OBST.free}', '${U.free}', 'owner'), ('${OBST.freePos}', '${U.free}', 'owner'),
      ('${OBST.proPos}', '${U.pos}', 'owner');
    insert into org_members (org_id, user_id, role)
      select id, gen_random_uuid(), 'owner' from organizations where id not in ('${OBST.free}', '${OBST.freePos}', '${OBST.proPos}');
    insert into issued_invoices (org_id, invoice_number)
      select '${OBST.free}', 'R-' || g from generate_series(1, 45) g;
  `)
  posnetekPred = psql(POSNETEK)
  gor()
})

// ═══════════════ 1. REGRESIJA OBSTOJECIH ═══════════════

test('Obstojece: podatki po migraciji NATANKO enaki (tudi updated_at)', () => {
  expect(psql(POSNETEK)).toBe(posnetekPred)
})

test('Obstojece: vse oznacene z obstojeca_pravila = true, nove privzeto false', () => {
  expect(psql(`select bool_and(obstojeca_pravila) from organizations`)).toBe('t')
  expect(psql(`select column_default from information_schema.columns where table_name = 'organizations' and column_name = 'obstojeca_pravila'`)).toBe('false')
})

test('Obstojece: efektivni_paket kot doslej (tudi iztekel preizkus ostane pro_pos)', () => {
  const r = psql(`select string_agg(name || '=' || efektivni_paket(id), ',' order by name) from organizations`)
  expect(r).toBe('obst-free=free,obst-free-pos=free,obst-iztekel=pro_pos,obst-preizkus=pro_pos,obst-pro=pro,obst-pro_pos=pro_pos')
})

test('Obstojece: org_dovoljeno vedno true (vse funkcije, vsi tipi)', () => {
  expect(psql(`select bool_and(org_dovoljeno(o.id, f)) from organizations o,
    unnest(array['furs','email','ai','izvoz','racunovodja','pos','zaloge','ekipa_pin','pos_kartica']) f`)).toBe('t')
})

test('Obstojeca Free (45 racunov) lahko izda 46. racun - uporabnik in streznik', () => {
  kot(U.free, 'free@test.si', `insert into issued_invoices (org_id, invoice_number) values ('${OBST.free}', 'R-46')`)
  streznik(`insert into issued_invoices (org_id, invoice_number) values ('${OBST.free}', 'R-47')`)
  expect(psql(`select count(*) from issued_invoices where org_id = '${OBST.free}'`)).toBe('47')
})

test('Obstojeca Free, ki uporablja blagajno: vnos narocila deluje', () => {
  kot(U.free, 'free@test.si', `insert into orders (business_id, total) values ('${BIZ.freePos}', 3.5)`)
  expect(psql(`select count(*) from orders where business_id = '${BIZ.freePos}'`)).toBe('1')
})

test('Obstojeca Pro + POS (placeholder business_id): vnos narocila deluje', () => {
  kot(U.pos, 'pos@test.si', `insert into orders (business_id, total) values ('${BIZ.proPos}', 12)`)
  expect(psql(`select count(*) from orders where business_id = '${BIZ.proPos}'`)).toBe('1')
})

test('Obstojece: lastnik lahko ureja organizacijo kot doslej (tudi stolpce narocnine)', () => {
  // Kot doslej - glej porocilo (K2 za obstojece ostaja odprt, po pravilu 1).
  kot(U.free, 'free@test.si', `update organizations set name = 'obst-free' , stripe_customer_id = 'cus_free' where id = '${OBST.free}'`)
  const e = napaka(() => kot(U.free, 'free@test.si', `update organizations set plan_expires_at = plan_expires_at where id = '${OBST.free}'`))
  expect(e).toBe('')
})

test('Obstojece: vpis clana in povabila kot doslej (K1 za obstojece ostaja odprt)', () => {
  kot(U.racunovodja, 'rac@test.si', `insert into org_members (org_id, user_id, role) values ('${OBST.pro}', '${U.racunovodja}', 'accountant')`)
  kot(U.racunovodja, 'rac@test.si', `insert into org_invites (org_id, email, role) values ('${OBST.pro}', 'x@test.si', 'viewer')`)
  psql(`delete from org_members where user_id = '${U.racunovodja}'; delete from org_invites;`)
})

test('Obstojeca Free: racunovodja in blagajnik se lahko dodata kot doslej', () => {
  streznik(`insert into org_members (org_id, user_id, role) values ('${OBST.free}', '${U.racunovodja}', 'accountant')`)
  streznik(`update org_members set role = 'cashier' where org_id = '${OBST.free}' and user_id = '${U.racunovodja}'`)
  psql(`delete from org_members where user_id = '${U.racunovodja}'`)
})

test('Oznake obstojeca_pravila ne more spremeniti nihce razen streznika', () => {
  const e = napaka(() => kot(U.free, 'free@test.si', `update organizations set obstojeca_pravila = false where id = '${OBST.free}'`))
  expect(e).toContain('Oznake pravil organizacije ni mogoče spremeniti')
})

// ═══════════════ 2. REGISTRACIJA ═══════════════

const NOV = { splet: '30000000-0000-0000-0000-000000000001', mobilna: '30000000-0000-0000-0000-000000000002' }

test('Spletna registracija: natanko ena nova organizacija, preizkus 14 dni, obstojeca_pravila = false', () => {
  psql(`insert into auth.users (id, email, raw_user_meta_data) values ('${NOV.splet}', 'nova@test.si', '{"full_name":"Nova Ana"}')`)
  const r = psql(`select count(*) || '|' || min(o.name) || '|' || min(o.subscription_status) || '|' || bool_and(o.obstojeca_pravila)
    || '|' || round(extract(epoch from (min(o.trial_ends_at) - now())) / 86400) || '|' || min(m.role)
    from organizations o join org_members m on m.org_id = o.id where m.user_id = '${NOV.splet}'`)
  expect(r).toBe('1|Nova Ana s.p.|pro_pos|false|14|owner')
})

test('Mobilna registracija (samo signUp z org_name/tax_number): organizacija natanko enkrat', () => {
  psql(`insert into auth.users (id, email, raw_user_meta_data) values ('${NOV.mobilna}', 'mob@test.si',
        '{"full_name":"Mobi","org_name":"Frizerstvo Mobi","tax_number":"12345678"}')`)
  const r = psql(`select count(*) || '|' || min(o.name) || '|' || min(o.tax_number) || '|' || round(extract(epoch from (min(o.trial_ends_at) - now())) / 86400)
    from organizations o join org_members m on m.org_id = o.id where m.user_id = '${NOV.mobilna}'`)
  expect(r).toBe('1|Frizerstvo Mobi|12345678|14')
  expect(psql(`select count(*) from org_members where user_id = '${NOV.mobilna}'`)).toBe('1')
})

// ═══════════════ 3. NOVE ORGANIZACIJE ═══════════════

const orgOd = (uid: string) => psql(`select org_id from org_members where user_id = '${uid}'`)

test('Nova: med preizkusom brez omejitve racunov; po izteku 6. racun zavrnjen', () => {
  const org = orgOd(NOV.splet)
  for (let i = 1; i <= 6; i++) kot(NOV.splet, 'nova@test.si', `insert into issued_invoices (org_id, invoice_number) values ('${org}', 'N-${i}')`)
  // iztek preizkusa (kot da so minili 14 dni) - samo streznik
  streznik(`update organizations set trial_ends_at = now() - interval '1 minute' where id = '${org}'`)
  expect(psql(`select efektivni_paket('${org}')`)).toBe('free')
  const e = napaka(() => kot(NOV.splet, 'nova@test.si', `insert into issued_invoices (org_id, invoice_number) values ('${org}', 'N-7')`))
  expect(e).toContain('Brezplačni paket omogoča do 5 računov')
})

test('Nova Free: dobropis in dobavnica sta vedno dovoljena, dobropisa ni mogoce spremeniti v racun', () => {
  const org = orgOd(NOV.splet)
  kot(NOV.splet, 'nova@test.si', `insert into issued_invoices (org_id, invoice_number, invoice_type) values ('${org}', 'D-1', 'credit_note'), ('${org}', 'DOB-1', 'delivery_note')`)
  expect(napaka(() => kot(NOV.splet, 'nova@test.si', `update issued_invoices set invoice_type = 'invoice' where invoice_number = 'D-1'`))).toContain('do 5 računov')
})

test('Nova Free: omejitev velja tudi za service role', () => {
  expect(napaka(() => streznik(`insert into issued_invoices (org_id, invoice_number) values ('${orgOd(NOV.splet)}', 'CRON-1')`))).toContain('do 5 računov')
})

test('Nova: lastnik si NE more sam spremeniti narocnine ali oznake', () => {
  const org = orgOd(NOV.splet)
  // (status je 'pro_pos' iz preizkusa - sprememba mora biti DEJANSKA, zato 'pro')
  for (const set of [`subscription_status = 'pro'`, `trial_ends_at = now() + interval '1 year'`, `stripe_subscription_id = 'sub_x'`, `plan_expires_at = '2099-01-01'`, `stripe_customer_id = 'cus_x'`]) {
    expect(napaka(() => kot(NOV.splet, 'nova@test.si', `update organizations set ${set} where id = '${org}'`)), set).toContain('Naročnino lahko spremeni samo strežnik')
  }
  expect(napaka(() => kot(NOV.splet, 'nova@test.si', `update organizations set obstojeca_pravila = true where id = '${org}'`))).toContain('Oznake pravil')
  kot(NOV.splet, 'nova@test.si', `update organizations set name = 'Nova Ana s.p.' where id = '${org}'`)
})

test('Organizacija, vstavljena iz brskalnika, je vedno nova in free', () => {
  const id = '40000000-0000-0000-0000-000000000001'
  kot(U.napadalec, 'napad@test.si', `insert into organizations (id, name, subscription_status, trial_ends_at, stripe_subscription_id, obstojeca_pravila)
    values ('${id}', 'X', 'pro_pos', now() + interval '10 years', 'sub_fake', true)`)
  expect(psql(`select subscription_status || '|' || coalesce(trial_ends_at::text, '-') || '|' || coalesce(stripe_subscription_id, '-') || '|' || obstojeca_pravila from organizations where id = '${id}'`)).toBe('free|-|-|false')
})

test('Nova Free: vnos narocila blagajne zavrnjen; nova Pro + POS (preizkus): dovoljen', () => {
  const free = orgOd(NOV.splet), pos = orgOd(NOV.mobilna)
  expect(napaka(() => kot(NOV.splet, 'nova@test.si', `insert into orders (business_id) values ('${free}')`))).toContain('row-level security')
  kot(NOV.mobilna, 'mob@test.si', `insert into orders (business_id) values ('${pos}')`)
  expect(psql(`select count(*) from orders where business_id = '${pos}'`)).toBe('1')
})

test('Nova: napadalec se ne more vpisati v tujo novo organizacijo', () => {
  expect(napaka(() => kot(U.napadalec, 'napad@test.si', `insert into org_members (org_id, user_id, role) values ('${orgOd(NOV.mobilna)}', '${U.napadalec}', 'owner')`))).toContain('row-level security')
})

test('Nova: povabilo deluje in se porabi; drug e-naslov/vloga ne; clan ne-admin ne more vabiti', () => {
  const org = orgOd(NOV.mobilna)
  kot(NOV.mobilna, 'mob@test.si', `insert into org_invites (org_id, email, role, invited_by, expires_at) values ('${org}', 'rac@test.si', 'accountant', '${NOV.mobilna}', now() + interval '7 days')`)
  expect(napaka(() => kot(U.racunovodja, 'rac@test.si', `insert into org_members (org_id, user_id, role) values ('${org}', '${U.racunovodja}', 'admin')`))).toContain('row-level security')
  kot(U.racunovodja, 'rac@test.si', `insert into org_members (org_id, user_id, role) values ('${org}', '${U.racunovodja}', 'accountant')`)
  expect(psql(`select count(*) from org_invites where org_id = '${org}' and accepted_at is null`)).toBe('0')
  expect(napaka(() => kot(U.racunovodja, 'rac@test.si', `insert into org_invites (org_id, email, role, invited_by) values ('${org}', 'napad@test.si', 'admin', '${NOV.mobilna}')`))).toContain('row-level security')
})

test('Nova: vloge po paketu (Free brez racunovodje/blagajnika, Pro + POS z obema)', () => {
  expect(napaka(() => streznik(`insert into org_members (org_id, user_id, role) values ('${orgOd(NOV.splet)}', '${U.napadalec}', 'accountant')`))).toContain('Dostop za računovodjo')
  expect(napaka(() => streznik(`insert into org_members (org_id, user_id, role) values ('${orgOd(NOV.splet)}', '${U.napadalec}', 'cashier')`))).toContain('Pro + POS')
  streznik(`insert into org_members (org_id, user_id, role) values ('${orgOd(NOV.mobilna)}', '${U.napadalec}', 'cashier')`)
})

// ═══════════════ 4. OBRATNA MIGRACIJA ═══════════════

test('182_down: vse dodano odstranjeno, obstojece natanko kot pred 182', () => {
  dol()
  expect(psql(`select count(*) from information_schema.columns where table_name = 'organizations' and column_name in ('obstojeca_pravila','preizkus_opomnik_3d_ob','preizkus_opomnik_0d_ob')`)).toBe('0')
  expect(psql(`select count(*) from pg_proc where proname in ('efektivni_paket','org_dovoljeno','zasciti_narocnino','omeji_brezplacne_racune','pos_narocilo_dovoljeno','sme_vstopiti_v_org')`)).toBe('0')
  expect(psql(`select count(*) from pg_policies where policyname in ('orders_insert_paket','org_members_insert_nova_org','org_invites_insert_nova_org')`)).toBe('0')
  // obstojece politike so ostale
  expect(psql(`select count(*) from pg_policies where policyname in ('Business scope','users_can_insert_members','org members only')`)).toBe('3')
  // posnetek obstojecih (brez updated_at: test je obst-free sam posodobil z enakimi vrednostmi)
  const po = psql(POSNETEK).split('\n').map(v => v.split('|').slice(0, -1).join('|'))
  const pred = posnetekPred.split('\n').map(v => v.split('|').slice(0, -1).join('|'))
  expect(po).toEqual(pred)
  // registracija po down: kot pred 182 (ime iz full_name, brez davcne)
  psql(`insert into auth.users (id, email, raw_user_meta_data) values ('30000000-0000-0000-0000-000000000009', 'po@test.si', '{"full_name":"Po","org_name":"Ne"}')`)
  expect(psql(`select o.name from organizations o join org_members m on m.org_id = o.id where m.user_id = '30000000-0000-0000-0000-000000000009'`)).toBe('Po s.p.')
})

test('Ponovna uporaba 182 po down in dvakratna uporaba (idempotentnost)', () => {
  gor(); gor()
  expect(psql(`select bool_and(obstojeca_pravila) from organizations where id::text like '10000000-%'`)).toBe('t')
})
