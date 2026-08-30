-- ============================================================
-- P1: Reservation Single Source of Truth
-- ============================================================

-- 0. Fix P0 audit trigger (products row has no product_id field)
CREATE OR REPLACE FUNCTION public.tg_inv_audit_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_entity text := TG_ARGV[0];
  v_pid uuid;
  v_vid uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.stock,0) = COALESCE(NEW.stock,0)
     AND COALESCE(OLD.reserved_stock,0) = COALESCE(NEW.reserved_stock,0) THEN
    RETURN NEW;
  END IF;

  IF v_entity = 'variant' THEN
    v_vid := NEW.id;
    SELECT product_id INTO v_pid FROM public.product_variants WHERE id = NEW.id;
  ELSE
    v_pid := NEW.id;
    v_vid := NULL;
  END IF;

  INSERT INTO public.inv_stock_audit(
    entity, product_id, variant_id, op,
    stock_before, stock_after, reserved_before, reserved_after,
    changed_by, app_source
  ) VALUES (
    v_entity, v_pid, v_vid, TG_OP,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.stock ELSE NULL END,
    NEW.stock,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.reserved_stock ELSE NULL END,
    NEW.reserved_stock,
    auth.uid(),
    NULLIF(current_setting('app.inv_source', true), '')
  );
  RETURN NEW;
END $$;

