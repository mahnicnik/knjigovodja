-- PRELET 376: racun z davcno rezervacijo (issued_invoices.furs_rezervacija,
-- migracija 174) se ne ureja. Stevilka, ZOI in cas izdaje so dodeljeni in
-- morda ze poslani FURS - sprememba zneska, datuma, postavk ali stevilke bi
-- pomenila racun, ki se ne ujema s prijavljenim. Popravek gre prek storna.
--
-- Odjemalec (brskalnik) ne sme:
--   - spreminjati davcnih polj racuna z rezervacijo,
--   - sam nastaviti, spremeniti ali pobrisati rezervacije, ZOI ali EOR,
--   - izbrisati racuna z rezervacijo.
-- Status (placan, storniran), arhiv, opombe ipd. ostanejo spremenljivi.
-- Strezniske poti (service_role) niso omejene.

create or replace function public.zasciti_davcno_rezervacijo()
returns trigger
language plpgsql
as $function$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.furs_rezervacija is not null then
      raise exception 'Račun ima dodeljeno davčno številko in ga ni mogoče izbrisati (zakonska hramba).';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.furs_rezervacija is not null then
      raise exception 'Davčno rezervacijo lahko dodeli samo strežnik.';
    end if;
    return new;
  end if;
  if new.furs_rezervacija is distinct from old.furs_rezervacija
     or new.zoi is distinct from old.zoi
     or new.eor is distinct from old.eor then
    raise exception 'Davčne podatke računa lahko spremeni samo strežnik.';
  end if;
  if old.furs_rezervacija is not null and (
       new.invoice_number is distinct from old.invoice_number
    or new.invoice_type is distinct from old.invoice_type
    or new.issue_date is distinct from old.issue_date
    or new.amount_total is distinct from old.amount_total
    or new.amount_net is distinct from old.amount_net
    or new.vat_amount is distinct from old.vat_amount
    or new.line_items is distinct from old.line_items
    or new.client_tax_number is distinct from old.client_tax_number
    or new.org_id is distinct from old.org_id
  ) then
    raise exception 'Račun ima dodeljeno davčno številko in ga ni mogoče urejati. Za popravek ga stornirajte in izdajte novega.';
  end if;
  return new;
end $function$;

drop trigger if exists zasciti_davcno_rezervacijo on public.issued_invoices;
create trigger zasciti_davcno_rezervacijo
  before insert or update or delete on public.issued_invoices
  for each row execute function public.zasciti_davcno_rezervacijo();
