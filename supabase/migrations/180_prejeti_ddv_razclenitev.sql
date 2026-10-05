-- REVIZIJA V6 (oktober 2026): DDV PREJETEGA RACUNA PO STOPNJAH
-- ═════════════════════════════════════════════════════════════
--
-- receipts je imel en sam vat_rate. Racun z mesanimi stopnjami (pijaca 22 %,
-- hrana 9,5 %) je bil zato v celoti obracunan po eni stopnji, pavsalno
-- nadomestilo 8 % pa sploh ni imelo mesta.
--
-- vat_breakdown: [{"stopnja": 22, "osnova": 320.96, "ddv": 70.61},
--                 {"stopnja": 9.5, "osnova": 20.71, "ddv": 1.97},
--                 {"stopnja": 8, "osnova": 172.22, "ddv": 13.78, "vrsta": "pavsalno_nadomestilo"}]
-- Vsota osnov = amount_net, vsota ddv = vat_amount. NULL = ena stopnja
-- (vat_rate), kot doslej. Bere ga lib/prejeti-ddv (DDV obracun, KPR).
--
-- UVAJANJE: migracijo zazeni PRED objavo kode (koda zapisuje stolpec).
-- Le dodajanje stolpca - obstojeci zapisi ostanejo nespremenjeni.

alter table public.receipts add column if not exists vat_breakdown jsonb;
