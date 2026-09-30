-- ═══════════════════════════════════════════════════════════════════════════
-- DEMO PODATKI — "Kavarna Lipa, demo s.p." (prelet 345)
--
-- Napolni SAMO predstavitveno organizacijo (furs_demo_mode = true), da je
-- /demo in posnetki za zacetno stran prikazejo zivo podjetje namesto nicel.
-- Vsi podatki so IZMISLJENI. Vsaka vrstica je oznacena z 'DEMO-PODATKI'
-- (notes / note / description), zato jo lahko kadar koli odstranimo:
--   glej spodnji blok "POCISTI" - skripta ga pozene sama, torej je ponovljiva.
--
-- Zagon: Supabase SQL editor ali `psql -f skripte/demo-podatki.sql`.
-- Datumi so relativni na current_date - ob ponovnem zagonu so podatki sveži.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

do $$
declare
  v_org uuid := 'ed566348-9b01-4130-bbf0-ee6011b8cbb1';
  v_biz uuid := '85d4b904-54eb-4430-ab7a-ce446fa76be6';
  v_ok  boolean;
begin
  select furs_demo_mode into v_ok from organizations where id = v_org;
  if v_ok is distinct from true then
    raise exception 'Organizacija % NI demo (furs_demo_mode) - prekinjam.', v_org;
  end if;
  if (select pos_business_id from organizations where id = v_org) is distinct from v_biz then
    raise exception 'POS podjetje se ne ujema z demo organizacijo - prekinjam.';
  end if;
end $$;

-- ── POCISTI prejsnji zagon (samo oznacene vrstice demo organizacije) ─────────
delete from kpo_entries where org_id = 'ed566348-9b01-4130-bbf0-ee6011b8cbb1' and notes like 'DEMO-PODATKI%';
delete from receipts where org_id = 'ed566348-9b01-4130-bbf0-ee6011b8cbb1' and description like 'DEMO-PODATKI%';
delete from issued_invoices where org_id = 'ed566348-9b01-4130-bbf0-ee6011b8cbb1' and notes like 'DEMO-PODATKI%';
delete from invoice_partners where org_id = 'ed566348-9b01-4130-bbf0-ee6011b8cbb1' and email like '%@primer.si';
delete from bookings where business_id = '85d4b904-54eb-4430-ab7a-ce446fa76be6' and note like 'DEMO-PODATKI%';
delete from package_templates where business_id = '85d4b904-54eb-4430-ab7a-ce446fa76be6' and description like 'DEMO-PODATKI%';
delete from services where business_id = '85d4b904-54eb-4430-ab7a-ce446fa76be6' and name in ('Barista delavnica','Degustacija kave','Zasebni dogodek','Zajtrk za skupine');
delete from customers where business_id = '85d4b904-54eb-4430-ab7a-ce446fa76be6' and notes like 'DEMO-PODATKI%';

-- ── Organizacija: prispevki, akontacija, stanje na racunu ───────────────────
update organizations set
  tax_system = coalesce(tax_system, 'dejanski'),
  contrib_piz = 370.51, contrib_zzzs = 274.45, contrib_zaposlovanje = 3.04, contrib_starsevstvo = 3.04,
  contrib_akontacija = 186.00,
  cash_balance = 7840.00, cash_balance_date = current_date,
  vat_period = 'quarterly'
where id = 'ed566348-9b01-4130-bbf0-ee6011b8cbb1';

-- ── Poslovni partnerji ──────────────────────────────────────────────────────
insert into invoice_partners (org_id, name, tax_number, address, email) values
  ('ed566348-9b01-4130-bbf0-ee6011b8cbb1', 'Arhitekti Most d.o.o.', 'SI23456781', 'Slovenska cesta 40, 1000 Ljubljana', 'racuni@primer.si'),
  ('ed566348-9b01-4130-bbf0-ee6011b8cbb1', 'Zavod Knjižni vrt', 'SI34567812', 'Gosposka ulica 3, 1000 Ljubljana', 'zavod@primer.si'),
  ('ed566348-9b01-4130-bbf0-ee6011b8cbb1', 'Tehnopark Sever d.o.o.', 'SI45678123', 'Dunajska cesta 156, 1000 Ljubljana', 'tehnopark@primer.si'),
  ('ed566348-9b01-4130-bbf0-ee6011b8cbb1', 'Društvo Tek Lipa', 'SI56781234', 'Trg svobode 5, 1000 Ljubljana', 'drustvo@primer.si'),
  ('ed566348-9b01-4130-bbf0-ee6011b8cbb1', 'Agencija Obzorje d.o.o.', 'SI67812345', 'Tržaška cesta 2, 1000 Ljubljana', 'obzorje@primer.si');

