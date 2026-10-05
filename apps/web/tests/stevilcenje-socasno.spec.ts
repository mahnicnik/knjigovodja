import { test, expect } from '@playwright/test'
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * REVIZIJA K4: ENO ZAPOREDJE DAVČNIH ŠTEVILK — SOČASNA IZDAJA
 *
 * Teče na PRAVEM PostgreSQL (ne na lazni bazi), ker gre za zaklepanje vrstic
 * med vec hkratnimi povezavami. Vsak klic je locen proces `psql` = locena
 * povezava, zato so klici res socasni.
 *
 * Zahteva prazno testno bazo (NE produkcijo - test brise in ustvari tabele):
 *   TEST_PG_URL=postgresql://racunko_test:racunko_test@localhost:5432/racunko_test \
 *     npx playwright test tests/stevilcenje-socasno.spec.ts
 * Lokalno bazo pripravi skripte/zacasna-pg.sh. Brez TEST_PG_URL se test preskoci.
 *
 * Scenarij posnema test s.p. (5.10.2026): nacin "device", blagajna je
 * porabila -1..-3 (stevec po napravi = 3), racuni s portala/Stripe pa -2..-7
 * iz STAREGA centralnega stevca (= 7) -> -2 in -3 sta podvojeni.
 */

const URL = process.env.TEST_PG_URL
const imaPsql = spawnSync('psql', ['--version']).status === 0
const MIGRACIJA = readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'migrations', '177_enotno_stevilcenje.sql'), 'utf8')

test.skip(!URL || !imaPsql, 'Nastavi TEST_PG_URL na PRAZNO testno bazo (glej skripte/zacasna-pg.sh) in namesti psql.')
test.describe.configure({ mode: 'serial' })

const B = '41f82ae9-0000-0000-0000-000000000001'   // blagajna test s.p. (nacin device)
const P = 'a0169e53-0000-0000-0000-000000000001'   // poslovni prostor SIRBFB01
const D = 'bc93b3ef-0000-0000-0000-000000000001'   // naprava RACUNKO01
const C = 'c0000000-0000-0000-0000-00000000000c'   // organizacija brez blagajne, nacin central
const W = 'e0000000-0000-0000-0000-00000000000e'   // blagajna z napravo 'web' (prej web_invoice_seq)
const N = 'f0000000-0000-0000-0000-00000000000f'   // novo podjetje brez stevca (prva dodelitev)

/** En klic psql = ena povezava. Vsak -c je svoja transakcija. */
function psql(ukazi: string[]): Promise<{ izhod: string; napaka: string; koda: number }> {
  return new Promise(resolve => {
    const p = spawn('psql', [URL!, '-X', '-At', '-v', 'ON_ERROR_STOP=1', ...ukazi.flatMap(u => ['-c', u])])
    let izhod = '', napaka = ''
    p.stdout.on('data', d => { izhod += d })
    p.stderr.on('data', d => { napaka += d })
    p.on('close', koda => resolve({ izhod, napaka, koda: koda ?? 1 }))
  })
}
async function sql(u: string): Promise<string> {
  const r = await psql([u])
  if (r.koda !== 0) throw new Error(r.napaka)
  return r.izhod.trim()
}
const stevilke = (izhod: string) => izhod.split('\n').filter(Boolean).map(Number)

// Funkciji, kot sta bili v produkciji PRED migracijo 177 (5.10.2026).
const STARE_FUNKCIJE = `
create or replace function public.get_next_pos_invoice_number(p_business_id uuid) returns integer
language plpgsql security definer set search_path to 'public' as $f$
declare v_num integer;
begin
  insert into pos_invoice_counters (business_id, last_number, updated_at) values (p_business_id, 1, now())
  on conflict (business_id) do update set last_number = pos_invoice_counters.last_number + 1, updated_at = now()
  returning last_number into v_num;
  return v_num;
end $f$;
create or replace function public.next_invoice_number(p_business_id uuid, p_premise_id uuid default null, p_device_id uuid default null, p_leto integer default null)
returns integer language plpgsql security definer set search_path to 'public' as $f$
declare v_mode text; v_leto integer := coalesce(p_leto, extract(year from now())::integer); v_num integer; v_naprava uuid;
  v_prazna uuid := '00000000-0000-0000-0000-000000000000'::uuid; v_zacetek integer;
begin
  select o.numbering_mode into v_mode from organizations o where o.pos_business_id = p_business_id;
  v_mode := coalesce(v_mode, 'central');
  if v_mode = 'central' then return get_next_pos_invoice_number(p_business_id); end if;
  v_naprava := case when v_mode = 'device' then p_device_id else v_prazna end;
  select coalesce(max(sequence_number), 0) into v_zacetek from pos_invoice_numbers where business_id = p_business_id;
  insert into pos_invoice_counters_scoped (business_id, premise_id, device_id, leto, last_number, updated_at)
  values (p_business_id, p_premise_id, v_naprava, v_leto, v_zacetek + 1, now())
  on conflict (business_id, premise_id, device_id, leto) do update set last_number = pos_invoice_counters_scoped.last_number + 1, updated_at = now()
  returning last_number into v_num;
  return v_num;
end $f$;`

