-- V6: PREJETI RACUNI Z NAPACNIM VSTOPNIM DDV (SIRM) — PREGLED (DRY-RUN)
-- ════════════════════════════════════════════════════════════════════
--
-- Enkratna skripta za ROCNI pregled. Samo SELECT - nic ne spreminja.
-- Stolpec `predlog` vsebuje stavke, ki jih po pregledu listine izvedes rocno
-- (najprej migracija 180 - stolpec receipts.vat_breakdown).
--
-- Vzrok: AI je vracal eno stopnjo, shranjevanje je DDV preracunalo kot
-- osnova × 22 %. Pri racunih Davidov Hram (pijaca 22 % + hrana 9,5 %) je bil
-- vstopni DDV zato previsok, pri Cernigoj (kmet pavsalist) pa pavsalno
-- nadomestilo 8 % ni bilo zajeto.
--
-- Rezultat 5.10.2026:
--   A  5 racunov z dobavnico in mesanimi stopnjami (september):
--      vstopni DDV previsok za 20,84 EUR (3,26 + 1,60 + 6,98 + 3,06 + 5,94).
--      Zneski glave iz dobavnice (deliveries), delitev po stopnjah iz vrstic,
--      sorazmerno usklajena z glavo (dobavnica ima popust na glavi).
--   B  3 racuni z dobavnico in eno stopnjo - pravilni, brez predloga.
--   C  32 racunov Davidov Hram BREZ dobavnice (april-september): vsi imajo DDV
--      tocno 22 % osnove - verjetno ista napaka, a brez listine je ni mogoce
--      izracunati. Samo oznaka za pregled.
--   D  Cernigoj (2 racuna po 172,22): pavsalno nadomestilo 8 % = 13,78 EUR
--      na racun ni bilo zajeto. Preveri na listini, da je bilo placanih
--      186,00 EUR (172,22 + 13,78).
-- Vsakemu receipts zapisu pripada en KPO vnos (kpo_entries.receipt_id) -
-- predlog popravi oba.

with param as (select '1d406efe-58d0-4573-8679-d9f666fce964'::uuid as org),
dh as (
  select r.* from receipts r, param p where r.org_id = p.org and r.vendor ilike 'davidov hram%'
),
dob as (
  select d.id, d.document_number, d.document_date, d.total_ex_vat, d.total_vat, d.total_inc_vat
  from deliveries d join organizations o on o.pos_business_id = d.business_id, param p
  where o.id = p.org and d.supplier ilike 'davidov%'
),
par as ( -- prejeti racun ↔ dobavnica: ista osnova, ±3 dni, ista stevilka (ce je vpisana)
  select r.id as rid, d.*
  from dh r join dob d
    on abs(r.amount_net - d.total_ex_vat) < 0.011 and abs(r.receipt_date - d.document_date) <= 3
   and (r.receipt_number is null or r.receipt_number = d.document_number)
),
vrstice as ( -- vrstice dobavnice po stopnjah, osnova sorazmerno usklajena z glavo
  select p.rid, l.vat_rate as stopnja, sum(l.total_ex_vat) as osnova_v,
         sum(sum(l.total_ex_vat)) over (partition by p.rid) as vsota_v, p.total_ex_vat, p.total_vat
  from par p join delivery_lines l on l.delivery_id = p.id
  group by p.rid, l.vat_rate, p.total_ex_vat, p.total_vat
),
deli as (
  select rid, stopnja, round(osnova_v * total_ex_vat / vsota_v, 2) as osnova,
         round(round(osnova_v * total_ex_vat / vsota_v, 2) * stopnja / 100, 2) as ddv_izr,
         total_ex_vat, total_vat, row_number() over (partition by rid order by osnova_v desc) as rn
  from vrstice
),
popravljeni as ( -- ostanek centov (glava) na najvecjo stopnjo
  select rid, stopnja,
         osnova + case when rn = 1 then total_ex_vat - sum(osnova) over (partition by rid) else 0 end as osnova,
         ddv_izr + case when rn = 1 then total_vat - sum(ddv_izr) over (partition by rid) else 0 end as ddv
  from deli
),
razclenitev as (
  select rid, count(*) as stopenj,
         jsonb_agg(jsonb_build_object('stopnja', stopnja, 'osnova', osnova, 'ddv', ddv) order by stopnja desc) as js
  from popravljeni group by rid
),
a as (
  select 'A mesane stopnje (dobavnica)' as vrsta, r.receipt_date, coalesce(r.receipt_number, p.document_number) as racun,
         r.vat_amount as ddv_zdaj, p.total_vat as ddv_pravilno, round(r.vat_amount - p.total_vat, 2) as razlika,
         format('update receipts set vat_amount = %s, amount_total = %s, vat_breakdown = %L, receipt_number = coalesce(receipt_number, %L) where id = %L; '
                'update kpo_entries set vat_in = %s where receipt_id = %L;',
                p.total_vat, p.total_inc_vat, z.js, p.document_number, r.id, p.total_vat, r.id) as predlog
  from dh r join par p on p.rid = r.id join razclenitev z on z.rid = r.id
  where z.stopenj > 1
),
b as (
  select 'B ena stopnja (dobavnica) - pravilno', r.receipt_date, coalesce(r.receipt_number, p.document_number),
         r.vat_amount, p.total_vat, round(r.vat_amount - p.total_vat, 2), '-- brez spremembe'
  from dh r join par p on p.rid = r.id join razclenitev z on z.rid = r.id
  where z.stopenj = 1
),
c as (
  select 'C brez dobavnice - preveri listino', r.receipt_date, r.receipt_number,
         r.vat_amount, null::numeric, null::numeric,
         format('-- preveri rekapitulacijo DDV na listini; ce ima vec stopenj: update receipts set vat_amount = <DDV z listine>, amount_total = <skupaj>, vat_breakdown = ''[{"stopnja":22,"osnova":..,"ddv":..},{"stopnja":9.5,"osnova":..,"ddv":..}]'' where id = %L; update kpo_entries set vat_in = <DDV z listine> where receipt_id = %L;', r.id, r.id)
  from dh r where not exists (select 1 from par p where p.rid = r.id)
),
d as (
  select 'D pavsalno nadomestilo 8 %', r.receipt_date, r.receipt_number,
         r.vat_amount, round(r.amount_net * 0.08, 2), round(r.vat_amount - round(r.amount_net * 0.08, 2), 2),
         format('update receipts set vat_amount = %s, amount_total = %s, vat_breakdown = %L where id = %L; update kpo_entries set vat_in = %s where receipt_id = %L;',
                round(r.amount_net * 0.08, 2), r.amount_net + round(r.amount_net * 0.08, 2),
                jsonb_build_array(jsonb_build_object('stopnja', 8, 'osnova', r.amount_net, 'ddv', round(r.amount_net * 0.08, 2), 'vrsta', 'pavsalno_nadomestilo')),
                r.id, round(r.amount_net * 0.08, 2), r.id)
  from receipts r, param p where r.org_id = p.org and r.vendor ilike 'černigoj%' and coalesce(r.vat_amount, 0) = 0
)
select * from (select * from a union all select * from b union all select * from c union all select * from d) x
order by 1, 2;
