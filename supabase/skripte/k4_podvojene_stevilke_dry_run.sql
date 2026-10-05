-- K4: PODVOJENE DAVČNE ŠTEVILKE RAČUNOV — PREGLED (DRY-RUN)
-- ══════════════════════════════════════════════════════════
--
-- Enkratna skripta za ROCNI pregled. Vsebuje SAMO poizvedbe (SELECT) - nic ne
-- spreminja. Ni del migracij in se ne izvaja samodejno.
--
-- Zagon: Supabase SQL Editor (ali psql) - zazeni celotno datoteko; vsak blok
-- vrne svojo tabelo.
--
-- ZAKAJ SAMO PREGLED: vsi podvojeni racuni so bili POTRJENI pri FURS z
-- LOCENIMA EOR (preverjeno 5.10.2026). Stevilka je natisnjena na racunu, ki ga
-- ima kupec, in zapisana pri FURS. Preimenovanje v nasi bazi bi povzrocilo,
-- da se nasa evidenca NE ujema vec s FURS in z natisnjenim racunom - kar je
-- huje od podvojene stevilke. O ukrepu (pojasnilo FURS, opomba v evidenci)
-- odloci racunovodja/lastnik; predlogi so v stolpcu `predlog`.

-- ── 1. Vsi podvojeni davcni racuni (blagajna + portal) ──────────────────────
with racuni as (
  select org.id as org_id, org.name as organizacija, org.furs_test_mode,
         'blagajna' as vir, ord.invoice_number as stevilka, ord.id::text as zapis,
         ord.closed_at as izdano, ord.total as znesek, ord.status,
         (select string_agg(p.furs_eor, ',') from payments p where p.order_id = ord.id and p.furs_eor is not null) as eor,
         (select string_agg(p.furs_zoi, ',') from payments p where p.order_id = ord.id and p.furs_zoi is not null) as zoi
  from orders ord
  join organizations org on org.pos_business_id = ord.business_id
  where ord.invoice_number ~ '^[A-Za-z0-9]+-[A-Za-z0-9]+-[0-9]+$'
  union all
  select org.id, org.name, org.furs_test_mode,
         'portal', i.invoice_number, i.id::text, i.created_at, i.amount_total, i.status, i.eor, i.zoi
  from issued_invoices i
  join organizations org on org.id = i.org_id
  where i.invoice_number ~ '^[A-Za-z0-9]+-[A-Za-z0-9]+-[0-9]+$'
    and (i.eor is not null or i.zoi is not null)
),
dvojniki as (
  select org_id, stevilka from racuni group by 1, 2 having count(*) > 1
)
select r.organizacija,
       case when r.furs_test_mode then 'FURS TESTNO okolje' else 'FURS PRODUKCIJA' end as okolje,
       r.stevilka, r.vir, r.zapis, r.izdano, r.znesek, r.status, r.eor, r.zoi,
       row_number() over (partition by r.org_id, r.stevilka order by r.izdano) as zaporedje_izdaje,
       case
         when r.furs_test_mode then
           'Testno okolje FURS: brez pravnih posledic. Predlog: pustiti, opomba v evidenci.'
         when row_number() over (partition by r.org_id, r.stevilka order by r.izdano) = 1 then
           'Prvi izdan s to stevilko: ostane nespremenjen.'
         else
           'Drugi racun z isto stevilko, potrjen s svojim EOR. Predlog: NE preimenovati; '
           || 'dodati opombo v pos_invoice_numbers/orders.note in o primeru obvestiti racunovodjo '
           || '(odlocitev o pojasnilu FURS).'
       end as predlog
from racuni r
join dvojniki d on d.org_id = r.org_id and d.stevilka = r.stevilka
order by r.organizacija, r.stevilka, r.izdano;

-- ── 2. Predlagane opombe (samo izpis UPDATE stavkov, NE izvedba) ───────────
-- Skopiraj in rocno izvedi SAMO po pregledu.
with racuni as (
  select org.id as org_id, org.furs_test_mode, ord.invoice_number as stevilka, ord.id, ord.closed_at as izdano, 'orders' as tabela
  from orders ord join organizations org on org.pos_business_id = ord.business_id
  where ord.invoice_number ~ '^[A-Za-z0-9]+-[A-Za-z0-9]+-[0-9]+$'
  union all
  select org.id, org.furs_test_mode, i.invoice_number, i.id, i.created_at, 'issued_invoices'
  from issued_invoices i join organizations org on org.id = i.org_id
  where i.invoice_number ~ '^[A-Za-z0-9]+-[A-Za-z0-9]+-[0-9]+$' and (i.eor is not null or i.zoi is not null)
),
oznaceni as (
  select r.*, count(*) over (partition by r.org_id, r.stevilka) as n,
         row_number() over (partition by r.org_id, r.stevilka order by r.izdano) as zap
  from racuni r
)
select format(
  'update %I set %s = concat_ws(%L, %s, %L) where id = %L;  -- %s (%s. izdaja)',
  tabela,
  case when tabela = 'orders' then 'note' else 'notes' end,
  ' ',
  case when tabela = 'orders' then 'note' else 'notes' end,
  'K4: davcna stevilka ' || stevilka || ' je podvojena (' || n || 'x); oba racuna potrjena pri FURS z locenim EOR.',
  id, stevilka, zap
) as predlagan_stavek
from oznaceni
where n > 1
order by stevilka, zap;

-- ── 3. Kaj bo migracija 177 storila s stevci (pregled pred zagonom) ────────
-- Zahteva funkcijo _najvisja_porabljena_stevilka iz migracije 177; pred
-- migracijo zazeni le blok 1 in 2.
select 'centralni' as stevec, c.business_id::text as podjetje, null::text as predpona,
       c.last_number as zdaj, public._najvisja_porabljena_stevilka(c.business_id) as najvisja_porabljena
from pos_invoice_counters c
union all
select 'po napravi/prostoru', s.business_id::text,
       bp.premise_id || '-' || coalesce(ed.device_id || '-', ''),
       s.last_number,
       public._najvisja_porabljena_stevilka(s.business_id, bp.premise_id || '-' || coalesce(ed.device_id || '-', ''))
from pos_invoice_counters_scoped s
join business_premises bp on bp.id = s.premise_id
left join electronic_devices ed on ed.id = s.device_id
order by 1, 2;
