-- ═══════════════════════════════════════════════════════════════════
-- PRELET 320: dnevnik integracij + zaščita pred podvojenimi računi
-- ═══════════════════════════════════════════════════════════════════

-- 1) integration_logs.status je dovoljeval samo success/error/pending,
--    koda (Stripe, WooCommerce, Shopify webhook) pa od 30.7.2026 piše
--    'failed' in 'skipped'. Baza je te zapise zavrnila, koda pa je napako
--    tiho pogoltnila - zato v /integracije ni bilo NOBENE sledi, ko račun
--    ni nastal (Domen Kocjan, 20.9.2026). Razširimo dovoljene vrednosti.
alter table integration_logs
  drop constraint if exists integration_logs_status_check;
alter table integration_logs
  add constraint integration_logs_status_check
  check (status = any (array['success', 'error', 'pending', 'failed', 'skipped']));

-- 2) Webhooki preverijo "račun že obstaja" z branjem, nato vpišejo. Če
--    ponudnik isti dogodek pošlje dvakrat hkrati, obe obdelavi preideta
--    preverbo in nastaneta DVA računa. Unikatni indeks drugi vpis zavrne.
--    Omejeno na reference, ki jih ustvarijo webhooki (stripe-/wc-/sh-);
--    javni API (v1) dovoli poljubno external_reference, zato ga ne vežemo.
create unique index if not exists issued_invoices_org_webhook_ref_uniq
  on issued_invoices (org_id, external_reference)
  where external_reference like 'stripe-%'
     or external_reference like 'wc-%'
     or external_reference like 'sh-%';
