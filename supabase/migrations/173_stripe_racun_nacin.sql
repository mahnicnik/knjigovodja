-- PRELET 363: Stripe Connect v PRODUKCIJSKEM (živem) načinu.
--
-- Povezan Stripe račun pripada enemu načinu: račun, ustvarjen s testnim
-- ključem, v živem načinu ne obstaja (in obratno). Ob prehodu na živi ključ
-- mora podjetje Stripe povezati znova. stripe_account_livemode pove, v katerem
-- načinu je bil račun ustvarjen; ob neujemanju s ključem na strežniku velja,
-- da Stripe ni povezan (lib/stripe-connect.ts, preveriPogoje).
--
-- Vsi doslej povezani računi so bili ustvarjeni s testnim ključem.

alter table organizations add column if not exists stripe_account_livemode boolean;
update organizations set stripe_account_livemode = false
  where stripe_account_id is not null and stripe_account_livemode is null;
