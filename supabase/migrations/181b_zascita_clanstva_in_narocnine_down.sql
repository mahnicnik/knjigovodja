-- 181b DOWN – vrne politike in sprozilce v stanje produkcije 6.10.2026.
-- Politike so prepisane natanko iz pg_policies (roles public, brez with_check
-- pri "org members only").

drop trigger if exists trg_zasciti_stolpce_narocnine on public.organizations;
drop trigger if exists trg_porabi_povabilo_ob_vstopu on public.org_members;

drop policy if exists "Users can insert own membership" on public.org_members;
create policy "Users can insert own membership" on public.org_members
  for insert with check (user_id = auth.uid());
drop policy if exists "users_can_insert_members" on public.org_members;
create policy "users_can_insert_members" on public.org_members
  for insert with check (true);

drop policy if exists "org_invites_select" on public.org_invites;
drop policy if exists "org_invites_write_owner_admin" on public.org_invites;
drop policy if exists "org members only" on public.org_invites;
create policy "org members only" on public.org_invites
  for all using (org_id in (select org_members.org_id from org_members where org_members.user_id = auth.uid()));

drop function if exists public.zasciti_stolpce_narocnine();
drop function if exists public.porabi_povabilo_ob_vstopu();
drop function if exists public.clanstvo_dovoljeno(uuid, text);
drop function if exists public.je_lastnik_ali_admin(uuid);