-- ── Izdani racuni (catering, dogodki, najem prostora) ───────────────────────
with r(st, dni, zap, stranka, davcna, naslov, opis, kol, cena, placano) as (values
  (1, 88, 15, 'Arhitekti Most d.o.o.', 'SI23456781', 'Slovenska cesta 40, 1000 Ljubljana', 'Pogostitev — sestanek s strankami (kava, pecivo)', 18, 6.50, true),
  (2, 81, 15, 'Tehnopark Sever d.o.o.', 'SI45678123', 'Dunajska cesta 156, 1000 Ljubljana', 'Catering — dopoldanski odmor', 40, 7.90, true),
  (3, 74, 15, 'Zavod Knjižni vrt', 'SI34567812', 'Gosposka ulica 3, 1000 Ljubljana', 'Najem terase za literarni večer', 1, 220.00, true),
  (4, 66, 15, 'Agencija Obzorje d.o.o.', 'SI67812345', 'Tržaška cesta 2, 1000 Ljubljana', 'Kava za ekipo — mesečni paket', 60, 2.10, true),
  (5, 58, 15, 'Arhitekti Most d.o.o.', 'SI23456781', 'Slovenska cesta 40, 1000 Ljubljana', 'Pogostitev — predstavitev projekta', 25, 8.40, true),
  (6, 51, 15, 'Društvo Tek Lipa', 'SI56781234', 'Trg svobode 5, 1000 Ljubljana', 'Zajtrk po teku — skupina', 32, 6.20, true),
  (7, 44, 15, 'Tehnopark Sever d.o.o.', 'SI45678123', 'Dunajska cesta 156, 1000 Ljubljana', 'Catering — delavnica (2 odmora)', 45, 9.50, true),
  (8, 37, 15, 'Agencija Obzorje d.o.o.', 'SI67812345', 'Tržaška cesta 2, 1000 Ljubljana', 'Kava za ekipo — mesečni paket', 60, 2.10, true),
  (9, 30, 15, 'Zavod Knjižni vrt', 'SI34567812', 'Gosposka ulica 3, 1000 Ljubljana', 'Najem prostora in pogostitev', 1, 380.00, true),
  (10, 22, 15, 'Arhitekti Most d.o.o.', 'SI23456781', 'Slovenska cesta 40, 1000 Ljubljana', 'Pogostitev — sestanek s strankami (kava, pecivo)', 20, 6.50, true),
  (11, 15, 15, 'Tehnopark Sever d.o.o.', 'SI45678123', 'Dunajska cesta 156, 1000 Ljubljana', 'Catering — dopoldanski odmor', 38, 7.90, true),
  (12, 9, 15, 'Agencija Obzorje d.o.o.', 'SI67812345', 'Tržaška cesta 2, 1000 Ljubljana', 'Kava za ekipo — mesečni paket', 60, 2.10, false),
  (13, 5, 15, 'Društvo Tek Lipa', 'SI56781234', 'Trg svobode 5, 1000 Ljubljana', 'Zajtrk po teku — skupina', 28, 6.20, false),
  (14, 2, 15, 'Zavod Knjižni vrt', 'SI34567812', 'Gosposka ulica 3, 1000 Ljubljana', 'Najem terase za literarni večer', 1, 220.00, false),
  (15, 20, 15, 'Tehnopark Sever d.o.o.', 'SI45678123', 'Dunajska cesta 156, 1000 Ljubljana', 'Catering — predstavitev izdelka', 55, 8.90, false)
), izr as (
  select r.*, round(kol * cena, 2) neto, round(kol * cena * 0.22, 2) ddv,
         (current_date - dni) datum
  from r
)
insert into issued_invoices (org_id, invoice_type, source, invoice_number, client_name, client_tax_number, client_vat_number, client_address,
  issue_date, service_date, due_date, line_items, amount_net, vat_amount, amount_total, zoi, eor, furs_confirmed_at,
  status, paid_at, paid_amount, reference, notes)
