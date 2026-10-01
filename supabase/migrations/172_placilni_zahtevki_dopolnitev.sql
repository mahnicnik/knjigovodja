-- PRELET 360: zahtevki za plačilo na portalu (Stripe, DEL B).
--
-- 1. Podatki z obrazca računa, ki jih zahtevek prenese na račun (datum
--    opravljene storitve, besedilo nad tabelo, izbrana stranka iz šifranta).
-- 2. refund_id - vračilo prek Stripe ob stornu računa iz zahtevka.
-- 3. Realtime: zaslon s QR kodo na portalu posluša spremembe stanja (člani
--    organizacije zahtevke berejo prek obstoječega pravila "clani berejo").
-- 4. Hitro iskanje zahtevka po izdanem računu (storno → vračilo).

alter table placilni_zahtevki add column if not exists service_date date;
alter table placilni_zahtevki add column if not exists service_date_to date;
alter table placilni_zahtevki add column if not exists header_text text;
alter table placilni_zahtevki add column if not exists refund_id text;

create index if not exists placilni_zahtevki_invoice_idx on placilni_zahtevki (invoice_id) where invoice_id is not null;
create unique index if not exists placilni_zahtevki_org_stevilka_uniq on placilni_zahtevki (org_id, stevilka) where stevilka is not null;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'placilni_zahtevki'
  ) then
    alter publication supabase_realtime add table placilni_zahtevki;
  end if;
end $$;
