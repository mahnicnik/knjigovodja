-- PRELET 335: placilna lista <-> vnos v KPO (en vnos na placilno listo;
-- izbris placilne liste izbrise tudi strosek) + polja s placilne liste.
alter table kpo_entries add column if not exists payslip_id uuid references payslips(id) on delete cascade;
create index if not exists kpo_entries_payslip_idx on kpo_entries(payslip_id);
alter table payslips add column if not exists ee_long_term_care numeric default 0;
alter table payslips add column if not exists er_long_term_care numeric default 0;
alter table payslips add column if not exists ee_ozp numeric default 0;
alter table payslips add column if not exists er_min_base_diff numeric default 0;
