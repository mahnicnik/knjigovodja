-- REVIZIJA V3 (oktober 2026): 5 % STOPNJA NA Z-POROCILU
-- ═════════════════════════════════════════════════════
--
-- Z-porocilo je DDV po 5 % stopnji (knjige, casopisi) izracunalo, shranilo pa
-- ga ni nikamor: osnova je pristala v total_vat_base_other, DDV pa se je
-- izgubil. Koda iz te veje zapisuje locena stolpca.
--
-- UVAJANJE: migracijo zazeni PRED objavo kode (koda zapisuje nova stolpca).
-- Le dodajanje stolpcev - stara koda deluje naprej. Obstojeca porocila
-- ostanejo nespremenjena (privzeto 0).

alter table public.z_reports add column if not exists total_vat_5 numeric default 0;
alter table public.z_reports add column if not exists total_vat_base_5 numeric default 0;
