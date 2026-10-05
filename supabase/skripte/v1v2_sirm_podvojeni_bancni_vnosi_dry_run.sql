-- V1/V2: PODVOJENI VNOSI IZ BANČNEGA UVOZA (ŠIRM) — PREGLED (DRY-RUN)
-- ════════════════════════════════════════════════════════════════════
--
-- Enkratna skripta za ROCNI pregled. Samo SELECT - nic ne spreminja.
-- Isto pravilo kot apps/web/lib/banka-ujemanje.ts (nova logika bancnega uvoza):
--   A  priliv = izplacilo ze knjizenega kartičnega obracuna
--      (0-7 dni po obracunu, znesek = bruto − provizija ± 1 % bruto)
--   B  priliv = placilo ze izdanega racuna (znesek na cent, od izdaje do 90 dni
--      po zapadlosti)
--   C  odliv  = placilo ze vnesenega prejetega racuna (znesek na cent, 5 dni pred
--      do 45 dni po datumu racuna)
-- Stolpec `predlog` vsebuje stavek, ki ga po pregledu izvedes rocno. Pri C
-- preveri, da gre res za isti racun (pri ponavljajocih se zneskih, npr.
-- narocnine po 30 EUR, je lahko ujemanje napacno).
--
-- Rezultat 5.10.2026 (SIRM, vse v Q2 2026, Q3 ni prizadet):
--   A 11 izplacil Worldline, 9.408,21 EUR (+ 30.6. 375,59 EUR z odstopanjem 5 %)
--   B 3 x 479,98 = 1.439,94 EUR (racuni 2026-007/010/011)
--   C 38 odlivov s kandidatom, 5.247,98 EUR (ta skripta ne dodeljuje enolicno);
--     aplikacija z enolicnim dodeljevanjem: 34 odlivov, 5.127,98 EUR
--     (18 zanesljivih po imenu/edinem kandidatu = 2.813,45 EUR, 16 za pregled)

with param as (select '1d406efe-58d0-4573-8679-d9f666fce964'::uuid as org),
banka as (
  select k.* from kpo_entries k, param p
  where k.org_id = p.org and k.notes like 'Bančni uvoz%' and k.invoice_id is null and k.receipt_id is null
),
obracun as (
  select k.id, k.entry_date, k.income as bruto,
         coalesce((select sum(f.expense) from kpo_entries f where f.org_id = k.org_id and f.entry_date = k.entry_date
                   and f.category = 'Bančne provizije' and f.description like 'Provizija %'), 0) as provizija
  from kpo_entries k, param p
  where k.org_id = p.org and k.category = 'Kartično poslovanje' and k.income > 0
),
a as (
  select 'A izplacilo kartic' as vrsta, b.id, b.entry_date, b.income as znesek, o.entry_date::text || ' bruto ' || o.bruto as povezano,
         case when abs(b.income - (o.bruto - o.provizija)) <= greatest(0.01 * o.bruto, 0.5) then 'gotovo' else 'verjetno' end as zanesljivost
  from banka b join obracun o
    on b.income > 0 and b.entry_date - o.entry_date between 0 and 7
   and b.income <= o.bruto + 0.01 and b.income >= 0.9 * o.bruto
),
b as (
  select 'B placilo racuna' as vrsta, b.id, b.entry_date, b.income, i.invoice_number || ' ' || i.client_name || ' (' || i.status || ')',
         'verjetno'
  from banka b join issued_invoices i
    on i.org_id = b.org_id and b.income > 0 and abs(i.amount_total - b.income) < 0.011
   and b.entry_date >= coalesce(i.issue_date, i.due_date) - 5 and b.entry_date <= coalesce(i.due_date, i.issue_date) + 90
   and i.status not in ('draft', 'cancelled')
),
c as (
  select 'C placilo prejetega racuna' as vrsta, b.id, b.entry_date, b.expense, r.vendor || ' ' || r.receipt_date,
         'verjetno'
  from banka b join receipts r
    on r.org_id = b.org_id and b.expense > 0 and abs(r.amount_total - b.expense) < 0.011
   and b.entry_date - r.receipt_date between -5 and 45
)
select x.vrsta, x.entry_date, x.znesek, x.povezano, x.zanesljivost,
       format('delete from kpo_entries where id = %L;  -- %s %s EUR', x.id, x.entry_date, x.znesek) as predlog
from (select * from a union all select * from b union all select * from c) x
order by x.vrsta, x.entry_date;
-- Opomba: en bancni vnos se lahko pojavi pri vec kandidatih (npr. trije prilivi po
-- 479,98 in trije racuni). Vsak bancni vnos izbrisi le ENKRAT in vsak racun
-- uporabi le enkrat - aplikacija to zagotovi samodejno (porabljeni kandidati).
