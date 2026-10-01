-- Prelet 357: plačila s kartico prek Stripe Connect (Express).
--
-- POVEZAVA JE NA ORGANIZACIJI (ne na poslovalnici): portal dela z
-- organizacijo, blagajna s poslovalnico (organizations.pos_business_id), a
-- denar prejme ISTO podjetje. Ena povezava velja za oba kanala.
--
-- Ti stolpci se NE smejo spreminjati iz brskalnika (tudi lastnik bi sicer
-- lahko vpisal tuj Stripe račun). Branje ostane po obstoječih pravilih
-- tabele organizations (člani berejo svojo organizacijo), zapis dovoli
-- sprožilec samo strežniku (service_role).

alter table organizations
  add column if not exists stripe_account_id text,
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_payouts_enabled boolean not null default false,
  add column if not exists stripe_povezano_ob timestamptz;

create unique index if not exists organizations_stripe_account_id_uq
  on organizations (stripe_account_id) where stripe_account_id is not null;

comment on column organizations.stripe_account_id is 'Stripe Connect (Express) povezan račun za plačila strank - NE naročnina Računka (to je stripe_customer_id)';

create or replace function zasciti_stripe_connect_stolpce()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') and (
       new.stripe_account_id is distinct from old.stripe_account_id
    or new.stripe_charges_enabled is distinct from old.stripe_charges_enabled
    or new.stripe_payouts_enabled is distinct from old.stripe_payouts_enabled
    or new.stripe_povezano_ob is distinct from old.stripe_povezano_ob
  ) then
    raise exception 'Povezavo s Stripe lahko spremeni samo strežnik.';
  end if;
  return new;
end $$;

drop trigger if exists trg_zasciti_stripe_connect on organizations;
create trigger trg_zasciti_stripe_connect
  before update on organizations
  for each row execute function zasciti_stripe_connect_stolpce();

-- ── Plačila v blagajni prek QR kode ────────────────────────────────────
create table if not exists pos_placila_stripe (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  org_id uuid not null references organizations(id) on delete cascade,
  staff_id uuid,
  -- Blagajna odprt račun identificira z vrstico v `orders` (status 'open').
  order_id uuid not null references orders(id) on delete cascade,
  premise_id uuid,
  znesek_centi integer not null check (znesek_centi > 0),
  valuta text not null default 'eur',
  checkout_session_id text unique,
  checkout_url text,
  payment_intent_id text,
  status text not null default 'cakanje'
    check (status in ('cakanje', 'placano', 'poteklo', 'preklicano', 'vrnjeno')),
  -- Stanje zaključka po plačilu (izvaja strežnik, idempotentno).
  zakljuceno_ob timestamptz,
  napaka text,
  vrnjeno_ob timestamptz,
  refund_id text,
  ustvarjeno timestamptz not null default now(),
  placano_ob timestamptz,
  velja_do timestamptz
);

-- Največ EN aktiven (čakajoč) session na odprt račun - varuje baza.
create unique index if not exists pos_placila_stripe_en_aktiven
  on pos_placila_stripe (order_id) where status = 'cakanje';
create index if not exists pos_placila_stripe_business_idx
  on pos_placila_stripe (business_id, ustvarjeno desc);

alter table pos_placila_stripe enable row level security;

drop policy if exists "Business scope" on pos_placila_stripe;
create policy "Business scope" on pos_placila_stripe
  for select using (business_id in (select current_user_business_ids()));
-- Pisanje samo prek strežnika (service_role obide RLS).

alter table pos_placila_stripe replica identity full;
do $$ begin
  alter publication supabase_realtime add table pos_placila_stripe;
exception when duplicate_object then null; end $$;

-- ── Kratka povezava za NFC nalepko: /p/[koda] ──────────────────────────
create table if not exists pos_kratke_povezave (
  koda text primary key check (koda ~ '^[a-z0-9]{6,16}$'),
  business_id uuid not null unique,
  org_id uuid not null references organizations(id) on delete cascade,
  ustvarjeno timestamptz not null default now()
);
alter table pos_kratke_povezave enable row level security;
drop policy if exists "Business scope" on pos_kratke_povezave;
create policy "Business scope" on pos_kratke_povezave
  for select using (business_id in (select current_user_business_ids()));

-- ── Idempotenca Connect webhooka ───────────────────────────────────────
create table if not exists stripe_connect_dogodki (
  event_id text primary key,
  tip text not null,
  account_id text,
  obdelano_ob timestamptz not null default now()
);
alter table stripe_connect_dogodki enable row level security;

-- Zaključek po plačilu: zaklep (vzporedna webhooka), povezava na zapis
-- plačila in rezultat davčne potrditve za prikaz v blagajni.
alter table pos_placila_stripe
  add column if not exists zakljucevanje_od timestamptz,
  add column if not exists payment_id uuid,
  add column if not exists rezultat jsonb;
