-- Obratna migracija 185: prejsnji pogled, generator in brez kartica_pokrita.
-- (Opozorila, ki jih je 185 umaknila, ostanejo umaknjena.)

create or replace view public.member_status_view as
 SELECT c.id AS customer_id,
    c.business_id,
    COALESCE(sum(cp.remaining), 0::bigint) AS remaining_visits,
    min(cp.expires) AS nearest_expiry,
        CASE
            WHEN min(cp.expires) IS NULL AND c.prepaid = 0::numeric THEN 'none'::text
            WHEN min(cp.expires) < CURRENT_DATE THEN 'expired'::text
            WHEN COALESCE(sum(cp.remaining), 0::bigint) = 0 AND count(cp.id) > 0 THEN 'expired'::text
            WHEN min(cp.expires) <= (CURRENT_DATE + 3) THEN 'critical'::text
            WHEN COALESCE(sum(cp.remaining), 0::bigint) <= 1 AND count(cp.id) > 0 THEN 'critical'::text
            WHEN min(cp.expires) <= (CURRENT_DATE + 7) THEN 'expiring'::text
            WHEN COALESCE(sum(cp.remaining), 0::bigint) <= 2 AND count(cp.id) > 0 THEN 'expiring'::text
            ELSE 'active'::text
        END AS status
   FROM customers c
     LEFT JOIN customer_packages cp ON cp.customer_id = c.id AND cp.active = true
  GROUP BY c.id, c.business_id, c.prepaid;

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
      AND NOT EXISTS (
        SELECT 1 FROM customer_packages d
        WHERE d.customer_id = cp.customer_id
          AND d.id <> cp.id
          AND d.active = true
          AND d.frozen_at IS NULL
          AND d.expires IS NOT NULL
          AND d.expires > cp.expires
      )
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

drop function if exists public.kartica_pokrita(uuid);
