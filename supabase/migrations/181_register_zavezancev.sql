-- REGISTER DAVČNIH ZAVEZANCEV (FURS odprti podatki) – oktober 2026
-- ═══════════════════════════════════════════════════════════════
--
-- Iskanje podjetja po davcni stevilki (/api/company-lookup) je klicalo zunanji
-- slo-podjetja-api.eu, ki ne odgovarja vec. Vir je zdaj FURS »Seznam davcnih
-- zavezancev« (DURS_zavezanci_PO.zip – pravne osebe, DURS_zavezanci_DEJ.zip –
-- fizicne osebe z dejavnostjo, s.p.). Uvoz: /api/cron/register-zavezancev
-- (vsak dan po nocni osvezitvi FURS ob ~23:00).
--
-- Podatki so javni, a tabelo bere samo streznik (service role) – RLS je
-- vklopljen in brez politik, zato je anon/authenticated ne vidita. Uporabniki
-- dobijo podatke le prek /api/company-lookup (zahteva prijavo).
--
-- UVAJANJE: migracijo zazeni PRED objavo kode.

create table if not exists public.register_zavezancev (
  davcna    text primary key check (davcna ~ '^[0-9]{8}$'),
  maticna   text,
  ime       text not null,
  naslov    text,
  posta     text,
  kraj      text,
  skd       text,
  vrsta     text not null check (vrsta in ('PO', 'DEJ')),
  ddv       boolean,          -- PO: oznaka '*' (identificiran za DDV); DEJ: null (datoteka DDV ne navaja)
  fu        text,
  osvezeno  timestamptz not null default now()
);

comment on table public.register_zavezancev is
  'FURS seznam davcnih zavezancev (PO + DEJ). Polni /api/cron/register-zavezancev. Samo service role.';

-- Brisanje vrstic, ki jih v novih datotekah ni vec: uvoz izbrise vse z
-- osvezeno < zacetek uvoza (sele ko sta oba uvoza uspela).
create index if not exists register_zavezancev_osvezeno_idx on public.register_zavezancev (osvezeno);

alter table public.register_zavezancev enable row level security;
revoke all on public.register_zavezancev from anon, authenticated;
