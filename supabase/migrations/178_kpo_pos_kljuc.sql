-- REVIZIJA K5/V4/V5 (oktober 2026): EN DNEVNI KPO VNOS NA DAN, VRSTO IN STOPNJO
-- ═════════════════════════════════════════════════════════════════════════════
--
-- POS promet se v KPO knjizi po DNEVIH prodaje (lib/pos-kpo.ts), ne vec z
-- datumom zakljucka izmene. Vsak dnevni vnos ima kljuc
--   pos:<business_id>:<YYYY-MM-DD>:<izdelek|storitev>:<stopnja>
-- ki je unikaten znotraj organizacije. Knjizenje (zakljucek izmene,
-- Z-porocilo, storno, vracilo) vnos PREPISE z novim izracunom
-- (upsert on conflict org_id, pos_kljuc) - isti promet se ne more knjiziti
-- dvakrat, ne glede na to, koliko poti ga sprozi.
--
-- Stari vnosi (pos_kljuc is null) ostanejo nespremenjeni. NULL vrednosti se v
-- unikatni omejitvi ne primerjajo med seboj, zato jih omejitev ne zadeva.
--
-- UVAJANJE: to migracijo zazeni PRED objavo kode iz te veje (koda zapisuje
-- stolpec pos_kljuc). Migracija je le dodajanje - stara koda deluje naprej.

alter table public.kpo_entries add column if not exists pos_kljuc text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'kpo_entries_org_pos_kljuc_key') then
    alter table public.kpo_entries add constraint kpo_entries_org_pos_kljuc_key unique (org_id, pos_kljuc);
  end if;
end $$;

comment on column public.kpo_entries.pos_kljuc is
  'Kljuc dnevnega POS vnosa (pos:<business>:<dan>:<vrsta>:<stopnja>). Vnos se ob vsakem knjizenju preracuna in prepise - glej apps/web/lib/pos-kpo.ts.';
