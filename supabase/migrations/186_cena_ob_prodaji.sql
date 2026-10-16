-- 186: UNIVERZALNI ARTIKEL – CENA OB PRODAJI (16.10.2026)
--
-- Artikel brez stalne cene: na blagajni se ob vsakem pritisku odpre vnos
-- zneska (kot na karticnem terminalu), npr. "Razno 22 %" za trznico.
-- DDV stopnja ostane stopnja artikla (FURS zahteva DDV za vsako vrstico).
-- Vneseni znesek se zapise v order_lines.unit_price kot pri vseh artiklih.
-- Obstojecih artiklov ne spreminja (privzeto false).
alter table public.items add column if not exists cena_ob_prodaji boolean not null default false;

comment on column public.items.cena_ob_prodaji is
  'Univerzalni artikel: cena se vpise ob vsaki prodaji (POS). items.price se ne uporablja.';
