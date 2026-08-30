-- ═══════════════════════════════════════════════════════════════════
-- PRELET 158: delovanje blagajne brez povezave + popravki številčenja
-- ═══════════════════════════════════════════════════════════════════

-- 1) UNIQUE (business_id, sequence_number) drži samo v CENTRALNEM načinu
--    številčenja. V načinih "premise"/"device" (prelet 157) se zaporedne
--    številke ponavljajo — vsak prostor oziroma naprava šteje svoje — zato
--    bi ta omejitev ob PRVEM računu po preklopu načina zavrnila vpis
--    dokazne vrstice v pos_invoice_numbers in s tem celotno prodajo.
--    Sledljivost ohranita navadna indeksa; enoličnost številke kot celote
--    zagotavlja tridelna oblika (PE-naprava-zaporedna).
alter table pos_invoice_numbers
  drop constraint if exists pos_invoice_numbers_business_id_sequence_number_key;
create index if not exists pos_invoice_numbers_biz_seq_idx
  on pos_invoice_numbers (business_id, sequence_number);
create index if not exists pos_invoice_numbers_biz_full_idx
  on pos_invoice_numbers (business_id, invoice_number);

-- 2) Račun, izdan BREZ POVEZAVE, dobi številko iz lokalnega števca naprave
--    (način "device"). Ob sinhronizaciji je treba centralni (scoped) števec
--    dvigniti VSAJ na porabljeno številko — sicer bi naslednja spletna
--    prodaja isto številko podelila še enkrat. GREATEST poskrbi, da števca
--    nikoli ne premaknemo nazaj.
create or replace function public.claim_offline_invoice_number(
  p_business_id uuid,
  p_premise_id uuid,
  p_device_id uuid,
  p_leto integer,
  p_seq integer
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into pos_invoice_counters_scoped
    (business_id, premise_id, device_id, leto, last_number, updated_at)
  values
    (p_business_id, p_premise_id,
     coalesce(p_device_id, '00000000-0000-0000-0000-000000000000'::uuid),
     p_leto, p_seq, now())
  on conflict (business_id, premise_id, device_id, leto)
  do update set
    last_number = greatest(pos_invoice_counters_scoped.last_number, excluded.last_number),
    updated_at = now();
end $$;