select 'ed566348-9b01-4130-bbf0-ee6011b8cbb1', 'invoice', 'manual',
  to_char(datum, 'YYYY') || '-' || lpad(st::text, 4, '0'), stranka, replace(davcna, 'SI', ''), davcna, naslov,
  datum, datum, datum + zap,
  jsonb_build_array(jsonb_build_object('description', opis, 'quantity', kol, 'unit_price', cena, 'vat_rate', 22, 'discount_pct', 0)),
  neto, ddv, neto + ddv,
  'DEMO-' || md5('zoi' || st), 'DEMO-' || md5('eor' || st)::uuid::text, datum::timestamptz + interval '10 hours',
  case when placano then 'paid' when datum + zap < current_date then 'sent' else 'sent' end,
  case when placano then (datum + least(zap, 9 + st % 6))::timestamptz end,
  case when placano then neto + ddv end,
  'SI00 ' || to_char(datum, 'YYYY') || '-' || lpad(st::text, 4, '0'),
  'DEMO-PODATKI'
from izr;

-- KPO: placani racuni (denarno nacelo - na dan placila)
insert into kpo_entries (org_id, entry_date, description, entry_type, income, expense, vat_in, vat_out, vat_rate, invoice_id, category, notes)
select org_id, paid_at::date, 'Plačilo računa ' || invoice_number || ' — ' || client_name, 'income',
  amount_net, 0, 0, vat_amount, 22, id, 'Prihodki od storitev', 'DEMO-PODATKI'
from issued_invoices
where org_id = 'ed566348-9b01-4130-bbf0-ee6011b8cbb1' and notes = 'DEMO-PODATKI' and status = 'paid';

