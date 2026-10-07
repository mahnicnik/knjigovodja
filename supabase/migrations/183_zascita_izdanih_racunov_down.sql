-- Obratna migracija 183.
drop trigger if exists trg_zavrni_spremembo_vrstic_izdanega_racuna on public.order_lines;
drop function if exists public.zavrni_spremembo_vrstic_izdanega_racuna();
drop trigger if exists trg_zavrni_brisanje_izdanega_racuna on public.orders;
drop function if exists public.zavrni_brisanje_izdanega_racuna();
