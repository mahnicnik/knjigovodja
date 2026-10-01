-- PRELET 375: stripe_account_livemode (prelet 363) je del povezave s Stripe -
-- odjemalec (brskalnik z uporabniskim zetonom) ga ne sme spreminjati, sicer
-- bi testni racun lahko "prestavil" v zivi nacin. Spreminja ga samo streznik.

create or replace function public.zasciti_stripe_connect_stolpce()
returns trigger
language plpgsql
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') and (
       new.stripe_account_id is distinct from old.stripe_account_id
    or new.stripe_charges_enabled is distinct from old.stripe_charges_enabled
    or new.stripe_payouts_enabled is distinct from old.stripe_payouts_enabled
    or new.stripe_povezano_ob is distinct from old.stripe_povezano_ob
    or new.stripe_account_livemode is distinct from old.stripe_account_livemode
  ) then
    raise exception 'Povezavo s Stripe lahko spremeni samo strežnik.';
  end if;
  return new;
end $function$;
