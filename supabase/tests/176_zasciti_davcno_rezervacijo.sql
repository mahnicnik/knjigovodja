-- Test za migracijo 176 (prelet 376). Teče na začasni tabeli (CTAS iz
-- issued_invoices) - pravih podatkov ne spreminja. Izveden 1. 10. 2026:
--   1 znesek z rezervacijo      zavrnjeno
--   2 status z rezervacijo      dovoljeno
--   3 brisanje rezervacije      zavrnjeno
--   4 izbris z rezervacijo      zavrnjeno
--   5 znesek brez rezervacije   dovoljeno
--   6 EOR iz brskalnika         zavrnjeno
--   7 vstavi z rezervacijo      zavrnjeno
--   8 izbris brez rezervacije   dovoljeno
--   9 streznik (service_role)   dovoljeno
create temp table tst_rac as select * from public.issued_invoices where false;
create trigger tst_trg before insert or update or delete on tst_rac for each row execute function public.zasciti_davcno_rezervacijo();
insert into tst_rac (id, org_id, invoice_number, amount_total, status, furs_rezervacija) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000aa', 'PP1-NAP1-41', 400, 'paid', '{"sequence":41}'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000aa', '2026-005', 100, 'sent', null);
grant all on tst_rac to authenticated;
create temp table tst_izid(korak text, izid text);
grant all on tst_izid to authenticated;
do $$
begin
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  execute 'set local role authenticated';
  begin update tst_rac set amount_total = 1 where invoice_number = 'PP1-NAP1-41'; insert into tst_izid values ('1 znesek z rezervacijo', 'DOVOLJENO');
  exception when others then insert into tst_izid values ('1 znesek z rezervacijo', 'zavrnjeno'); end;
  begin update tst_rac set status = 'cancelled' where invoice_number = 'PP1-NAP1-41'; insert into tst_izid values ('2 status z rezervacijo', 'dovoljeno');
  exception when others then insert into tst_izid values ('2 status z rezervacijo', 'ZAVRNJENO ' || sqlerrm); end;
  begin update tst_rac set furs_rezervacija = null where invoice_number = 'PP1-NAP1-41'; insert into tst_izid values ('3 brisanje rezervacije', 'DOVOLJENO');
  exception when others then insert into tst_izid values ('3 brisanje rezervacije', 'zavrnjeno'); end;
  begin delete from tst_rac where invoice_number = 'PP1-NAP1-41'; insert into tst_izid values ('4 izbris z rezervacijo', 'DOVOLJENO');
  exception when others then insert into tst_izid values ('4 izbris z rezervacijo', 'zavrnjeno'); end;
  begin update tst_rac set amount_total = 120 where invoice_number = '2026-005'; insert into tst_izid values ('5 znesek brez rezervacije', 'dovoljeno');
  exception when others then insert into tst_izid values ('5 znesek brez rezervacije', 'ZAVRNJENO ' || sqlerrm); end;
  begin update tst_rac set eor = 'X' where invoice_number = '2026-005'; insert into tst_izid values ('6 EOR iz brskalnika', 'DOVOLJENO');
  exception when others then insert into tst_izid values ('6 EOR iz brskalnika', 'zavrnjeno'); end;
  begin insert into tst_rac (id, org_id, invoice_number, amount_total, status, furs_rezervacija) values ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000aa', 'x', 1, 'draft', '{"sequence":1}'); insert into tst_izid values ('7 vstavi z rezervacijo', 'DOVOLJENO');
  exception when others then insert into tst_izid values ('7 vstavi z rezervacijo', 'zavrnjeno'); end;
  begin delete from tst_rac where invoice_number = '2026-005'; insert into tst_izid values ('8 izbris brez rezervacije', 'dovoljeno');
  exception when others then insert into tst_izid values ('8 izbris brez rezervacije', 'ZAVRNJENO ' || sqlerrm); end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  begin update tst_rac set furs_rezervacija = '{"sequence":42}', amount_total = 401 where invoice_number = 'PP1-NAP1-41'; insert into tst_izid values ('9 streznik', 'dovoljeno');
  exception when others then insert into tst_izid values ('9 streznik', 'ZAVRNJENO ' || sqlerrm); end;
end $$;
select * from tst_izid order by korak;
