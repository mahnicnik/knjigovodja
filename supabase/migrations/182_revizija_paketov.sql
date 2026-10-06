-- ═══════════════════════════════════════════════════════════════════════
-- 182 REVIZIJA NAROČNIŠKIH PAKETOV (6.10.2026)
-- ═══════════════════════════════════════════════════════════════════════
--
-- NEPREKRSLJIVO PRAVILO: za organizacije, ki obstajajo ob uporabi te
-- migracije, se NE spremeni NIC. Vse obstojece vrstice dobijo
-- obstojeca_pravila = true in vsako novo preverjanje v tej migraciji se
-- zacne z "obstojeca -> dovoljeno, kot doslej". Nobena obstojeca politika
-- RLS se ne spremeni ali izbrise - samo DODAMO (RESTRICTIVE) pogoje, ki za
-- obstojece organizacije vrnejo true. Obstojeci podatki (subscription_status,
-- plan, trial_ends_at, plan_expires_at, stripe_*) se ne spremenijo.
--
-- Nova pravila (samo nove organizacije):
--   * brezplacni paket najvec 5 racunov (sprozilec v bazi)
--   * narocnino (subscription_status, trial_ends_at, plan_expires_at,
--     stripe_customer_id, stripe_subscription_id) spreminja samo streznik
--   * vnos narocil blagajne (orders) samo s paketom Pro + POS
--   * racunovodja/gledalec = Pro, blagajnik = Pro + POS
--   * vpis v organizacijo samo kot lastnik nove prazne org ali z veljavnim povabilom
--   * iztekel preizkus = free takoj (efektivni_paket)
--
-- Obratna migracija: 182_revizija_paketov_down.sql. Migracija je idempotentna.
-- Enaka pravila v kodi: apps/web/lib/paket.ts.

-- ─────────────────────────────────────────────────────────────────
-- 1. OZNAKA OBSTOJEČIH ORGANIZACIJ
-- ─────────────────────────────────────────────────────────────────
-- ADD COLUMN ... DEFAULT true napolni VSE obstojece vrstice s true brez
-- UPDATE (ne sprozi sprozilcev, ne spremeni updated_at); nato privzeto
-- vrednost za NOVE vrstice nastavimo na false. Oboje v isti transakciji.
-- Ob ponovnem zagonu stolpec ze obstaja in vrednosti ostanejo.
alter table public.organizations
  add column if not exists obstojeca_pravila boolean not null default true;
alter table public.organizations
  alter column obstojeca_pravila set default false;

-- Opomniki pred iztekom preizkusa (/api/cron/opomniki-preizkusa).
alter table public.organizations add column if not exists preizkus_opomnik_3d_ob timestamptz;
alter table public.organizations add column if not exists preizkus_opomnik_0d_ob timestamptz;

-- ─────────────────────────────────────────────────────────────────
-- 2. POMOŽNE FUNKCIJE
-- ─────────────────────────────────────────────────────────────────
create or replace function public.je_streznik()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or current_user in ('postgres', 'supabase_admin')
$$;

-- Obstojeca organizacija (ali neznana) -> true. Nova pravila samo ob izrecnem false.
create or replace function public.org_je_obstojeca(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select o.obstojeca_pravila from public.organizations o where o.id = p_org_id), true)
$$;

