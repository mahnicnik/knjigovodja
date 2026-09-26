-- ═══════════════════════════════════════════════════════════════════
-- PRELET 326: knjiga Stripe placil (ledger) + vracila
-- ═══════════════════════════════════════════════════════════════════
--
-- Doslej je bil racun vezan na DOGODEK, ki ga je Stripe poslal (in samo
-- na tiste tipe, ki jih je uporabnik izbral pri webhooku). Placilo, za
-- katero dogodek ni prisel ali je bil tipa, ki ga nismo poslusali, je
-- izginilo brez sledi (Domen Kocjan, masterclass 289 EUR, 18.9.2026).
--
-- Zdaj je osnova PREMIK DENARJA: ena vrstica na placilo (kljuc = ID
-- placila pi_..., sicer ID racuna in_... ali bremenitve ch_...). Vsi
-- dogodki istega placila (checkout, racun, placilo, vracilo) dopolnjujejo
-- ISTO vrstico - racun se iz nje izda natanko enkrat. Nocna uskladitev
-- prek Stripe API polni isto tabelo, zato manjkajoci dogodek ne pomeni vec
-- manjkajocega racuna.

-- 1) Kljuc za branje uporabnikovega Stripa (restricted key), SIFRIRAN
--    (lib/token-crypto, AES-256-GCM). V brskalnik gre le zadnje 4 znake.
alter table integrations add column if not exists api_key_enc text;
alter table integrations add column if not exists api_key_zadnji4 text;
alter table integrations add column if not exists zadnja_uskladitev timestamptz;

-- 2) Knjiga placil
create table if not exists stripe_placila (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kljuc text not null,
  payment_intent_id text,
  charge_id text,
  stripe_invoice_id text,
  checkout_session_id text,
  znesek_centi bigint not null,
  valuta text not null,
  vrnjeno_centi bigint not null default 0,
  placano boolean not null default false,
  placano_ob timestamptz,
  kupec_ime text,
  kupec_email text,
  opis text,
  vir text,
  spor boolean not null default false,
  -- caka | izdan | preskoceno | pregled | napaka
  stanje text not null default 'caka'
    check (stanje in ('caka', 'izdan', 'preskoceno', 'pregled', 'napaka')),
  razlog text,
  racun_id uuid references issued_invoices(id),
  zadnji_dogodek text,
  ustvarjeno timestamptz not null default now(),
  posodobljeno timestamptz not null default now(),
  unique (org_id, kljuc)
);
create index if not exists stripe_placila_org_stanje_idx on stripe_placila (org_id, stanje);
create index if not exists stripe_placila_org_placano_idx on stripe_placila (org_id, placano_ob desc);

-- 3) Vracila -> dobropisi
create table if not exists stripe_vracila (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  refund_id text not null,
  kljuc_placila text not null,
  znesek_centi bigint not null,
  valuta text not null,
  vrnjeno_ob timestamptz,
  -- caka | izdan | pregled | napaka
  stanje text not null default 'caka'
    check (stanje in ('caka', 'izdan', 'pregled', 'napaka')),
  razlog text,
  dobropis_id uuid references issued_invoices(id),
  ustvarjeno timestamptz not null default now(),
  posodobljeno timestamptz not null default now(),
  unique (org_id, refund_id)
);
create index if not exists stripe_vracila_org_stanje_idx on stripe_vracila (org_id, stanje);

-- 4) RLS: clani organizacije berejo; pise samo streznik (service role).
alter table stripe_placila enable row level security;
alter table stripe_vracila enable row level security;
drop policy if exists "clani berejo" on stripe_placila;
create policy "clani berejo" on stripe_placila for select
  using (org_id in (select org_members.org_id from org_members where org_members.user_id = auth.uid()));
drop policy if exists "clani berejo" on stripe_vracila;
create policy "clani berejo" on stripe_vracila for select
  using (org_id in (select org_members.org_id from org_members where org_members.user_id = auth.uid()));
