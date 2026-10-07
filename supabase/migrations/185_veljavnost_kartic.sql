-- 185: STANJE STRANKE PO VELJAVNIH KARTICAH (7.10.2026)
--
-- NAPAKA: potekla kartica ostane active = true, ko stranka dobi novo (kupljeno
-- ali dodano rocno). member_status_view je vzel min(expires) vseh aktivnih
-- kartic - stranka z veljavno novo kartico je bila "expired" (30 strank ŠIRM).
-- generate_pos_notifications je za "pokritost" zahteval novejso kartico z
-- datumom poteka - kartica brez datuma (neomejena) stranke ni pokrila, ze
-- ustvarjena opozorila pa so ostala, tudi ko je bila stranka podaljsana.
--
-- Isto pravilo kot apps/web/lib/kartice.ts: kartica je na voljo, ce je
-- aktivna, ni potekla in ima obiske (ali jih ne steje).
-- Podatkov kartic NE spreminja.

create or replace view public.member_status_view as
with k as (
  select cp.customer_id,
         cp.expires,
         cp.remaining,
         (cp.expires is null or cp.expires >= current_date)
           and (cp.remaining is null or cp.remaining > 0) as na_voljo
  from public.customer_packages cp
  where cp.active = true
), s as (
  select c.id as customer_id,
         c.business_id,
         c.prepaid,
         count(k.customer_id) as aktivnih,
         count(k.customer_id) filter (where k.na_voljo) as veljavnih,
         coalesce(sum(k.remaining) filter (where k.na_voljo), 0)::bigint as obiski,
         bool_or(k.remaining is null) filter (where k.na_voljo) as brez_stetja,
         case when bool_or(k.expires is null) filter (where k.na_voljo) then null
              else max(k.expires) filter (where k.na_voljo) end as pokrita_do
  from public.customers c
  left join k on k.customer_id = c.id
  group by c.id, c.business_id, c.prepaid
)
select s.customer_id,
       s.business_id,
       s.obiski as remaining_visits,
       s.pokrita_do as nearest_expiry,
       case
         when s.aktivnih = 0 then 'none'
         when s.veljavnih = 0 then 'expired'
         when s.pokrita_do is not null and s.pokrita_do <= current_date + 3 then 'critical'
         when not coalesce(s.brez_stetja, false) and s.obiski <= 1 then 'critical'
         when s.pokrita_do is not null and s.pokrita_do <= current_date + 7 then 'expiring'
         when not coalesce(s.brez_stetja, false) and s.obiski <= 2 then 'expiring'
         else 'active'
       end as status
from s;

-- Pomozna: ali kartico pokriva druga kartica iste stranke, ki je na voljo
-- in velja dlje (ali brez omejitve).
create or replace function public.kartica_pokrita(p_package_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1
    from public.customer_packages cp
    join public.customer_packages d on d.customer_id = cp.customer_id and d.id <> cp.id
    where cp.id = p_package_id
      and d.active = true
      and d.frozen_at is null
      and (d.remaining is null or d.remaining > 0)
      and (d.expires is null or d.expires >= current_date)
      and (d.expires is null or cp.expires is null or d.expires > cp.expires)
  )
$$;

create or replace function public.generate_pos_notifications(p_business_id uuid, p_vkljuci_zalogo boolean default true)
returns integer language plpgsql as $function$
DECLARE
  v_count integer := 0;
  pkg RECORD;
  item RECORD;
