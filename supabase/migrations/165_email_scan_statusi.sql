-- PRELET 334: vsak PDF iz e-poste pusti sled.
--  'ni_racun' - AI meni, da dokument ni racun (viden, en klik ga doda v pregled)
--  'napaka'   - zaklenjen PDF ali napaka branja (napaka branja se ob naslednjem
--               skeniranju poskusi znova)
alter table email_scan_pending drop constraint if exists email_scan_pending_status_check;
alter table email_scan_pending add constraint email_scan_pending_status_check check (status = any (array['pending','confirmed','rejected','ni_racun','napaka']));
-- Hitro preverjanje "je ta e-posta ze obdelana" (po povezavi in ID sporocila).
create index if not exists email_scan_pending_conn_msg_idx on email_scan_pending (connection_id, ((extracted->>'_gmail_message_id')));
