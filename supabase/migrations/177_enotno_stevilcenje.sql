-- REVIZIJA K4 (oktober 2026): ENO ZAPOREDJE DAVČNO POTRJENIH ŠTEVILK
-- ═══════════════════════════════════════════════════════════════════
--
-- NAPAKA: blagajna je stevilko dobila iz next_invoice_number (pri nacinu
-- "device"/"premise" stevec pos_invoice_counters_scoped), racuni s portala
-- (lib/furs-invoice-confirm.ts, tudi Stripe) in storno (api/furs/void) pa iz
-- get_next_pos_invoice_number - LOCENEGA, starega stevca pos_invoice_counters.
-- Oba sta tvorila stevilke z ISTO predpono (prostor-naprava), zato je ista
-- stevilka nastala dvakrat (test s.p.: SIRBFB01-RACUNKO01-2 in -3, POS + Stripe;
-- oba para je FURS potrdil z locenima EOR). Naprave s kanalom 'web' so imele
-- se tretji vir: globalno zaporedje web_invoice_seq, skupno VSEM organizacijam.
--
-- POPRAVEK:
--   1. next_invoice_number je EDINI vir stevilk. Aplikacija klice samo njo.
--   2. get_next_pos_invoice_number ostane le zaradi zdruzljivosti (stari
--      odjemalci med uvajanjem): pri nacinu "central" vrne isto kot
--      next_invoice_number, pri "device"/"premise" pa ZAVRNE klic - brez
--      prostora in naprave bi dala stevilko iz napacnega zaporedja.
--   3. Stevci se PORAVNAJO na najvisjo ze porabljeno stevilko (blagajna,
--      portal, rezervacije, evidenca porabljenih), da nova stevilka ne trci s
--      stevilko, ki jo je prej podelil drugi stevec.
--   4. Dodelitev je atomarna: UPDATE ... RETURNING (zaklep vrstice); prva
--      dodelitev INSERT ... ON CONFLICT. Brez "preberi zadnjo + 1" v aplikaciji.
--
-- UVAJANJE: najprej objavi kodo (klice next_invoice_number), nato TAKOJ zazeni
-- to migracijo. Obratni vrstni red bi za nekaj minut zavrnil racune s portala
-- pri organizacijah z nacinom "device" (klic stare funkcije), kar je varneje
-- od podvojene stevilke, a nepotrebno.
--
-- Obstojecih podvojenih racunov ta migracija NE spreminja - glej
-- supabase/skripte/k4_podvojene_stevilke_dry_run.sql.

-- Zaporedna stevilka iz davcne oznake "PROSTOR-NAPRAVA-123" (ali null).
create or replace function public._zaporedna_iz_stevilke(p_stevilka text)
returns integer
language sql
immutable
as $$
  select nullif(substring(coalesce(p_stevilka, '') from '^[A-Za-z0-9]+-[A-Za-z0-9]+-([0-9]{1,9})$'), '')::integer
$$;

-- Najvisja ze porabljena davcna zaporedna stevilka podjetja (opcijsko samo
-- stevilke z dano predpono, npr. 'PE1-BLAG1-'). Upostevajo se VSI viri.
create or replace function public._najvisja_porabljena_stevilka(p_business_id uuid, p_predpona text default null)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  with orgs as (
    select o.id from organizations o
    where o.pos_business_id = p_business_id or (o.pos_business_id is null and o.id = p_business_id)
  )
  select coalesce(greatest(
    (select max(case when p_predpona is null then n.sequence_number else _zaporedna_iz_stevilke(n.invoice_number) end)
       from pos_invoice_numbers n
      where n.business_id = p_business_id
        and (p_predpona is null or n.invoice_number like p_predpona || '%')),
    (select max(_zaporedna_iz_stevilke(x.invoice_number))
       from orders x
      where x.business_id = p_business_id and x.invoice_number is not null
        and (p_predpona is null or x.invoice_number like p_predpona || '%')),
    (select max(_zaporedna_iz_stevilke(i.invoice_number))
       from issued_invoices i
      where i.org_id in (select id from orgs)
        and (i.zoi is not null or i.eor is not null or i.furs_rezervacija is not null)
        and (p_predpona is null or i.invoice_number like p_predpona || '%')),
    (select max((i.furs_rezervacija->>'sequence')::integer)
       from issued_invoices i
      where i.org_id in (select id from orgs) and i.furs_rezervacija ? 'sequence'
        and (p_predpona is null or (i.furs_rezervacija->>'invoiceNumber') like p_predpona || '%'))
  ), 0)
$$;

