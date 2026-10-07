-- Obratna migracija 184.
drop table if exists public.pretvorbe_pakiranja;
alter table public.delivery_lines drop column if exists pack_size;
