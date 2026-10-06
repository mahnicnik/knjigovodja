-- ═══════════════════════════════════════════════════════════════════════
-- 182 REVIZIJA NAROČNIŠKIH PAKETOV (6.10.2026)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Odpravlja (docs/revizija-paketov-2026-10.md):
--   K1  vsak prijavljen uporabnik se je lahko vpisal kot 'owner' v
--       KATEROKOLI organizacijo (politika users_can_insert_members, CHECK true)
--   K2  lastnik/admin je lahko sam spremenil subscription_status,
--       trial_ends_at, plan_expires_at in stripe_* (RLS update) in
--       ustvaril novo organizacijo s paketom pro_pos (insert, CHECK true)
--   K4  omejitev 5 racunov brezplacnega paketa je bila samo v brskalniku
--   K5  iztekel preizkus je ostal placljiv paket, dokler ga ni pospravil
--       nocni pg_cron posel
--
-- Pravilo `efektivni_paket` je enako kot `efektivniPaket` v apps/web/lib/paket.ts.
-- Migracija je idempotentna.

-- ─────────────────────────────────────────────────────────────────
-- 1. EFEKTIVNI PAKET
-- ─────────────────────────────────────────────────────────────────
create or replace function public.efektivni_paket(p_org_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when o.subscription_status not in ('pro', 'pro_pos') then 'free'
    -- Iztekel preizkus brez placila je brezplacni paket TAKOJ, ne sele po
    -- nocnem opravilu zakljuci_iztekle_preizkuse.
    when o.trial_ends_at is not null and o.trial_ends_at <= now()
         and o.stripe_subscription_id is null then 'free'
    else o.subscription_status
  end
  from public.organizations o
  where o.id = p_org_id
$$;

revoke all on function public.efektivni_paket(uuid) from public;
grant execute on function public.efektivni_paket(uuid) to authenticated, service_role;

-- Ali klic prihaja s strezniskega kljuca (service role) ali iz same baze
-- (sprozilci SECURITY DEFINER, pg_cron) - enako kot zasciti_stripe_connect_stolpce.
create or replace function public.je_streznik()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or current_user in ('postgres', 'supabase_admin')
$$;

-- ─────────────────────────────────────────────────────────────────
-- 2. NAROČNINO SPREMINJA SAMO STREŽNIK (K2)
-- ─────────────────────────────────────────────────────────────────
create or replace function public.zasciti_narocnino()
returns trigger
language plpgsql
as $$
begin
  if public.je_streznik() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Organizacija, ustvarjena iz brskalnika/mobilne aplikacije, je vedno
    -- brezplacna. Preizkus dodeli samo handle_new_user ob registraciji.
    new.subscription_status := 'free';
    new.trial_ends_at := null;
    new.plan_expires_at := null;
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    return new;
  end if;

  if new.subscription_status is distinct from old.subscription_status
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.plan_expires_at is distinct from old.plan_expires_at
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  then
    raise exception 'Naročnino lahko spremeni samo strežnik (Stripe).'
      using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists trg_zasciti_narocnino on public.organizations;
create trigger trg_zasciti_narocnino
  before insert or update on public.organizations
  for each row execute function public.zasciti_narocnino();

-- ─────────────────────────────────────────────────────────────────
-- 3. BREZPLAČNI PAKET: NAJVEČ 5 RAČUNOV SKUPAJ (K4)
-- ─────────────────────────────────────────────────────────────────
-- Stejejo se racuni (invoice_type = 'invoice', tudi avansni in osnutki).
-- Dobropisi/storno (credit_note) in dobavnice NE: popravek ze izdanega
-- racuna mora biti mogoc vedno (zakonska obveznost).
-- Velja tudi za service role (ponavljajoci racuni, /api/v1/invoices).
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
  if public.efektivni_paket(new.org_id) <> 'free' then
    return new;
  end if;

  -- Dve hkratni vstavitvi ne smeta obe videti "4 obstojece".
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
-- 4. ČLANSTVO V ORGANIZACIJI (K1) IN VLOGE PO PAKETU
-- ─────────────────────────────────────────────────────────────────
-- Uporabnik se sme sam vpisati samo:
--   a) kot 'owner' v organizacijo BREZ clanov, ustvarjeno v zadnji uri
--      (mobilna registracija: insert organizations -> insert org_members), ali
--   b) z veljavnim povabilom na svoj e-naslov, z enako vlogo, ki ga je
--      ustvaril lastnik/admin te organizacije (/invite/[id]).
-- Vse ostalo (Ekipa -> povabi, /api/team/invite) gre prek service role.
create or replace function public.sme_vstopiti_v_org(p_org_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (
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

drop policy if exists "users_can_insert_members" on public.org_members;
drop policy if exists "Users can insert own membership" on public.org_members;
drop policy if exists "org_members_insert_self" on public.org_members;
create policy "org_members_insert_self" on public.org_members
  for insert to authenticated
  with check (user_id = auth.uid() and public.sme_vstopiti_v_org(org_id, role));

-- Racunovodja/gledalec zahtevata Pro, blagajnik (PIN) Pro + POS.
-- Velja tudi za service role (/api/team/invite, /api/team/change-role).
-- Obstojecih clanov ob znizanju paketa ne brisemo.
create or replace function public.vloga_po_paketu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paket text;
begin
  if tg_op = 'UPDATE' and new.role is not distinct from old.role then
    return new;
  end if;
  if new.role not in ('accountant', 'viewer', 'cashier') then
    return new;
  end if;
  v_paket := public.efektivni_paket(new.org_id);
  if new.role = 'cashier' and v_paket <> 'pro_pos' then
    raise exception 'Ekipa s PIN prijavo (blagajnik) je na voljo v paketu Pro + POS.'
      using errcode = 'P0001', hint = 'omejitev_paketa';
  end if;
  if new.role in ('accountant', 'viewer') and v_paket = 'free' then
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

-- Povabila sme ustvarjati in spreminjati samo lastnik/admin. Prej je smel
-- vsak clan (tudi blagajnik) - in z invited_by = lastnik ter vlogo 'admin'
-- bi si lahko sam povecal pravice prek tocke b) zgoraj.
drop policy if exists "org members only" on public.org_invites;
drop policy if exists "org_invites_select_member" on public.org_invites;
drop policy if exists "org_invites_write_owner_admin" on public.org_invites;
create policy "org_invites_select_member" on public.org_invites
  for select to authenticated
  using (org_id in (select public.get_user_org_ids()));
create policy "org_invites_write_owner_admin" on public.org_invites
  for all to authenticated
  using (org_id in (select m.org_id from public.org_members m
                    where m.user_id = auth.uid() and m.role in ('owner', 'admin')))
  with check (org_id in (select m.org_id from public.org_members m
                         where m.user_id = auth.uid() and m.role in ('owner', 'admin')));

-- Ob vstopu z povabilom se povabilo porabi (prej ga je oznacil brskalnik
-- povabljenca, ki po novi politiki povabila ne sme vec spreminjati).
create or replace function public.porabi_povabilo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