BEGIN
  DELETE FROM pos_notifications
  WHERE business_id = p_business_id
    AND created_at < now() - interval '30 days';

  -- 185: opozorila o kartici, ki jo je stranka ze podaljsala (nova kartica,
  -- kupljena ali rocno dodana), samodejno umaknemo.
  UPDATE pos_notifications n
     SET dismissed = true
   WHERE n.business_id = p_business_id
     AND n.dismissed = false
     AND n.type IN ('expired', 'expiring_soon', 'low_visits')
     AND n.package_id IS NOT NULL
     AND public.kartica_pokrita(n.package_id);

  ---------------------------------------------------------------- kartice
  FOR pkg IN
    SELECT cp.*, c.name as cname, pt.name as ptname, pt.notify_before_days
    FROM customer_packages cp
    JOIN customers c ON c.id = cp.customer_id
    LEFT JOIN package_templates pt ON pt.id = cp.template_id
    WHERE cp.active = true
      AND cp.frozen_at IS NULL
      AND c.business_id = p_business_id
      AND cp.expires IS NOT NULL
      AND cp.expires BETWEEN CURRENT_DATE - interval '1 day'
                         AND CURRENT_DATE + interval '30 days'
      -- PRELET 226 + 185: stranke, ki jo POKRIVA druga kartica (tudi brez
      -- datuma poteka), ne opozarjamo.
      AND NOT public.kartica_pokrita(cp.id)
  LOOP
    DECLARE
      v_days integer := (pkg.expires::date - CURRENT_DATE);
      v_type text;
      v_msg text;
      v_severity text;
      v_obstojece uuid;
    BEGIN
      IF v_days < 0 THEN
        v_type := 'expired';
        v_msg := pkg.cname || ': ' || pkg.ptname || ' je potekla ' || abs(v_days) || ' dni nazaj';
        v_severity := 'danger';
      ELSIF v_days = 0 THEN
        v_type := 'expiring_soon';
        v_msg := pkg.cname || ': ' || pkg.ptname || ' poteče DANES';
        v_severity := 'danger';
      ELSIF v_days <= 3 THEN
        v_type := 'expiring_soon';
        v_msg := pkg.cname || ': ' || pkg.ptname || ' poteče čez ' || v_days || ' dni';
        v_severity := 'danger';
      ELSIF v_days <= COALESCE(pkg.notify_before_days, 7) THEN
        v_type := 'expiring_soon';
        v_msg := pkg.cname || ': ' || pkg.ptname || ' poteče čez ' || v_days || ' dni';
        v_severity := 'warning';
      END IF;

      IF v_type IS NOT NULL THEN
        SELECT id INTO v_obstojece
        FROM pos_notifications
        WHERE business_id = p_business_id
          AND customer_id = pkg.customer_id
          AND package_id = pkg.id
          AND type = v_type
        ORDER BY created_at DESC
        LIMIT 1;

        IF v_obstojece IS NULL THEN
          INSERT INTO pos_notifications (business_id, customer_id, package_id, type, message, severity)
          VALUES (p_business_id, pkg.customer_id, pkg.id, v_type, v_msg, v_severity);
          v_count := v_count + 1;
        ELSE
          UPDATE pos_notifications
          SET message = v_msg, severity = v_severity
          WHERE id = v_obstojece AND message <> v_msg;
        END IF;
      END IF;
    END;
  END LOOP;

  ------------------------------------------------------------- malo obiskov
  FOR pkg IN
    SELECT cp.*, c.name as cname, pt.name as ptname
    FROM customer_packages cp
    JOIN customers c ON c.id = cp.customer_id
    LEFT JOIN package_templates pt ON pt.id = cp.template_id
    WHERE cp.active = true AND cp.frozen_at IS NULL
      AND c.business_id = p_business_id
      AND cp.remaining IS NOT NULL AND cp.remaining <= 2 AND cp.remaining > 0
      AND (cp.expires IS NULL OR cp.expires >= CURRENT_DATE)
      AND NOT public.kartica_pokrita(cp.id)
  LOOP
    DECLARE v_msg text := pkg.cname || ': ' || pkg.ptname || ' — ostanejo samo ' || pkg.remaining || ' obiski';
            v_obstojece uuid;
    BEGIN
      SELECT id INTO v_obstojece FROM pos_notifications
      WHERE business_id = p_business_id AND customer_id = pkg.customer_id
        AND package_id = pkg.id AND type = 'low_visits'
      ORDER BY created_at DESC LIMIT 1;

      IF v_obstojece IS NULL THEN
        INSERT INTO pos_notifications (business_id, customer_id, package_id, type, message, severity)
        VALUES (p_business_id, pkg.customer_id, pkg.id, 'low_visits', v_msg, 'warning');
        v_count := v_count + 1;
      ELSE
        UPDATE pos_notifications SET message = v_msg
        WHERE id = v_obstojece AND message <> v_msg;
      END IF;
    END;
  END LOOP;

  ----------------------------------------------------------------- zaloga
  IF p_vkljuci_zalogo THEN
    FOR item IN
      SELECT id, name, stock, low_stock
      FROM items
      WHERE business_id = p_business_id AND archived = false
        AND stock IS NOT NULL AND low_stock IS NOT NULL
        AND low_stock > 0 AND stock <= low_stock
    LOOP
      DECLARE
        v_msg text := 'Nizka zaloga: ' || item.name || ' (' || item.stock || ' / min ' || item.low_stock || ')';
        v_obstojece uuid;
      BEGIN
        SELECT id INTO v_obstojece FROM pos_notifications
        WHERE business_id = p_business_id AND type = 'low_stock'
          AND item_id = item.id
          AND created_at::date = CURRENT_DATE
        LIMIT 1;

        IF v_obstojece IS NULL THEN
          INSERT INTO pos_notifications (business_id, item_id, type, message, severity)
          VALUES (p_business_id, item.id, 'low_stock', v_msg,
                  CASE WHEN item.stock = 0 THEN 'danger' ELSE 'warning' END);
          v_count := v_count + 1;
        ELSE
          UPDATE pos_notifications SET message = v_msg
          WHERE id = v_obstojece AND message <> v_msg;
        END IF;
      END;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$function$;