-- Obstojece: kot doslej (samo subscription_status). Nove: iztekel preizkus = free.
create or replace function public.efektivni_paket(p_org_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when o.subscription_status not in ('pro', 'pro_pos') then 'free'
    when not o.obstojeca_pravila
         and o.trial_ends_at is not null and o.trial_ends_at <= now()
         and o.stripe_subscription_id is null then 'free'
    else o.subscription_status
  end
  from public.organizations o
  where o.id = p_org_id
$$;

-- Ali sme organizacija uporabiti funkcijo s cenika. Obstojece: VEDNO true.
create or replace function public.org_dovoljeno(p_org_id uuid, p_funkcija text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.org_je_obstojeca(p_org_id) then true
    when p_funkcija in ('pos', 'zaloge', 'ekipa_pin', 'pos_kartica')
      then public.efektivni_paket(p_org_id) = 'pro_pos'
    else public.efektivni_paket(p_org_id) in ('pro', 'pro_pos')
  end
$$;

revoke all on function public.org_je_obstojeca(uuid) from public;
revoke all on function public.efektivni_paket(uuid) from public;
revoke all on function public.org_dovoljeno(uuid, text) from public;
grant execute on function public.org_je_obstojeca(uuid) to authenticated, service_role;
grant execute on function public.efektivni_paket(uuid) to authenticated, service_role;
grant execute on function public.org_dovoljeno(uuid, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────
-- 3. NAROČNINO SPREMINJA SAMO STREŽNIK (nove organizacije)
-- ─────────────────────────────────────────────────────────────────
-- obstojeca_pravila sam po sebi je zasciten za VSE (nov stolpec - nicesar,
-- kar obstojece organizacije danes pocnejo, ne spremeni). Brez tega bi si
-- nova organizacija lahko sama nastavila true in obsla vsa nova pravila.
create or replace function public.zasciti_narocnino()
returns trigger
language plpgsql
as $$
begin
  if public.je_streznik() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Organizacija iz brskalnika/aplikacije je vedno nova in brezplacna.
    -- Preizkus dodeli samo handle_new_user ob registraciji.
    new.obstojeca_pravila := false;
    new.subscription_status := 'free';
    new.trial_ends_at := null;
    new.plan_expires_at := null;
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    return new;
  end if;

  if new.obstojeca_pravila is distinct from old.obstojeca_pravila then
    raise exception 'Oznake pravil organizacije ni mogoče spremeniti.' using errcode = '42501';
  end if;

  if old.obstojeca_pravila then
    return new;                         -- obstojece organizacije: kot doslej
  end if;

  if new.subscription_status is distinct from old.subscription_status
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.plan_expires_at is distinct from old.plan_expires_at
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  then
    raise exception 'Naročnino lahko spremeni samo strežnik (Stripe).' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists trg_zasciti_narocnino on public.organizations;
create trigger trg_zasciti_narocnino
  before insert or update on public.organizations
  for each row execute function public.zasciti_narocnino();

-- ─────────────────────────────────────────────────────────────────
-- 4. BREZPLAČNI PAKET: NAJVEČ 5 RAČUNOV (nove organizacije)
-- ─────────────────────────────────────────────────────────────────
-- Stejejo se racuni (invoice_type 'invoice', tudi avansni in osnutki);
-- dobropisi/storno in dobavnice ne. Velja tudi za service role.
create or replace function public.omeji_brezplacne_racune()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stevilo int;
begin
  if coalesce(new.invoice_type, 'invoice') <> 'invoice' then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.invoice_type, 'invoice') = 'invoice'
     and old.org_id = new.org_id then
    return new;
  end if;
  if public.org_je_obstojeca(new.org_id) then
    return new;                         -- obstojece organizacije: kot doslej
  end if;
  if public.efektivni_paket(new.org_id) <> 'free' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('omeji_brezplacne_racune:' || new.org_id::text, 0));

  select count(*) into v_stevilo
  from public.issued_invoices
  where org_id = new.org_id
    and coalesce(invoice_type, 'invoice') = 'invoice';

  if v_stevilo >= 5 then
    raise exception 'Brezplačni paket omogoča do 5 računov. Za nove račune izberite paket Pro (Nastavitve → Naročnina).'
      using errcode = 'P0001', hint = 'omejitev_brezplacnega_paketa';
  end if;
  return new;
end
$$;

drop trigger if exists trg_omeji_brezplacne_racune on public.issued_invoices;
create trigger trg_omeji_brezplacne_racune
  before insert or update of invoice_type, org_id on public.issued_invoices
  for each row execute function public.omeji_brezplacne_racune();

-- ─────────────────────────────────────────────────────────────────
-- 5. NAROČILA BLAGAJNE (mobilna/spletna blagajna) – nove organizacije
-- ─────────────────────────────────────────────────────────────────
-- orders.business_id je organizations.pos_business_id ali organizations.id
-- (glej current_user_business_ids). Ce blagajne ni mogoce povezati z
-- organizacijo, ali je katera od povezanih obstojeca -> dovoljeno.
-- Obstojeca politika "Business scope" ostane nespremenjena; RESTRICTIVE
-- politika se z njo poveze z AND, samo za INSERT.
create or replace function public.pos_narocilo_dovoljeno(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select bool_or(o.obstojeca_pravila or public.efektivni_paket(o.id) = 'pro_pos')
       from public.organizations o
      where o.pos_business_id = p_business_id or o.id = p_business_id),
    true)
