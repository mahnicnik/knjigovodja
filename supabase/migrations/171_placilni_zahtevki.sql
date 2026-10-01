-- PRELET 358 (priprava): zahtevki za plačilo na portalu (Stripe, DEL B).
-- Stranka dobi e-pošto s povezavo /placaj/[zeton]; račun se izda šele po
-- plačilu (invoice_id). Pisanje opravlja samo strežnik (service role),
-- člani organizacije lahko zahtevke samo berejo.
-- Že izvedeno v Supabase 30. 9. 2026 (verzija 20260930161417); datoteka je
-- prenesena iz supabase_migrations.schema_migrations.

create table if not exists placilni_zahtevki (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  stevilka text,
  partner_id uuid,
  stranka_ime text not null,
  stranka_email text not null,
  stranka_naslov text,
  stranka_davcna text,
  postavke jsonb not null,
  znesek_neto numeric(12,2) not null,
  ddv numeric(12,2) not null,
  znesek numeric(12,2) not null check (znesek > 0),
  valuta text not null default 'eur',
  opomba text,
  vat_exemption_code text,
  vat_exemption_text text,
  zeton text not null unique,
  checkout_session_id text,
  payment_intent_id text,
  status text not null default 'poslan'
    check (status in ('poslan', 'placan', 'potekel', 'preklican')),
  velja_do timestamptz not null,
  invoice_id uuid references issued_invoices(id) on delete set null,
  ustvaril uuid,
  ustvarjeno timestamptz not null default now(),
  poslano_ob timestamptz,
  opomnik_ob timestamptz,
  placano_ob timestamptz,
  vrnjeno_ob timestamptz,
  izdajanje_od timestamptz,
  racun_poslan_ob timestamptz,
  napaka text
);
create index if not exists placilni_zahtevki_org_idx on placilni_zahtevki (org_id, ustvarjeno desc);
create index if not exists placilni_zahtevki_pi_idx on placilni_zahtevki (payment_intent_id);
alter table placilni_zahtevki enable row level security;
drop policy if exists "clani berejo" on placilni_zahtevki;
create policy "clani berejo" on placilni_zahtevki
  for select using (org_id in (select org_id from org_members where user_id = auth.uid()));
