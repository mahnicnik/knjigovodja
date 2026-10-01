-- Test za migracijo 175 (prelet 375). Teče na začasni tabeli - pravih podatkov
-- ne spreminja. Pričakovan izid:
--   livemode: zavrnjeno (Povezavo s Stripe lahko spremeni samo strežnik.); drug stolpec: dovoljeno
-- Izveden 1. 10. 2026 v Supabase (projekt Knjigovodja): izid kot pričakovano.
create temp table tst_zascita (stripe_account_id text, stripe_charges_enabled bool, stripe_payouts_enabled bool, stripe_povezano_ob timestamptz, stripe_account_livemode bool, ime text);
insert into tst_zascita values ('acct_x', true, true, now(), false, 'a');
create trigger tst_trg before update on tst_zascita for each row execute function public.zasciti_stripe_connect_stolpce();
grant all on tst_zascita to authenticated;
do $$
declare izid text := '';
begin
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  execute 'set local role authenticated';
  begin
    update tst_zascita set stripe_account_livemode = true;
    izid := izid || 'livemode: DOVOLJENO; ';
  exception when others then izid := izid || 'livemode: zavrnjeno (' || sqlerrm || '); ';
  end;
  begin
    update tst_zascita set ime = 'b';
    izid := izid || 'drug stolpec: dovoljeno';
  exception when others then izid := izid || 'drug stolpec: ZAVRNJENO ' || sqlerrm;
  end;
  execute 'reset role';
  create temp table if not exists tst_izid(t text);
  insert into tst_izid values (izid);
end $$;
select t from tst_izid;