const SHEMA = `
drop table if exists organizations, pos_invoice_counters, pos_invoice_counters_scoped, pos_invoice_numbers,
  orders, issued_invoices, business_premises, electronic_devices cascade;
create table organizations (id uuid primary key, pos_business_id uuid, numbering_mode text);
create table pos_invoice_counters (business_id uuid primary key, last_number integer not null, updated_at timestamptz);
create table pos_invoice_counters_scoped (business_id uuid, premise_id uuid, device_id uuid, leto integer,
  last_number integer not null, updated_at timestamptz, primary key (business_id, premise_id, device_id, leto));
create table pos_invoice_numbers (id serial primary key, business_id uuid, sequence_number integer, invoice_number text,
  order_id uuid, status text, note text, created_at timestamptz default now());
create table orders (id serial primary key, business_id uuid, invoice_number text);
create table issued_invoices (id serial primary key, org_id uuid, invoice_number text, zoi text, eor text, furs_rezervacija jsonb);
create table business_premises (id uuid primary key, premise_id text);
create table electronic_devices (id uuid primary key, device_id text);

insert into business_premises values ('${P}', 'SIRBFB01');
insert into electronic_devices values ('${D}', 'RACUNKO01');
-- test s.p.: nacin device; blagajna -1..-3, portal/Stripe -2..-7 (stari centralni stevec)
insert into organizations values ('31000000-0000-0000-0000-000000000001', '${B}', 'device');
insert into pos_invoice_counters_scoped values ('${B}', '${P}', '${D}', extract(year from now())::int, 3, now());
insert into pos_invoice_counters values ('${B}', 7, now());
insert into pos_invoice_numbers (business_id, sequence_number, invoice_number, status)
  select '${B}', g, 'SIRBFB01-RACUNKO01-' || g, 'issued' from generate_series(1, 3) g;
insert into orders (business_id, invoice_number) select '${B}', 'SIRBFB01-RACUNKO01-' || g from generate_series(1, 3) g;
insert into issued_invoices (org_id, invoice_number, zoi, eor)
  select '31000000-0000-0000-0000-000000000001', 'SIRBFB01-RACUNKO01-' || g, 'zoi', 'eor' from generate_series(2, 7) g;
-- organizacija brez blagajne (nacin central, stevec po id organizacije): -1..-3
insert into organizations values ('${C}', null, 'central');
insert into pos_invoice_counters values ('${C}', 3, now());
insert into issued_invoices (org_id, invoice_number, zoi, eor) select '${C}', 'HFP1-RACUNKO01-' || g, 'zoi', 'eor' from generate_series(1, 3) g;
-- blagajna z napravo 'web': stevilka 1 iz globalnega web_invoice_seq, stevca NI
insert into organizations values ('e1000000-0000-0000-0000-000000000001', '${W}', 'central');
insert into issued_invoices (org_id, invoice_number, zoi, eor) values ('e1000000-0000-0000-0000-000000000001', 'PP1-NURSED001-1', 'zoi', 'eor');
-- novo podjetje, nacin device, brez stevca in brez racunov
insert into organizations values ('f1000000-0000-0000-0000-000000000001', '${N}', 'device');
`

const zaporedne = (od: number, n: number) => Array.from({ length: n }, (_, i) => od + i)

test('PRED popravkom: blagajna in portal vzameta stevilke iz dveh stevcev -> trk', async () => {
  await sql(SHEMA)
  await sql(STARE_FUNKCIJE)
  const blagajna = Number(await sql(`select next_invoice_number('${B}', '${P}', '${D}')`))
  const portal = Number(await sql(`select get_next_pos_invoice_number('${B}')`))
  expect(blagajna).toBe(4) // stevilka -4 je ze porabljena na portalu (Stripe racun)
  expect(portal).toBe(8)
  const porabljena = await sql(`select count(*) from issued_invoices where invoice_number = 'SIRBFB01-RACUNKO01-${blagajna}'`)
  expect(Number(porabljena)).toBe(1) // => podvojena davcna stevilka
})