-- ── Prejeti racuni (stroski s konti) ────────────────────────────────────────
with s(dni, dobavitelj, davcna, kategorija, konto, opis, neto, stopnja) as (values
  (86, 'Pražarna Zrno d.o.o.', '11223344', 'Blago za prodajo', '660', 'Kava v zrnu 12 kg', 264.00, 9.5),
  (84, 'Mlekarna Dolina d.o.o.', '22334455', 'Blago za prodajo', '660', 'Mleko in smetana', 118.40, 9.5),
  (80, 'Pijače Sever d.o.o.', '33445566', 'Blago za prodajo', '660', 'Sokovi, voda, pivo', 412.30, 22),
  (78, 'Nepremičnine Center d.o.o.', '44556677', 'Najemnina', '413', 'Najemnina poslovnega prostora — julij', 950.00, 22),
  (75, 'Elektro Energija d.o.o.', '55667788', 'Energija', '402', 'Električna energija — junij', 186.20, 22),
  (70, 'Pekarna Klas d.o.o.', '66778899', 'Blago za prodajo', '660', 'Rogljički in pecivo', 142.60, 9.5),
  (66, 'Telekom Primer d.d.', '77889900', 'Komunikacije', '411', 'Internet in telefon', 39.90, 22),
  (62, 'Čistila Bistro d.o.o.', '88990011', 'Čistila in drug material', '407', 'Čistila in papirnate brisače', 74.35, 22),
  (58, 'Pražarna Zrno d.o.o.', '11223344', 'Blago za prodajo', '660', 'Kava v zrnu 12 kg', 264.00, 9.5),
  (55, 'Pijače Sever d.o.o.', '33445566', 'Blago za prodajo', '660', 'Sokovi, voda, pivo', 438.10, 22),
  (49, 'Nepremičnine Center d.o.o.', '44556677', 'Najemnina', '413', 'Najemnina poslovnega prostora — avgust', 950.00, 22),
  (46, 'Elektro Energija d.o.o.', '55667788', 'Energija', '402', 'Električna energija — julij', 201.75, 22),
  (43, 'Servis Kavomat s.p.', '99001122', 'Vzdrževanje in popravila', '412', 'Servis kavnega aparata', 145.00, 22),
  (40, 'Mlekarna Dolina d.o.o.', '22334455', 'Blago za prodajo', '660', 'Mleko in smetana', 126.80, 9.5),
  (36, 'Tiskarna Pika d.o.o.', '10203040', 'Marketing', '417', 'Letaki in jedilni listi', 88.00, 22),
  (33, 'Telekom Primer d.d.', '77889900', 'Komunikacije', '411', 'Internet in telefon', 39.90, 22),
  (29, 'Pekarna Klas d.o.o.', '66778899', 'Blago za prodajo', '660', 'Rogljički in pecivo', 151.20, 9.5),
  (26, 'Pražarna Zrno d.o.o.', '11223344', 'Blago za prodajo', '660', 'Kava v zrnu 14 kg', 308.00, 9.5),
  (21, 'Nepremičnine Center d.o.o.', '44556677', 'Najemnina', '413', 'Najemnina poslovnega prostora — september', 950.00, 22),
  (18, 'Elektro Energija d.o.o.', '55667788', 'Energija', '402', 'Električna energija — avgust', 214.40, 22),
  (14, 'Pijače Sever d.o.o.', '33445566', 'Blago za prodajo', '660', 'Sokovi, voda, pivo', 397.60, 22),
  (11, 'Oprema Gostinec d.o.o.', '50607080', 'Drobni inventar', '404', 'Skodelice in kozarci', 132.00, 22),
  (8, 'Računovodski servis Bilanca d.o.o.', '60708090', 'Računovodstvo in svetovanje', '416', 'Letni pregled in svetovanje', 120.00, 22),
  (6, 'Mlekarna Dolina d.o.o.', '22334455', 'Blago za prodajo', '660', 'Mleko in smetana', 131.50, 9.5),
  (3, 'Čistila Bistro d.o.o.', '88990011', 'Čistila in drug material', '407', 'Čistila in papirnate brisače', 68.90, 22),
  (1, 'Papirnica Svinčnik d.o.o.', '11223355', 'Pisarniški material', '406', 'Papir A4, toner, registratorji', 85.33, 22)
)
insert into receipts (org_id, vendor, vendor_tax_num, receipt_date, receipt_number, amount_net, vat_rate, vat_amount, amount_total,
  category, description, is_deductible, status, ai_confidence, ai_raw_json)
select 'ed566348-9b01-4130-bbf0-ee6011b8cbb1', dobavitelj, davcna, current_date - dni,
  'R-' || to_char(current_date - dni, 'YYMMDD') || '-' || (100 + row_number() over ()),
  neto, stopnja, round(neto * stopnja / 100, 2), neto + round(neto * stopnja / 100, 2),
  kategorija, 'DEMO-PODATKI · ' || opis, true, 'confirmed', 0.97,
  jsonb_build_object('vendor', dobavitelj, 'category', kategorija, 'konto', konto, 'davcni_delez', 100)
from s;

-- KPO: stroski, povezani s prejetimi racuni
with k as (
  insert into kpo_entries (org_id, entry_date, description, entry_type, income, expense, vat_in, vat_out, vat_rate, receipt_id, category, notes)
  select org_id, receipt_date, vendor || ' — ' || category, 'expense', 0, amount_net, vat_amount, 0, vat_rate, id, category, 'DEMO-PODATKI'
  from receipts where org_id = 'ed566348-9b01-4130-bbf0-ee6011b8cbb1' and description like 'DEMO-PODATKI%'
  returning id, receipt_id
)
update receipts r set kpo_entry_id = k.id from k where r.id = k.receipt_id;

-- KPO: dnevni promet blagajne (zadnjih 90 dni, ob ponedeljkih zaprto)
select setseed(0.42);
insert into kpo_entries (org_id, entry_date, description, entry_type, income, expense, vat_in, vat_out, vat_rate, category, notes)
select 'ed566348-9b01-4130-bbf0-ee6011b8cbb1', d::date,
  'POS blagajna — prodaja izdelkov ' || st || '% (' || d::date || ')', 'income',
  round(osnova::numeric, 2), 0, 0, round((osnova * st / 100)::numeric, 2), st, 'pos_prodaja',
  'DEMO-PODATKI · Avtomatski dnevni povzetek iz POS blagajne'