$$;

revoke all on function public.pos_narocilo_dovoljeno(uuid) from public;
grant execute on function public.pos_narocilo_dovoljeno(uuid) to authenticated, service_role;

drop policy if exists "orders_insert_paket" on public.orders;
create policy "orders_insert_paket" on public.orders
  as restrictive
  for insert
  with check (public.pos_narocilo_dovoljeno(business_id));

-- ─────────────────────────────────────────────────────────────────
-- 6. ČLANSTVO IN POVABILA (nove organizacije)
-- ─────────────────────────────────────────────────────────────────
-- Uporabnik se v NOVO organizacijo sme sam vpisati samo:
--   a) kot 'owner' v organizacijo BREZ clanov, ustvarjeno v zadnji uri, ali
--   b) z veljavnim povabilom na svoj e-naslov, z enako vlogo, ki ga je
--      ustvaril lastnik/admin te organizacije.
-- Obstojece politike org_members ostanejo; RESTRICTIVE politika za obstojece
-- organizacije vrne true.
create or replace function public.sme_vstopiti_v_org(p_org_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.org_je_obstojeca(p_org_id)
    or (
      p_role = 'owner'
      and not exists (select 1 from org_members m where m.org_id = p_org_id)
      and exists (select 1 from organizations o where o.id = p_org_id
                  and o.created_at > now() - interval '1 hour')
    )
    or exists (
      select 1
      from org_invites i
      join org_members inv on inv.org_id = i.org_id and inv.user_id = i.invited_by
                          and inv.role in ('owner', 'admin')
      where i.org_id = p_org_id
        and lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and i.role = p_role
        and i.accepted_at is null
        and (i.expires_at is null or i.expires_at > now())
    )
$$;

revoke all on function public.sme_vstopiti_v_org(uuid, text) from public;
grant execute on function public.sme_vstopiti_v_org(uuid, text) to authenticated;

drop policy if exists "org_members_insert_nova_org" on public.org_members;
create policy "org_members_insert_nova_org" on public.org_members
  as restrictive
  for insert to authenticated
  with check (public.sme_vstopiti_v_org(org_id, role));

-- Povabila v NOVI organizaciji ustvarja/spreminja samo lastnik/admin.
create or replace function public.sme_urejati_povabila(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.org_je_obstojeca(p_org_id)
      or exists (select 1 from org_members m where m.org_id = p_org_id
                 and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
$$;

revoke all on function public.sme_urejati_povabila(uuid) from public;
grant execute on function public.sme_urejati_povabila(uuid) to authenticated;

drop policy if exists "org_invites_insert_nova_org" on public.org_invites;
drop policy if exists "org_invites_update_nova_org" on public.org_invites;
drop policy if exists "org_invites_delete_nova_org" on public.org_invites;
create policy "org_invites_insert_nova_org" on public.org_invites
  as restrictive for insert to authenticated
  with check (public.sme_urejati_povabila(org_id));
create policy "org_invites_update_nova_org" on public.org_invites
  as restrictive for update to authenticated
  using (public.sme_urejati_povabila(org_id))
  with check (public.sme_urejati_povabila(org_id));
create policy "org_invites_delete_nova_org" on public.org_invites
  as restrictive for delete to authenticated
  using (public.sme_urejati_povabila(org_id));

-- Ob vstopu z povabilom v NOVO organizacijo se povabilo porabi (povabljenec
-- ga po zgornji politiki ne sme vec spreminjati sam).
create or replace function public.porabi_povabilo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.org_je_obstojeca(new.org_id) then
    return new;                         -- obstojece organizacije: kot doslej
  end if;
  update org_invites i
     set accepted_at = now()
   where i.org_id = new.org_id
     and i.accepted_at is null
     and i.role = new.role
     and lower(i.email) = lower(coalesce(
           (select u.email from auth.users u where u.id = new.user_id), ''));
  return new;
end
$$;

drop trigger if exists trg_porabi_povabilo on public.org_members;
create trigger trg_porabi_povabilo
  after insert on public.org_members
  for each row execute function public.porabi_povabilo();

-- Racunovodja/gledalec = Pro, blagajnik = Pro + POS (nove organizacije, tudi service role).
create or replace function public.vloga_po_paketu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.role is not distinct from old.role then
    return new;
  end if;
  if new.role = 'cashier' and not public.org_dovoljeno(new.org_id, 'ekipa_pin') then
    raise exception 'Ekipa s PIN prijavo (blagajnik) je na voljo v paketu Pro + POS.'
      using errcode = 'P0001', hint = 'omejitev_paketa';
  end if;
  if new.role in ('accountant', 'viewer') and not public.org_dovoljeno(new.org_id, 'racunovodja') then
    raise exception 'Dostop za računovodjo je na voljo v paketih Pro in Pro + POS.'
      using errcode = 'P0001', hint = 'omejitev_paketa';
  end if;
  return new;
end
$$;

drop trigger if exists trg_vloga_po_paketu on public.org_members;
create trigger trg_vloga_po_paketu
  before insert or update of role on public.org_members
  for each row execute function public.vloga_po_paketu();

-- ─────────────────────────────────────────────────────────────────
-- 7. REGISTRACIJA: ime podjetja in davčna iz metapodatkov (mobilna aplikacija)
-- ─────────────────────────────────────────────────────────────────
-- Enako kot doslej (14 dni preizkusa Pro + POS); dodano samo: ce signUp
-- poslje org_name / tax_number (apps/mobile/app/register.tsx), se uporabita.
-- Spletna registracija ju ne poslje -> ime kot doslej.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
as $function$
declare
  v_org_id uuid;
  v_full_name text;
  v_org_name text;
begin
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', '');
  v_org_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'org_name'), ''),
    coalesce(nullif(v_full_name, ''), split_part(new.email, '@', 1)) || ' s.p.'
  );

  -- PRELET 212: preizkus traja 14 dni in obsega VSE, tudi blagajno.
  -- `trial_ends_at` je locen od `plan_expires_at`: prvi pove, da gre za
  -- preizkus (in da ob izteku pademo na `free`), drugi pa velja za placane
  -- narocnine. Ce bi uporabili isto polje, ob izteku ne bi vedeli, ali je
  -- slo za neplacnika ali za nekoga, ki preizkusa ni podaljsal.
  insert into public.organizations (name, plan, subscription_status, trial_ends_at, tax_number)
  values (v_org_name, 'solo', 'pro_pos', now() + interval '14 days',
          nullif(trim(new.raw_user_meta_data->>'tax_number'), ''))
  returning id into v_org_id;

  insert into public.org_members (org_id, user_id, role)
  values (v_org_id, new.id, 'owner');

  return new;
end;
$function$;
