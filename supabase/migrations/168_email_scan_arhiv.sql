-- PRELET 338: status 'arhiv' - pocisceni predlogi iz e-postnega skeniranja
-- se ne prikazujejo vec, ostanejo pa zabelezeni (skeniranje jih ne najde znova).
alter table email_scan_pending drop constraint if exists email_scan_pending_status_check;
alter table email_scan_pending add constraint email_scan_pending_status_check check (status = any (array['pending','confirmed','rejected','ni_racun','napaka','arhiv']));
