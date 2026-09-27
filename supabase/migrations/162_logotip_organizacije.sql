-- ═══════════════════════════════════════════════════════════════════
-- PRELET 330: logotip organizacije na racunih
-- ═══════════════════════════════════════════════════════════════════
-- logo_url: javni URL slike (PDF racun ga prebere na strezniku)
-- logo_pot: pot v shrambi (za zamenjavo/odstranitev stare datoteke)
-- Nalaganje gre SAMO prek streznika (api/nastavitve/logotip, service role),
-- ki preveri vlogo (lastnik/skrbnik), vrsto (PNG/JPEG) in velikost (2 MB).
-- PDF uporabi le URL iz tega vedra - vrednost, vpisana mimo streznika, se
-- ne prenese.
alter table organizations add column if not exists logo_url text;
alter table organizations add column if not exists logo_pot text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logotipi', 'logotipi', true, 2097152, array['image/png','image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/png','image/jpeg'];
