-- PRELET 335: izbris stroska VEDNO izbrise tudi njegov vnos v KPO - ne glede
-- na to, s katere strani je strosek izbrisan.
alter table kpo_entries drop constraint if exists kpo_entries_receipt_id_fkey;
alter table kpo_entries add constraint kpo_entries_receipt_id_fkey foreign key (receipt_id) references receipts(id) on delete cascade;
