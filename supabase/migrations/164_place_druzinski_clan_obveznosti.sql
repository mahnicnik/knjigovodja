-- PRELET 333: place - druzinski clan in obveznosti (neto / FURS).
-- druzinski_clan vpliva SAMO na prikaz ("dejanski strosek za druzino");
-- v KPO se vedno knjizi celoten strosek (bruto II).
alter table employees add column if not exists druzinski_clan boolean not null default false;
alter table payslips add column if not exists neto_placano_at timestamptz;
alter table payslips add column if not exists furs_placano_at timestamptz;
