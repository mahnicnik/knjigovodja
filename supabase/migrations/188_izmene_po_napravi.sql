-- 188: LOCENE IZMENE PO NAPRAVI (trznice, 17.10.2026)
--
-- Na trznici prodaja vec naprav hkrati, vsaka s SVOJIM predalom. Vsaka naprava
-- odpre, pregleda (vmesno stanje) in zakljuci svojo izmeno in dobi svoje
-- Z-porocilo. Privzeto (false) ostane SKUPNA izmena za celo podjetje, kot
-- doslej (lokal z enim predalom, prelet 196) - obstojeca podjetja se ne
-- spremenijo.
--
-- device_id na narocilu/vracilu pove, v predal katere naprave sodi promet;
-- na izmeni in Z-porocilu, katere naprave je. Vse je null za obstojece
-- zapise, zato se zgodovinski zakljucki ne spremenijo.

alter table public.organizations
  add column if not exists izmene_po_napravi boolean not null default false;

alter table public.cash_sessions
  add column if not exists device_id uuid references public.electronic_devices(id) on delete set null;
alter table public.orders
  add column if not exists device_id uuid references public.electronic_devices(id) on delete set null;
alter table public.refunds
  add column if not exists device_id uuid references public.electronic_devices(id) on delete set null;
alter table public.z_reports
  add column if not exists device_id uuid references public.electronic_devices(id) on delete set null;

create index if not exists cash_sessions_odprte_naprava on public.cash_sessions (business_id, device_id) where status = 'open';
create index if not exists orders_naprava_zaprto on public.orders (business_id, device_id, closed_at) where device_id is not null;

-- Z-stevilke so zaporedne PO PODJETJU. Ko zakljucujejo stiri naprave hkrati,
-- bi "zadnja + 1" dvema dala isto stevilko - unikatnost to prepreci, aplikacija
-- ob trku poskusi znova (lib/cash-session.ts).
create unique index if not exists z_reports_business_stevilka on public.z_reports (business_id, report_number);
