-- ═══════════════════════════════════════════════════════════════════
-- PRELET 326 (pregled): od kdaj se Stripe racuni izdajajo samodejno +
-- zascita polj, ki jih sme nastaviti samo streznik.
-- ═══════════════════════════════════════════════════════════════════
--
-- samodejno_od: trenutek PRVE povezave kljuca za branje. Placila pred tem
-- uskladitev NE zaracuna samodejno (lahko so ze rocno zaracunana), ampak jih
-- postavi v 'pregled' z gumbom "Izdaj racun" - brez dvojnikov.
alter table integrations add column if not exists samodejno_od timestamptz;

-- Clani organizacije lahko integrations urejajo neposredno iz brskalnika
-- (webhook secret, vklop/izklop). Kljuc, zacetek samodejne izdaje in cas
-- uskladitve pa sme spreminjati SAMO streznik (service_role) - sicer bi
-- lahko kdo premaknil samodejno_od v preteklost in sprozil racune za stara
-- placila ali podtaknil drug kljuc.
create or replace function integrations_zascita_streznisko()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.api_key_enc := null;
    new.api_key_zadnji4 := null;
    new.samodejno_od := null;
    new.zadnja_uskladitev := null;
  else
    new.api_key_enc := old.api_key_enc;
    new.api_key_zadnji4 := old.api_key_zadnji4;
    new.samodejno_od := old.samodejno_od;
    new.zadnja_uskladitev := old.zadnja_uskladitev;
  end if;
  return new;
end $$;

drop trigger if exists integrations_zascita_streznisko on integrations;
create trigger integrations_zascita_streznisko
  before insert or update on integrations
  for each row execute function integrations_zascita_streznisko();