from generate_series(current_date - 90, current_date - 1, interval '1 day') d
cross join lateral (
  select 22 as st, (case extract(dow from d) when 5 then 520 when 6 then 610 when 0 then 480 else 360 end) * (0.85 + random() * 0.3) as osnova
  union all
  select 9.5, (case extract(dow from d) when 6 then 190 when 0 then 170 else 120 end) * (0.85 + random() * 0.3)
) x
where extract(dow from d) <> 1;

-- ── Stranke, storitve, paketi in termini (koledar) ──────────────────────────
insert into customers (business_id, name, phone, email, since, tier, points, notes, marketing_opt_in) values
  ('85d4b904-54eb-4430-ab7a-ce446fa76be6', 'Nina Horvat', '041 111 201', 'nina.horvat@primer.si', current_date - 210, 'zlata', 340, 'DEMO-PODATKI', true),
  ('85d4b904-54eb-4430-ab7a-ce446fa76be6', 'Luka Zupan', '041 111 202', 'luka.zupan@primer.si', current_date - 180, 'srebrna', 190, 'DEMO-PODATKI', true),
  ('85d4b904-54eb-4430-ab7a-ce446fa76be6', 'Maja Kovač', '041 111 203', 'maja.kovac@primer.si', current_date - 150, 'srebrna', 150, 'DEMO-PODATKI', false),
  ('85d4b904-54eb-4430-ab7a-ce446fa76be6', 'Tomaž Novak', '041 111 204', 'tomaz.novak@primer.si', current_date - 120, 'bronasta', 80, 'DEMO-PODATKI', true),
  ('85d4b904-54eb-4430-ab7a-ce446fa76be6', 'Eva Krajnc', '041 111 205', 'eva.krajnc@primer.si', current_date - 95, 'zlata', 410, 'DEMO-PODATKI', true),
  ('85d4b904-54eb-4430-ab7a-ce446fa76be6', 'Jure Potočnik', '041 111 206', 'jure.potocnik@primer.si', current_date - 80, 'bronasta', 45, 'DEMO-PODATKI', false),
  ('85d4b904-54eb-4430-ab7a-ce446fa76be6', 'Sara Mlakar', '041 111 207', 'sara.mlakar@primer.si', current_date - 60, 'srebrna', 120, 'DEMO-PODATKI', true),
  ('85d4b904-54eb-4430-ab7a-ce446fa76be6', 'Anže Kos', '041 111 208', 'anze.kos@primer.si', current_date - 45, 'bronasta', 30, 'DEMO-PODATKI', true),
  ('85d4b904-54eb-4430-ab7a-ce446fa76be6', 'Petra Vidmar', '041 111 209', 'petra.vidmar@primer.si', current_date - 30, 'bronasta', 25, 'DEMO-PODATKI', false),
  ('85d4b904-54eb-4430-ab7a-ce446fa76be6', 'Rok Golob', '041 111 210', 'rok.golob@primer.si', current_date - 12, 'bronasta', 10, 'DEMO-PODATKI', true);

insert into services (business_id, name, color, duration_min, price, active) values
  ('85d4b904-54eb-4430-ab7a-ce446fa76be6', 'Barista delavnica', '#0E5E3B', 120, 45.00, true),
  ('85d4b904-54eb-4430-ab7a-ce446fa76be6', 'Degustacija kave', '#B7791F', 60, 18.00, true),
  ('85d4b904-54eb-4430-ab7a-ce446fa76be6', 'Zasebni dogodek', '#2B6CB0', 180, 220.00, true),
  ('85d4b904-54eb-4430-ab7a-ce446fa76be6', 'Zajtrk za skupine', '#9F7AEA', 90, 9.50, true);

