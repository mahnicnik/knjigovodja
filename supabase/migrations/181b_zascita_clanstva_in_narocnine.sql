-- ═══════════════════════════════════════════════════════════════════════
-- 181b ZAŠČITA ČLANSTVA (K1) IN NAROČNINE (K2) – ZA VSE ORGANIZACIJE
-- ═══════════════════════════════════════════════════════════════════════
-- Ločena od 182 (paketi). Uporabi SAMO z izrecno potrditvijo lastnika.
-- Obratna migracija: 181b_zascita_clanstva_in_narocnine_down.sql
--
-- K1  Politika org_members "users_can_insert_members" (WITH CHECK true) je
--     dovolila vsakemu prijavljenemu uporabniku, da se vpise kot 'owner' v
--     KATEROKOLI organizacijo (dostop do vseh racunov, KPO, plac).
-- K2  Lastnik/admin je prek RLS sam spremenil subscription_status, plan,
--     trial_ends_at, plan_expires_at, stripe_customer_id/subscription_id
--     (npr. si dodelil Pro + POS za vedno) ali ustvaril org. s paketom.
--
-- KAJ OSTANE ENAKO (preverjeno v tests/paketi-baza.spec.ts):
--   * povabilo prek Nastavitve -> Ekipa (/api/team/invite, service role)
--   * sprejem povabila na /invite/[id] (zdaj tudi dejansko deluje: povabljenec
--     sme prebrati SVOJE povabilo, prej ga RLS ni pokazal)
--   * registracija (handle_new_user), urejanje podatkov organizacije
--   * Stripe webhook, checkout, portal (service role)
--   * paketi in vrednosti obstojecih organizacij - nic se ne prepise
--
-- POGOJ ZA UPORABO: koda, v kateri checkout/portal pisejo stripe_customer_id
-- s service role (veja claude/adoring-fermat-4b1ilc), mora biti ze objavljena.
-- Migracija je idempotentna. Imena se ne prekrivajo z migracijo 182.

-- ─────────────────────────────────────────────────────────────────
-- K2: NAROČNINO SPREMINJA SAMO STREŽNIK
-- ─────────────────────────────────────────────────────────────────
create or replace function public.zasciti_stolpce_narocnine()
returns trigger
language plpgsql
as $$
begin
  -- Streznik (service role: webhook, checkout, portal) in baza sama
  -- (handle_new_user, pg_cron zakljuci_iztekle_preizkuse) smeta vse.
  if coalesce(auth.role(), '') = 'service_role'
     or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Organizacija iz brskalnika/aplikacije je vedno brezplacna.
    new.subscription_status := 'free';
    new.plan := 'solo';
    new.trial_ends_at := null;
    new.plan_expires_at := null;
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    return new;
  end if;

  if new.subscription_status is distinct from old.subscription_status
     or new.plan is distinct from old.plan
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

drop trigger if exists trg_zasciti_stolpce_narocnine on public.organizations;
create trigger trg_zasciti_stolpce_narocnine
  before insert or update on public.organizations
  for each row execute function public.zasciti_stolpce_narocnine();

-- ─────────────────────────────────────────────────────────────────
-- K1: VPIS V ORGANIZACIJO SAMO Z VELJAVNIM POVABILOM
-- ─────────────────────────────────────────────────────────────────
-- Uporabnik se sme sam vpisati (iz brskalnika) samo:
--   a) kot 'owner' v organizacijo BREZ clanov, ustvarjeno v zadnji uri
--      (stare razlicice mobilne registracije), ali
--   b) z veljavnim povabilom na svoj e-naslov in z ENAKO vlogo.
-- Povabila sme po spodnji politiki ustvarjati samo lastnik/admin.
create or replace function public.clanstvo_dovoljeno(p_org_id uuid, p_role text)
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
      select 1 from org_invites i
      where i.org_id = p_org_id
        and lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and i.role = p_role
        and i.accepted_at is null
        and (i.expires_at is null or i.expires_at > now())
    )
$$;

revoke all on function public.clanstvo_dovoljeno(uuid, text) from public;
grant execute on function public.clanstvo_dovoljeno(uuid, text) to authenticated;

drop policy if exists "users_can_insert_members" on public.org_members;
drop policy if exists "Users can insert own membership" on public.org_members;
create policy "Users can insert own membership" on public.org_members
  for insert
  with check (user_id = auth.uid() and public.clanstvo_dovoljeno(org_id, role));

-- Povabila: vidijo jih clani organizacije (kot doslej) in povabljenec svoje;
-- ustvarja, spreminja in brise jih samo lastnik/admin. Prej je smel vsak
-- clan (tudi blagajnik) ustvariti povabilo z vlogo 'admin' zase.
create or replace function public.je_lastnik_ali_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from org_members m where m.org_id = p_org_id
                 and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
$$;

revoke all on function public.je_lastnik_ali_admin(uuid) from public;
grant execute on function public.je_lastnik_ali_admin(uuid) to authenticated;

drop policy if exists "org members only" on public.org_invites;
drop policy if exists "org_invites_select" on public.org_invites;
drop policy if exists "org_invites_write_owner_admin" on public.org_invites;
create policy "org_invites_select" on public.org_invites
  for select
  using (
    org_id in (select org_members.org_id from org_members where org_members.user_id = auth.uid())
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
create policy "org_invites_write_owner_admin" on public.org_invites
  for all
  using (public.je_lastnik_ali_admin(org_id))
  with check (public.je_lastnik_ali_admin(org_id));

-- Ob vstopu se povabilo porabi (povabljenec ga po novi politiki ne more vec
-- oznaciti sam; /invite/[id] to poskusi, a tiho brez ucinka - zato sprozilec).
create or replace function public.porabi_povabilo_ob_vstopu()
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

drop trigger if exists trg_porabi_povabilo_ob_vstopu on public.org_members;
create trigger trg_porabi_povabilo_ob_vstopu
  after insert on public.org_members
  for each row execute function public.porabi_povabilo_ob_vstopu();
