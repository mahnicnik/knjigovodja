drop index if exists public.z_reports_business_stevilka;
drop index if exists public.orders_naprava_zaprto;
drop index if exists public.cash_sessions_odprte_naprava;
alter table public.z_reports drop column if exists device_id;
alter table public.refunds drop column if exists device_id;
alter table public.orders drop column if exists device_id;
alter table public.cash_sessions drop column if exists device_id;
alter table public.organizations drop column if exists izmene_po_napravi;