-- Centralni stevec (nacin "central"). Prej telo get_next_pos_invoice_number.
create or replace function public._naslednja_centralna_stevilka(p_business_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_num integer;
begin
  update pos_invoice_counters
     set last_number = last_number + 1, updated_at = now()
   where business_id = p_business_id
  returning last_number into v_num;
  if found then
    return v_num;
  end if;
  insert into pos_invoice_counters (business_id, last_number, updated_at)
  values (p_business_id, _najvisja_porabljena_stevilka(p_business_id) + 1, now())
  on conflict (business_id) do update
    set last_number = pos_invoice_counters.last_number + 1, updated_at = now()
  returning last_number into v_num;
  return v_num;
end $$;

create or replace function public.next_invoice_number(
  p_business_id uuid,
  p_premise_id uuid default null,
  p_device_id uuid default null,
  p_leto integer default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mode text;
  v_leto integer := coalesce(p_leto, extract(year from now())::integer);
  v_num integer;
  v_naprava uuid;
  v_prazna uuid := '00000000-0000-0000-0000-000000000000'::uuid;
begin
  -- Organizacija brez blagajne (pos_business_id is null) uporablja svoj id.
  select o.numbering_mode into v_mode
  from organizations o
  where o.pos_business_id = p_business_id or (o.pos_business_id is null and o.id = p_business_id)
  limit 1;
  v_mode := coalesce(v_mode, 'central');

  if v_mode = 'central' then
    return _naslednja_centralna_stevilka(p_business_id);
  end if;

  if p_premise_id is null then
    raise exception 'Za način "%" je poslovni prostor obvezen.', v_mode;
  end if;

  v_naprava := case when v_mode = 'device' then p_device_id else v_prazna end;
  if v_mode = 'device' and (v_naprava is null or v_naprava = v_prazna) then
    raise exception 'Za način "device" je elektronska naprava obvezna.';
  end if;

  update pos_invoice_counters_scoped
     set last_number = last_number + 1, updated_at = now()
   where business_id = p_business_id and premise_id = p_premise_id
     and device_id = v_naprava and leto = v_leto
  returning last_number into v_num;
  if found then
    return v_num;
  end if;

  -- PRELET 223 + K4: prva dodelitev nadaljuje za NAJVISJO ze porabljeno
  -- stevilko podjetja iz VSEH virov (prej samo pos_invoice_numbers - stevilke
  -- racunov s portala niso bile vstete).
  insert into pos_invoice_counters_scoped (business_id, premise_id, device_id, leto, last_number, updated_at)
  values (p_business_id, p_premise_id, v_naprava, v_leto, _najvisja_porabljena_stevilka(p_business_id) + 1, now())
  on conflict (business_id, premise_id, device_id, leto)
  do update set last_number = pos_invoice_counters_scoped.last_number + 1, updated_at = now()
  returning last_number into v_num;

  return v_num;
end $$;

-- Zdruzljivost: stari klicatelji brez prostora/naprave.
create or replace function public.get_next_pos_invoice_number(p_business_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mode text;
begin
  select o.numbering_mode into v_mode
  from organizations o
  where o.pos_business_id = p_business_id or (o.pos_business_id is null and o.id = p_business_id)
  limit 1;
  if coalesce(v_mode, 'central') <> 'central' then
    raise exception 'get_next_pos_invoice_number je zastarela: pri številčenju "%" mora klicatelj uporabiti next_invoice_number(podjetje, prostor, naprava).', v_mode;
  end if;
  return next_invoice_number(p_business_id);
end $$;

-- ── PORAVNAVA ŠTEVCEV ──────────────────────────────────────────────
-- Vsak stevec dvignemo na najvisjo ze porabljeno stevilko svojega zaporedja
-- (nikoli ne znizamo). Izpis pove, kateri stevec se je premaknil.
do $$
declare
  r record;
  v_najvisja integer;
  v_predpona text;
begin
  -- centralni stevci: za vsako podjetje (ali organizacijo brez blagajne), ki
  -- ima ze kaksno davcno stevilko
  for r in
    select distinct coalesce(o.pos_business_id, o.id) as podjetje
    from organizations o
  loop
    v_najvisja := _najvisja_porabljena_stevilka(r.podjetje);
    if v_najvisja > 0 then
      insert into pos_invoice_counters (business_id, last_number, updated_at)
      values (r.podjetje, v_najvisja, now())
      on conflict (business_id) do update
        set last_number = greatest(pos_invoice_counters.last_number, excluded.last_number), updated_at = now()
        where pos_invoice_counters.last_number < excluded.last_number;
      if found then
        raise notice 'K4 centralni stevec %: dvignjen na %', r.podjetje, v_najvisja;
      end if;
    end if;
  end loop;

  -- stevci po prostoru/napravi: najvisja stevilka z njihovo predpono
  for r in
    select s.business_id, s.premise_id, s.device_id, s.leto, s.last_number,
           bp.premise_id as oznaka_prostora, ed.device_id as oznaka_naprave
    from pos_invoice_counters_scoped s
    join business_premises bp on bp.id = s.premise_id
    left join electronic_devices ed on ed.id = s.device_id
  loop
    v_predpona := r.oznaka_prostora || '-' || coalesce(r.oznaka_naprave || '-', '');
    v_najvisja := _najvisja_porabljena_stevilka(r.business_id, v_predpona);
    if v_najvisja > r.last_number then
      update pos_invoice_counters_scoped
         set last_number = v_najvisja, updated_at = now()
       where business_id = r.business_id and premise_id = r.premise_id
         and device_id = r.device_id and leto = r.leto;
      raise notice 'K4 stevec % (%): % -> %', v_predpona, r.leto, r.last_number, v_najvisja;
    end if;
  end loop;
end $$;