insert into package_templates (business_id, name, price, type, template_type, activation_type, visits, validity_days, vat_rate, description, color, archived) values
  ('85d4b904-54eb-4430-ab7a-ce446fa76be6', 'Kavna kartica — 10 kav', 15.00, 'visits', 'visits', 'purchase', 10, 90, 9.5, 'DEMO-PODATKI · 10 espressov ali kav z mlekom', '#0E5E3B', false),
  ('85d4b904-54eb-4430-ab7a-ce446fa76be6', 'Mesečna kava', 39.00, 'unlimited', 'membership', 'purchase', null, 30, 9.5, 'DEMO-PODATKI · ena kava na dan, ves mesec', '#B7791F', false),
  ('85d4b904-54eb-4430-ab7a-ce446fa76be6', 'Darilni bon 25 €', 25.00, 'unlimited', 'gift_voucher', 'purchase', null, 365, 22, 'DEMO-PODATKI · darilni bon', '#2B6CB0', false);

-- Termini: tekoci in naslednji teden (pon-sob), osebje Ana in Marko
with t(dan, ura, storitev, stranka, osebje, oseb, trajanje, stanje) as (values
  (0, '09:00', 'Degustacija kave', 'Nina Horvat', 'Marko', 4, 60, 'scheduled'),
  (0, '17:00', 'Barista delavnica', 'Luka Zupan', 'Ana', 6, 120, 'scheduled'),
  (1, '08:30', 'Zajtrk za skupine', 'Društvo Tek Lipa', 'Ana', 14, 90, 'scheduled'),
  (1, '16:00', 'Degustacija kave', 'Maja Kovač', 'Marko', 2, 60, 'scheduled'),
  (2, '10:00', 'Degustacija kave', 'Eva Krajnc', 'Marko', 3, 60, 'scheduled'),
  (2, '18:00', 'Zasebni dogodek', 'Zavod Knjižni vrt', 'Marko', 30, 180, 'scheduled'),
  (3, '09:30', 'Barista delavnica', 'Tomaž Novak', 'Ana', 5, 120, 'scheduled'),
  (3, '15:00', 'Degustacija kave', 'Sara Mlakar', 'Marko', 2, 60, 'scheduled'),
  (4, '08:00', 'Zajtrk za skupine', 'Arhitekti Most d.o.o.', 'Ana', 12, 90, 'scheduled'),
  (4, '11:00', 'Degustacija kave', 'Jure Potočnik', 'Marko', 2, 60, 'scheduled'),
  (4, '19:00', 'Zasebni dogodek', 'Agencija Obzorje d.o.o.', 'Marko', 25, 180, 'scheduled'),
  (-1, '10:00', 'Degustacija kave', 'Anže Kos', 'Marko', 2, 60, 'arrived'),
  (-2, '17:00', 'Barista delavnica', 'Petra Vidmar', 'Ana', 6, 120, 'arrived'),
  (7, '09:00', 'Degustacija kave', 'Rok Golob', 'Marko', 3, 60, 'scheduled'),
  (8, '17:00', 'Barista delavnica', 'Nina Horvat', 'Ana', 6, 120, 'scheduled')
)
insert into bookings (business_id, is_table, customer_id, customer_name, staff_id, service_id, start_at, duration_min, party_size, status, source, note)
select '85d4b904-54eb-4430-ab7a-ce446fa76be6', false,
  (select id from customers c where c.business_id = '85d4b904-54eb-4430-ab7a-ce446fa76be6' and c.name = t.stranka limit 1),
  t.stranka,
  (select id from staff s where s.business_id = '85d4b904-54eb-4430-ab7a-ce446fa76be6' and s.name = t.osebje limit 1),
  (select id from services v where v.business_id = '85d4b904-54eb-4430-ab7a-ce446fa76be6' and v.name = t.storitev limit 1),
  ((current_date + t.dan)::text || ' ' || t.ura || ':00')::timestamp at time zone 'Europe/Ljubljana',
  t.trajanje, t.oseb, t.stanje, 'manual', 'DEMO-PODATKI'
from t;

-- PRELET 351: v demu Marko (PIN 2222) vidi celotno blagajno, tudi
-- nastavitve, porocila in osebje. Samo demo podjetje; globalna vloga
-- Vodja ostane nespremenjena za prave uporabnike.
update staff set role = 'Lastnik', permissions = null
where business_id = '85d4b904-54eb-4430-ab7a-ce446fa76be6' and name = 'Marko';

commit;
