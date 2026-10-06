-- Najmanjsi posnetek produkcijske sheme za tests/paketi-baza.spec.ts.
-- Politike in stolpci so prepisani iz produkcije (6.10.2026) v stanju PRED
-- migracijo 182 - test zato preveri tudi, da migracija zapre stare luknje.

create schema if not exists auth;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;
do $$ begin
  create role supabase_admin nologin;
exception when duplicate_object then null; end $$;

create or replace function auth.jwt() returns jsonb language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create or replace function auth.role() returns text language sql stable as
$$ select auth.jwt() ->> 'role' $$;

create table auth.users (id uuid primary key, email text);
grant usage on schema auth to authenticated, service_role;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text,
  plan text default 'solo',
  subscription_status text default 'free'
    check (subscription_status in ('free','pro','pro_pos','cancelled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  trial_ends_at timestamptz,
  plan_expires_at timestamptz,
  created_at timestamptz default now()
);
create table public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  user_id uuid,
  role text,
  invited_by uuid,
  created_at timestamptz default now(),
  unique (org_id, user_id)
);
create table public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  email text, role text, invited_by uuid,
  accepted_at timestamptz, expires_at timestamptz,
  created_at timestamptz default now()
);
create table public.issued_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id),
  invoice_number text,
  invoice_type text default 'invoice',
  status text default 'draft'
);

create or replace function public.get_user_org_ids() returns setof uuid
language sql stable security definer as
$$ select org_id from org_members where user_id = auth.uid() $$;

alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.org_invites enable row level security;
alter table public.issued_invoices enable row level security;

create policy "Users can insert org" on public.organizations for insert with check (true);
create policy "Users can select own org" on public.organizations for select
  using (id in (select org_members.org_id from org_members where org_members.user_id = auth.uid()));
create policy "organizations_update_owner_admin" on public.organizations for update
  using (id in (select org_members.org_id from org_members
                where org_members.user_id = auth.uid() and org_members.role in ('owner','admin')));

create policy "Users can insert own membership" on public.org_members for insert with check (user_id = auth.uid());
create policy "Users can select own membership" on public.org_members for select using (user_id = auth.uid());
create policy "members_select" on public.org_members for select using (org_id in (select get_user_org_ids()));
create policy "users_can_insert_members" on public.org_members for insert with check (true);

create policy "org members only" on public.org_invites for all
  using (org_id in (select org_members.org_id from org_members where org_members.user_id = auth.uid()));

create policy "invoices_access" on public.issued_invoices for all
  using (org_id in (select get_user_org_ids()));

grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