-- 1. Authoritative calculator ---------------------------------
CREATE OR REPLACE FUNCTION public.inv_open_order_qty(p_product_id uuid, p_variant_id uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT COALESCE(SUM(oi.quantity),0)::int
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  LEFT JOIN public.products p ON p.id = oi.product_id
  WHERE COALESCE(p.is_combo,false) = false
    AND public.order_stock_is_reserved_status(o.status)
    AND (
      (p_variant_id IS NOT NULL AND oi.variant_id = p_variant_id)
      OR (p_variant_id IS NULL AND p_product_id IS NOT NULL AND oi.product_id = p_product_id AND oi.variant_id IS NULL)
    );
$$;

CREATE OR REPLACE FUNCTION public.inv_qc_hold_qty(p_product_id uuid, p_variant_id uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT COALESCE(SUM(GREATEST(COALESCE(ri.reserved_qty,0),0)),0)::int
  FROM public.imp_po_release_items ri
  WHERE (
      (p_variant_id IS NOT NULL AND ri.variant_id = p_variant_id)
      OR (p_variant_id IS NULL AND p_product_id IS NOT NULL AND ri.product_id = p_product_id AND ri.variant_id IS NULL)
    );
$$;

-- The ONLY function allowed to write reserved_stock
CREATE OR REPLACE FUNCTION public.inv_recalc_reservation(p_product_id uuid, p_variant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_pid uuid := p_product_id;
  v_qty integer;
  v_is_combo boolean;
  v_has_variants boolean;
BEGIN
  PERFORM set_config('app.inv_reserved_engine', 'on', true);

  IF p_variant_id IS NOT NULL THEN
    SELECT product_id INTO v_pid FROM public.product_variants WHERE id = p_variant_id FOR UPDATE;
    IF v_pid IS NULL THEN v_pid := p_product_id; END IF;
    v_qty := public.inv_open_order_qty(v_pid, p_variant_id) + public.inv_qc_hold_qty(v_pid, p_variant_id);
    UPDATE public.product_variants
       SET reserved_stock = v_qty, updated_at = now()
     WHERE id = p_variant_id AND reserved_stock IS DISTINCT FROM v_qty;
  END IF;

  IF v_pid IS NULL THEN
    PERFORM set_config('app.inv_reserved_engine', 'off', true);
    RETURN;
  END IF;

  SELECT COALESCE(is_combo,false) INTO v_is_combo FROM public.products WHERE id = v_pid FOR UPDATE;
  IF COALESCE(v_is_combo,false) THEN
    PERFORM set_config('app.inv_reserved_engine', 'off', true);
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.product_variants WHERE product_id = v_pid AND is_active)
    INTO v_has_variants;

  IF v_has_variants THEN
    SELECT COALESCE(SUM(reserved_stock),0)::int INTO v_qty
    FROM public.product_variants WHERE product_id = v_pid AND is_active;
  ELSE
    v_qty := public.inv_open_order_qty(v_pid, NULL) + public.inv_qc_hold_qty(v_pid, NULL);
  END IF;

  UPDATE public.products
     SET reserved_stock = v_qty, updated_at = now()
   WHERE id = v_pid AND reserved_stock IS DISTINCT FROM v_qty;

  PERFORM set_config('app.inv_reserved_engine', 'off', true);
END $$;

CREATE OR REPLACE FUNCTION public.inv_recalc_reservation_for_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT oi.product_id, oi.variant_id
    FROM public.order_items oi WHERE oi.order_id = p_order_id
  LOOP
    PERFORM public.inv_recalc_reservation(r.product_id, r.variant_id);
  END LOOP;
END $$;

-- 2. Legacy writers now delegate ------------------------------
CREATE OR REPLACE FUNCTION public.recompute_reserved_stock(p_product_id uuid, p_variant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.inv_recalc_reservation(p_product_id, p_variant_id);
END $$;

CREATE OR REPLACE FUNCTION public.reserve_stock(_order_id uuid, _items jsonb DEFAULT '[]'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.inv_recalc_reservation_for_order(_order_id);
END $$;

CREATE OR REPLACE FUNCTION public.release_stock_reservation(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.inv_recalc_reservation_for_order(_order_id);
END $$;

CREATE OR REPLACE FUNCTION public.imp_adjust_reserved(_product_id uuid, _variant_id uuid, _delta integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- delta ignored on purpose: reservation is always recalculated from sources
  PERFORM public.inv_recalc_reservation(_product_id, _variant_id);
END $$;

-- 3. Remove duplicate/conflicting triggers --------------------
DROP TRIGGER IF EXISTS order_items_reserved_stock ON public.order_items;
DROP TRIGGER IF EXISTS orders_reserved_stock ON public.orders;

-- 4. QC hold changes recalc reservation -----------------------
CREATE OR REPLACE FUNCTION public.tg_release_items_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.product_id IS NOT NULL THEN
    PERFORM public.inv_recalc_reservation(OLD.product_id, OLD.variant_id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.product_id IS NOT NULL THEN
    PERFORM public.inv_recalc_reservation(NEW.product_id, NEW.variant_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_release_items_reservation ON public.imp_po_release_items;
CREATE TRIGGER trg_release_items_reservation
AFTER INSERT OR UPDATE OR DELETE ON public.imp_po_release_items
FOR EACH ROW EXECUTE FUNCTION public.tg_release_items_reservation();

-- 5. Variant->product sync must flag itself as engine ---------
CREATE OR REPLACE FUNCTION public.trg_sync_product_stock_from_variants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  pid uuid := COALESCE(NEW.product_id, OLD.product_id);
  s int; r int;
BEGIN
  SELECT COALESCE(SUM(stock),0), COALESCE(SUM(reserved_stock),0)
    INTO s, r
  FROM public.product_variants
  WHERE product_id = pid AND is_active;

  PERFORM set_config('app.inv_reserved_engine', 'on', true);
  UPDATE public.products
     SET stock = s, reserved_stock = r
   WHERE id = pid
     AND (stock IS DISTINCT FROM s OR reserved_stock IS DISTINCT FROM r);
  PERFORM set_config('app.inv_reserved_engine', 'off', true);

  RETURN NULL;
END $$;

-- 6. Block blind reserved_stock overwrites --------------------
CREATE OR REPLACE FUNCTION public.tg_inv_guard_reserved()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.reserved_stock IS DISTINCT FROM OLD.reserved_stock
     AND COALESCE(current_setting('app.inv_reserved_engine', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'reserved_stock is engine-managed. Use inv_recalc_reservation() instead of direct writes.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_inv_guard_reserved_products ON public.products;
CREATE TRIGGER trg_inv_guard_reserved_products
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.tg_inv_guard_reserved();

DROP TRIGGER IF EXISTS trg_inv_guard_reserved_variants ON public.product_variants;
CREATE TRIGGER trg_inv_guard_reserved_variants
BEFORE UPDATE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.tg_inv_guard_reserved();

-- 7. Drift reporting ------------------------------------------
CREATE OR REPLACE FUNCTION public.inv_reservation_drift()
RETURNS TABLE(product_id uuid, variant_id uuid, sku text, title text,
              stored_reserved integer, expected_reserved integer, drift integer)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT p.id, NULL::uuid, p.sku, p.title,
         COALESCE(p.reserved_stock,0)::int,
         (public.inv_open_order_qty(p.id, NULL) + public.inv_qc_hold_qty(p.id, NULL))::int,
         (public.inv_open_order_qty(p.id, NULL) + public.inv_qc_hold_qty(p.id, NULL) - COALESCE(p.reserved_stock,0))::int
  FROM public.products p
  WHERE COALESCE(p.is_combo,false) = false
    AND NOT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id AND v.is_active)
    AND (public.inv_open_order_qty(p.id, NULL) + public.inv_qc_hold_qty(p.id, NULL)) IS DISTINCT FROM COALESCE(p.reserved_stock,0)
  UNION ALL
  SELECT v.product_id, v.id, v.sku, p2.title,
         COALESCE(v.reserved_stock,0)::int,
         (public.inv_open_order_qty(v.product_id, v.id) + public.inv_qc_hold_qty(v.product_id, v.id))::int,
         (public.inv_open_order_qty(v.product_id, v.id) + public.inv_qc_hold_qty(v.product_id, v.id) - COALESCE(v.reserved_stock,0))::int
  FROM public.product_variants v
  JOIN public.products p2 ON p2.id = v.product_id
  WHERE v.is_active
    AND (public.inv_open_order_qty(v.product_id, v.id) + public.inv_qc_hold_qty(v.product_id, v.id)) IS DISTINCT FROM COALESCE(v.reserved_stock,0);
$$;

-- 8. Controlled resync of every product/variant ---------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.product_variants WHERE is_active LOOP
    PERFORM public.inv_recalc_reservation(NULL, r.id);
  END LOOP;
  FOR r IN SELECT id FROM public.products WHERE COALESCE(is_combo,false) = false LOOP
    PERFORM public.inv_recalc_reservation(r.id, NULL);
  END LOOP;
END $$;
