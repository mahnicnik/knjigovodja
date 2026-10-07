-- 184: PRETVORBA PAKIRANJA PRI UVOZU DOBAVNICE (7.10.2026)
--
-- Dobavnica pove stevilo PAKIRANJ (1 sod, 1 paket), zaloga pa se vodi v
-- enotah porabe (L, vrecke). Ob potrditvi uvoza uporabnik doloci vsebino
-- pakiranja; ta migracija:
--   1. doda delivery_lines.pack_size - brisanje dobavnice mora zalogo
--      zmanjsati za kolicino x vsebino, ne le za kolicino
--   2. doda tabelo pretvorbe_pakiranja - potrjena vsebina se zapomni za
--      artikel dobavitelja (po EAN/sifri ali nazivu) in se naslednjic
--      predlaga sama. Blagajna jo veze na business_id, portal na org_id.
--
-- Samo DODAJA. Obstojeci zapisi se ne spreminjajo (pack_size null = 1).

alter table public.delivery_lines add column if not exists pack_size numeric;

create table if not exists public.pretvorbe_pakiranja (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  kljuc text not null,
  vsebina numeric not null check (vsebina > 0),
  enota text,
  updated_at timestamptz not null default now(),
  check (business_id is not null or org_id is not null),
  constraint pretvorbe_pakiranja_kljuc unique nulls not distinct (business_id, org_id, kljuc)
);

alter table public.pretvorbe_pakiranja enable row level security;

drop policy if exists "Blagajna" on public.pretvorbe_pakiranja;
create policy "Blagajna" on public.pretvorbe_pakiranja for all
  using (business_id in (select current_user_business_ids()))
  with check (business_id in (select current_user_business_ids()));

drop policy if exists "Portal" on public.pretvorbe_pakiranja;
create policy "Portal" on public.pretvorbe_pakiranja for all
  using (org_id in (select org_id from public.org_members where user_id = auth.uid()))
  with check (org_id in (select org_id from public.org_members where user_id = auth.uid()));