test('migracija 177 poravna stevce na najvisjo porabljeno stevilko', async () => {
  await sql(SHEMA)
  await sql(STARE_FUNKCIJE)
  await sql(MIGRACIJA)
  expect(Number(await sql(`select last_number from pos_invoice_counters_scoped where business_id = '${B}'`))).toBe(7)
  expect(Number(await sql(`select last_number from pos_invoice_counters where business_id = '${C}'`))).toBe(3)
  // naprava 'web' je imela stevilko iz globalnega zaporedja - zdaj ima stevec
  expect(Number(await sql(`select last_number from pos_invoice_counters where business_id = '${W}'`))).toBe(1)
  // ponovni zagon migracije nic ne pokvari (idempotentno)
  await sql(MIGRACIJA)
  expect(Number(await sql(`select last_number from pos_invoice_counters_scoped where business_id = '${B}'`))).toBe(7)
})

test('PO popravku: 30 socasnih povezav (blagajna + Stripe/portal + storno) - brez trka, brez vrzeli', async () => {
  await sql(SHEMA)
  await sql(STARE_FUNKCIJE)
  await sql(MIGRACIJA)
  const KLICEV = 20
  // Vse tri poti zdaj klicejo ISTO funkcijo z istim prostorom in napravo
  // (api/furs/invoice, lib/pos-stripe, lib/furs-invoice-confirm, api/furs/void).
  const klic = `select next_invoice_number('${B}', '${P}', '${D}')`
  const poti = Array.from({ length: 30 }, () => psql(Array(KLICEV).fill(klic)))
  const izidi = await Promise.all(poti)
  for (const r of izidi) expect(r.napaka).toBe('')
  const vse = izidi.flatMap(r => stevilke(r.izhod)).sort((a, b) => a - b)
  expect(vse.length).toBe(30 * KLICEV)
  expect(new Set(vse).size).toBe(vse.length)              // nobena stevilka dvakrat
  expect(vse).toEqual(zaporedne(8, 30 * KLICEV))          // 8..607 brez vrzeli, nad porabljenimi 1..7
})

test('PO popravku: central - star klic (zdruzljivost) in nov klic socasno delita EN stevec', async () => {
  await sql(SHEMA)
  await sql(STARE_FUNKCIJE)
  await sql(MIGRACIJA)
  const KLICEV = 15
  const poti = [
    ...Array.from({ length: 10 }, () => psql(Array(KLICEV).fill(`select get_next_pos_invoice_number('${C}')`))),
    ...Array.from({ length: 10 }, () => psql(Array(KLICEV).fill(`select next_invoice_number('${C}', null, null)`))),
  ]
  const izidi = await Promise.all(poti)
  for (const r of izidi) expect(r.napaka).toBe('')
  const vse = izidi.flatMap(r => stevilke(r.izhod)).sort((a, b) => a - b)
  expect(vse).toEqual(zaporedne(4, 20 * KLICEV))          // nadaljuje za HFP1-RACUNKO01-3
})

test('PO popravku: prva dodelitev novega podjetja ob socasnih klicih - brez trka', async () => {
  await sql(SHEMA)
  await sql(MIGRACIJA)
  await sql(`insert into business_premises values ('${P.replace('a0169e53', 'b0169e53')}', 'NOV1')`)
  const prostor = P.replace('a0169e53', 'b0169e53')
  const izidi = await Promise.all(Array.from({ length: 25 }, () => psql([`select next_invoice_number('${N}', '${prostor}', '${D}')`])))
  for (const r of izidi) expect(r.napaka).toBe('')
  expect(izidi.flatMap(r => stevilke(r.izhod)).sort((a, b) => a - b)).toEqual(zaporedne(1, 25))
})

test('PO popravku: star klic brez prostora/naprave pri nacinu "device" je ZAVRNJEN (ne da stevilke iz napacnega zaporedja)', async () => {
  await sql(SHEMA)
  await sql(MIGRACIJA)
  const r = await psql([`select get_next_pos_invoice_number('${B}')`])
  expect(r.koda).not.toBe(0)
  expect(r.napaka).toMatch(/zastarela/)
  expect(Number(await sql(`select last_number from pos_invoice_counters where business_id = '${B}'`))).toBe(7) // stevec nedotaknjen
})
