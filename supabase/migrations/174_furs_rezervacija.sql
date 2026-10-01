-- PRELET 364 (H1): davcna potrditev racunov iz portala porabi EN zaporedno
-- stevilko, tudi ce FURS veckrat ne odgovori.
--
-- issued_invoices.furs_rezervacija: {premiseId, deviceId, sequence,
--   invoiceNumber, zoi, issuedAt} - rezervirano ENKRAT, pred prvim klicem
--   FURS. Ponovni poskusi posljejo isto stevilko, ZOI in cas izdaje z oznako
--   SubsequentSubmit (kot blagajna). Ob uspehu se prepise v invoice_number/zoi/eor.
-- placilni_zahtevki.furs_poskus_ob: cas zadnjega poskusa davcne potrditve
--   (cron poskusa z razmikom).

alter table issued_invoices add column if not exists furs_rezervacija jsonb;
alter table placilni_zahtevki add column if not exists furs_poskus_ob timestamptz;
