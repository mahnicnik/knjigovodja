-- 183: IZDANEGA RACUNA BLAGAJNE NI MOGOCE IZBRISATI (7.10.2026, racun 1597)
--
-- Blagajna je izbrisala narocilo, ki je bilo ze davcno potrjeno pri FURS
-- (racun SIRBFB01-RACUNKO01-1597). ON DELETE CASCADE je odnesel vrstice in
-- placilo - racun je izginil iz seznama racunov, prometa in Z-porocila.
-- Popravek v aplikaciji (pos-client: closeOrderEmpty, replaceLines) to
-- prepreci v kodi; ta migracija enako zagotovi v bazi za VSE poti
-- (brskalnik, namizna in mobilna blagajna, API).
--
-- Narocilo s stevilko racuna ali s placilom se ne sme izbrisati; vrstic
-- narocila s stevilko racuna ni mogoce brisati (storno gre prek `voided`,
-- ne prek brisanja).

create or replace function public.zavrni_brisanje_izdanega_racuna()
returns trigger language plpgsql as $$
begin
  if old.invoice_number is not null
     or exists (select 1 from public.payments p where p.order_id = old.id) then
    raise exception 'Narocilo % je izdan racun (%) - izbris ni dovoljen', old.id, coalesce(old.invoice_number, 'placilo')
      using errcode = 'P0001';
  end if;
  return old;
end $$;

drop trigger if exists trg_zavrni_brisanje_izdanega_racuna on public.orders;
create trigger trg_zavrni_brisanje_izdanega_racuna
  before delete on public.orders
  for each row execute function public.zavrni_brisanje_izdanega_racuna();

create or replace function public.zavrni_spremembo_vrstic_izdanega_racuna()
returns trigger language plpgsql as $$
declare v_st text;
begin
  select invoice_number into v_st from public.orders
   where id = old.order_id;
  if v_st is not null then
    raise exception 'Vrstic izdanega racuna % ni mogoce brisati', v_st
      using errcode = 'P0001';
  end if;
  return old;
end $$;

drop trigger if exists trg_zavrni_spremembo_vrstic_izdanega_racuna on public.order_lines;
create trigger trg_zavrni_spremembo_vrstic_izdanega_racuna
  before delete on public.order_lines
  for each row execute function public.zavrni_spremembo_vrstic_izdanega_racuna();
