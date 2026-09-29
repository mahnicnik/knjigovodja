-- Prelet 341: napoved pretoka denarja potrebuje izhodiscno stanje na TRR
-- in davcno obdobje za DDV (mesecno/cetrtletno) za pravilen rok placila.
alter table organizations
  add column if not exists cash_balance numeric(12,2),
  add column if not exists cash_balance_date date,
  add column if not exists vat_period text check (vat_period in ('monthly','quarterly'));
comment on column organizations.cash_balance is 'Rocno vneseno stanje na TRR - izhodisce za napoved pretoka denarja';
comment on column organizations.vat_period is 'Davcno obdobje za DDV; NULL = cetrtletno (privzeto za male zavezance)';
