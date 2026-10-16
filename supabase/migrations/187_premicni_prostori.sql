-- 187: PREMICNI POSLOVNI PROSTORI (16.10.2026)
--
-- Stojnice na trznicah se pri FURS prijavijo kot premicni prostor (namesto
-- nepremicnine s katastrskimi podatki):
--   A – premicni objekt (npr. premicna stojnica, prevozno sredstvo)
--   B – objekt na stalni lokaciji (npr. stojnica na trznici, kiosk)
--   C – posamezna elektronska naprava (ko zavezanec nima drugega prostora)
-- premise_type ze dovoljuje 'movable'; tu dodamo, KATERI tip.
-- Obstojecih prostorov ne spreminja (vsi so 'static', movable_type null).
alter table public.business_premises add column if not exists movable_type text;

alter table public.business_premises drop constraint if exists business_premises_movable_type_check;
alter table public.business_premises add constraint business_premises_movable_type_check check (
  (premise_type = 'static' and movable_type is null)
  or (premise_type = 'movable' and movable_type in ('A', 'B', 'C'))
);
