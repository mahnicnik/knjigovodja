-- PRELET 331: polozaj (levo/sredina/desno), velikost (majhen/srednji/velik)
-- in prikaz logotipa v e-posti. Pise ga le /api/nastavitve/logotip (PATCH),
-- ki sprejme samo znane vrednosti; bralci uporabijo lib/logotip.logoNastavitve.
alter table organizations add column if not exists logo_nastavitve jsonb not null default '{}'::jsonb;
