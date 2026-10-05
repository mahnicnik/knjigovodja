-- K5/V4: NAPAČNO KNJIŽEN POS PROMET (ŠIRM) — PREGLED IN PREDLOG POPRAVKA (DRY-RUN)
-- ════════════════════════════════════════════════════════════════════════════════
--
-- Enkratna skripta za ROCNI pregled. Vsebuje SAMO poizvedbe (SELECT) - nic ne
-- spreminja. Ni del migracij. Predlagane spremembe (blok 3) so izpisane kot
-- besedilo, ki ga po pregledu izvedes rocno.
--
-- Primerja POS promet iz RACUNOV (enako pravilo kot lib/pos-kpo.ts: dan izdaje,
-- storno na dan storna, popust sorazmerno, DDV zaokrozen po racunu in stopnji)
-- z vnosi v KPO knjigi (kategoriji pos_prodaja/pos_storitve) po dnevih.
--
-- Ugotovljeno 5.10.2026 (SIRM, business 00000000-0000-0000-0000-000000000001):
--   JUNIJ  racuni 37,50 / KPO 35,00: racun #40 (1.6.2026, 2,50 EUR) je "paid",
--          nima pa NE postavk NE placila (tudi #41-#57 nimajo zapisa placila) -
--          prometa iz njega ni mogoce izracunati. Odlocitev: ali je bil to res
--          prodan racun? Ce da, rocni KPO vnos 2,50 EUR (stopnja?), sicer
--          oznaka na racunu.
--   JULIJ  KPO +2,50: 9.7.2026 sta knjizena ROCNI vnos 123,30 EUR (6a7707f9, ves
--          promet izmene po 22 %) IN naknadni prenos (prelet 216, c32f74b2)
--          9,5 % dela istega dne (sendvic, racun #94, 2,50 EUR). 9,5 % del je stet
--          dvakrat, rocni vnos pa ima napacno stopnjo za ta del.

-- ── Parametri ─────────────────────────────────────────────────────────────
-- (spremeni po potrebi)
with param as (
  select '00000000-0000-0000-0000-000000000001'::uuid as biz,
         '1d406efe-58d0-4573-8679-d9f666fce964'::uuid as org,
         date '2026-05-01' as od, date '2026-09-30' as do_
),
-- ── 1. Promet po dnevih in stopnjah iz racunov ─────────────────────────────
racun as (
  select o.id, o.status, o.closed_at, o.voided_at, o.total - coalesce(o.tip_amount, 0) as zaracunano,
         (select sum(l.total) from order_lines l where l.order_id = o.id and not l.voided) as vsota
  from orders o, param p
  where o.business_id = p.biz and o.status in ('paid', 'voided')
    and coalesce(o.invoice_number, '') not like 'DEMO%'
    and not exists (select 1 from payments pm where pm.order_id = o.id and pm.method = 'pkg')
),
del as (
  select r.id, r.status, r.closed_at, r.voided_at, coalesce(l.vat_rate, 22) as stopnja,
         sum(l.total) * case when r.vsota > 0 then r.zaracunano / r.vsota else 1 end as bruto
  from racun r join order_lines l on l.order_id = r.id and not l.voided
  group by r.id, r.status, r.closed_at, r.voided_at, r.zaracunano, r.vsota, coalesce(l.vat_rate, 22)
),
del_zaokr as (
  select d.*, round(d.bruto / (1 + d.stopnja / 100), 2) as neto,
         round(d.bruto - d.bruto / (1 + d.stopnja / 100), 2) as ddv
  from del d
),
iz_racunov as (
  select (closed_at at time zone 'Europe/Ljubljana')::date as dan, stopnja, neto, ddv from del_zaokr
  union all
  select (voided_at at time zone 'Europe/Ljubljana')::date, stopnja, -neto, -ddv from del_zaokr where status = 'voided' and voided_at is not null
),
racuni_dan as (
  select dan, stopnja, sum(neto) as neto, sum(ddv) as ddv from iz_racunov, param p
  where dan between p.od and p.do_ group by 1, 2
),
-- ── 2. KPO vnosi po dnevih in stopnjah ─────────────────────────────────────
kpo_dan as (
  select k.entry_date as dan,
         coalesce(k.vat_rate, case when k.income <> 0 then round(k.vat_out / k.income * 100 * 2) / 2 end, 22) as stopnja,
         sum(k.income) as neto, sum(k.vat_out) as ddv, string_agg(k.id::text, ',') as vnosi
  from kpo_entries k, param p
  where k.org_id = p.org and k.category in ('pos_prodaja', 'pos_storitve', 'POS promet')
    and k.entry_date between p.od and p.do_
  group by 1, 2
)
select coalesce(r.dan, k.dan) as dan, coalesce(r.stopnja, k.stopnja) as stopnja,
       coalesce(r.neto, 0) + coalesce(r.ddv, 0) as bruto_racuni,
       coalesce(k.neto, 0) + coalesce(k.ddv, 0) as bruto_kpo,
       coalesce(k.neto, 0) + coalesce(k.ddv, 0) - coalesce(r.neto, 0) - coalesce(r.ddv, 0) as razlika_bruto,
       coalesce(k.ddv, 0) - coalesce(r.ddv, 0) as razlika_ddv,
       k.vnosi
from racuni_dan r full join kpo_dan k on k.dan = r.dan and k.stopnja = r.stopnja
where abs(coalesce(k.neto, 0) + coalesce(k.ddv, 0) - coalesce(r.neto, 0) - coalesce(r.ddv, 0)) >= 0.01
   or abs(coalesce(k.ddv, 0) - coalesce(r.ddv, 0)) >= 0.02
order by 1, 2;
-- Opomba: stari zakljucki izmen so knjizili z datumom ZAKLJUCKA (K5), zato se
-- del razlik med dnevi izravna znotraj istega meseca/cetrtletja. Za davek je
-- pomembna mesecna/cetrtletna vsota - glej blok 2.

-- ── 2. Mesecna primerjava (bruto in DDV) ───────────────────────────────────
with param as (
  select '00000000-0000-0000-0000-000000000001'::uuid as biz, '1d406efe-58d0-4573-8679-d9f666fce964'::uuid as org
),
racun as (
  select o.id, o.status, o.closed_at, o.voided_at, o.total - coalesce(o.tip_amount, 0) as zaracunano,
         (select sum(l.total) from order_lines l where l.order_id = o.id and not l.voided) as vsota
  from orders o, param p
  where o.business_id = p.biz and o.status in ('paid', 'voided')
    and coalesce(o.invoice_number, '') not like 'DEMO%'
    and not exists (select 1 from payments pm where pm.order_id = o.id and pm.method = 'pkg')
),
del as (
  select r.id, r.status, r.closed_at, r.voided_at, coalesce(l.vat_rate, 22) as stopnja,
         sum(l.total) * case when r.vsota > 0 then r.zaracunano / r.vsota else 1 end as bruto
  from racun r join order_lines l on l.order_id = r.id and not l.voided
  group by r.id, r.status, r.closed_at, r.voided_at, r.zaracunano, r.vsota, coalesce(l.vat_rate, 22)
),
d as (
  select *, round(bruto - bruto / (1 + stopnja / 100), 2) as ddv, round(bruto, 2) as b from del
),
iz_racunov as (
  select to_char(closed_at at time zone 'Europe/Ljubljana', 'YYYY-MM') as mesec, b, ddv from d
  union all
  select to_char(voided_at at time zone 'Europe/Ljubljana', 'YYYY-MM'), -b, -ddv from d where status = 'voided' and voided_at is not null
),
brez_postavk as (
  select to_char(o.closed_at at time zone 'Europe/Ljubljana', 'YYYY-MM') as mesec, sum(o.total) as znesek, string_agg('#' || o.number, ', ') as racuni
  from orders o, param p
  where o.business_id = p.biz and o.status = 'paid'
    and not exists (select 1 from order_lines l where l.order_id = o.id and not l.voided)
  group by 1
),
kpo as (
  select to_char(k.entry_date, 'YYYY-MM') as mesec, sum(k.income + k.vat_out) as b, sum(k.vat_out) as ddv
  from kpo_entries k, param p
  where k.org_id = p.org and k.category in ('pos_prodaja', 'pos_storitve', 'POS promet')
  group by 1
)
select m.mesec,
       (select round(sum(b), 2) from iz_racunov r where r.mesec = m.mesec) as bruto_racuni,
       (select b from kpo where kpo.mesec = m.mesec) as bruto_kpo,
       (select round(sum(ddv), 2) from iz_racunov r where r.mesec = m.mesec) as ddv_racuni,
       (select ddv from kpo where kpo.mesec = m.mesec) as ddv_kpo,
       bp.znesek as racuni_brez_postavk, bp.racuni as kateri
from (select mesec from iz_racunov union select mesec from kpo) m
left join brez_postavk bp on bp.mesec = m.mesec
order by 1;

-- ── 3. PREDLAGANI POPRAVKI (izpis, NE izvedba) ──────────────────────────────
-- 9.7.2026: rocni vnos 6a7707f9 (123,30 bruto, ves po 22 %) zajema tudi 9,5 % del,
-- ki ga je naknadni prenos c32f74b2 (2,50 bruto po 9,5 %) knjizil se enkrat.
-- Predlog: rocni vnos zmanjsamo na 22 % del dneva (izracunan iz racunov),
-- vnos c32f74b2 ostane. Preveri zneske v bloku 1 (dan 2026-07-09) pred izvedbo.
with param as (select '00000000-0000-0000-0000-000000000001'::uuid as biz),
dan22 as (
  select round(sum(l.total * case when s.vsota > 0 then (o.total - coalesce(o.tip_amount, 0)) / s.vsota else 1 end), 2) as bruto
  from orders o
  join lateral (select sum(total) as vsota from order_lines x where x.order_id = o.id and not x.voided) s on true
  join order_lines l on l.order_id = o.id and not l.voided and coalesce(l.vat_rate, 22) = 22,
  param p
  where o.business_id = p.biz and o.status in ('paid', 'voided')
    and (o.closed_at at time zone 'Europe/Ljubljana')::date = date '2026-07-09'
)
select format(
  'update kpo_entries set income = %s, vat_out = %s, vat_rate = 22, notes = concat_ws(%L, notes, %L) where id = %L;  -- bilo 101,30 / 22,00',
  round(bruto / 1.22, 2), round(bruto - bruto / 1.22, 2), ' ',
  'K5: popravljeno - 9,5 % del dneva je knjizen v c32f74b2 (prej dvojno).',
  '6a7707f9-0baf-4d5f-8405-5d49663333fb'
) as predlagan_stavek
from dan22;
-- Racun #40 (1.6.2026, 2,50 EUR, brez postavk in placila): o tem odloci lastnik
-- (glej glavo) - skripta zanj ne predlaga samodejnega stavka.
