-- Fix order stock accounting: confirmed/active orders must create physical stock movements,
-- while reservations remain only for packing workflow visibility.

CREATE TABLE IF NOT EXISTS public.order_stock_backfill_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key text NOT NULL UNIQUE,
  orders_scanned integer NOT NULL DEFAULT 0,
  movements_created integer NOT NULL DEFAULT 0,
  qty_deducted integer NOT NULL DEFAULT 0,
  qty_restored integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_stock_backfill_runs TO authenticated;
GRANT ALL ON public.order_stock_backfill_runs TO service_role;
ALTER TABLE public.order_stock_backfill_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can view order stock backfill runs" ON public.order_stock_backfill_runs;
CREATE POLICY "Staff can view order stock backfill runs"
ON public.order_stock_backfill_runs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operations'::public.app_role) OR public.has_role(auth.uid(), 'warehouse_staff'::public.app_role));

CREATE OR REPLACE FUNCTION public.order_stock_is_deducted_status(p_status public.order_status)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT p_status IN (
    'confirmed',
    'packaging',
    'ready_to_pack',
    'packed',
    'ready_to_ship',
    'courier_entry',
    'shipped',
    'in_transit',
    'delivered',
    'partial_delivered',
    'paid',
    'completed',
    'pending_return',
    'return_in_transit',
    'paid_return',
    'unpaid_return',
    'partial_return'
  );
$$;

CREATE OR REPLACE FUNCTION public.order_stock_is_reserved_status(p_status public.order_status)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT p_status IN ('confirmed','packaging','ready_to_pack','packed','ready_to_ship','courier_entry');
$$;

CREATE OR REPLACE FUNCTION public.order_stock_restore_multiplier(p_status public.order_status)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_status IN ('cancelled','fake') THEN 1
    WHEN p_status IN ('returned','paid_return','unpaid_return') THEN 1
    WHEN p_status IN ('partial_return') THEN 1
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.post_order_stock_movement(
  p_order_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_delta integer,
  p_reason text,
  p_note text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cur_stock integer := 0;
  new_stock integer := 0;
  cur_reserved integer := 0;
  pid uuid := p_product_id;
  bid uuid;
  mv_id uuid;
  fallback_user uuid;
BEGIN
  IF p_delta IS NULL OR p_delta = 0 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO mv_id
  FROM public.stock_movements
  WHERE idempotency_key = p_idempotency_key
  LIMIT 1;
  IF mv_id IS NOT NULL THEN
    RETURN mv_id;
  END IF;

  SELECT id INTO fallback_user
  FROM public.profiles
  ORDER BY created_at ASC NULLS LAST, id ASC
  LIMIT 1;

  IF p_variant_id IS NOT NULL THEN
    SELECT v.stock, v.reserved_stock, v.product_id
      INTO cur_stock, cur_reserved, pid
    FROM public.product_variants v
    WHERE v.id = p_variant_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Variant not found for order stock movement: %', p_variant_id;
    END IF;
  ELSE
    SELECT p.stock, p.reserved_stock
      INTO cur_stock, cur_reserved
    FROM public.products p
    WHERE p.id = pid
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found for order stock movement: %', pid;
    END IF;
  END IF;

  new_stock := cur_stock + p_delta;
  SELECT brand_id INTO bid FROM public.products WHERE id = pid;

  IF p_variant_id IS NOT NULL THEN
    UPDATE public.product_variants
       SET stock = new_stock,
           updated_at = now()
     WHERE id = p_variant_id;
  ELSE
    UPDATE public.products
       SET stock = new_stock,
           updated_at = now()
     WHERE id = pid;
  END IF;

  INSERT INTO public.stock_movements (
    product_id, variant_id, brand_id, user_id, delta, stock_before, stock_after, running_stock,
    reason, note, movement_source, reference_type, reference_id, idempotency_key
  ) VALUES (
    pid, p_variant_id, bid, COALESCE(auth.uid(), fallback_user), p_delta, cur_stock, new_stock, new_stock,
    p_reason, p_note, 'order', 'order_stock', p_order_id, p_idempotency_key
  )
  RETURNING id INTO mv_id;

  RETURN mv_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_order_stock_ledger(p_order_id uuid, p_old_status public.order_status, p_new_status public.order_status)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  old_deducted boolean := COALESCE(public.order_stock_is_deducted_status(p_old_status), false);
  new_deducted boolean := COALESCE(public.order_stock_is_deducted_status(p_new_status), false);
  old_restore numeric := COALESCE(public.order_stock_restore_multiplier(p_old_status), 0);
  new_restore numeric := COALESCE(public.order_stock_restore_multiplier(p_new_status), 0);
  delta_qty integer;
  made integer := 0;
  idem text;
BEGIN
  FOR r IN
    SELECT oi.id AS item_id,
           oi.product_id,
           oi.variant_id,
           COALESCE(oi.quantity, 0)::integer AS qty,
           COALESCE(p.is_combo, false) AS is_combo
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id
  LOOP
    IF r.qty <= 0 OR r.product_id IS NULL OR r.is_combo THEN
      CONTINUE;
    END IF;

    -- Sold state entered/leaves: one physical deduction per order item.
    IF NOT old_deducted AND new_deducted THEN
      idem := 'order-stock:sale:' || p_order_id::text || ':' || r.item_id::text;
      PERFORM public.post_order_stock_movement(p_order_id, r.product_id, r.variant_id, -r.qty, 'order_sale', 'Auto stock deduction when order became ' || p_new_status::text, idem);
      made := made + 1;
    ELSIF old_deducted AND NOT new_deducted THEN
      idem := 'order-stock:sale-reversal:' || p_order_id::text || ':' || r.item_id::text || ':' || p_new_status::text;
      PERFORM public.post_order_stock_movement(p_order_id, r.product_id, r.variant_id, r.qty, 'order_sale_reversal', 'Auto stock restore when order left sellable flow to ' || p_new_status::text, idem);
      made := made + 1;
    END IF;

    -- Return/cancel restore entered/leaves after stock was already deducted.
    delta_qty := round((new_restore - old_restore) * r.qty)::integer;
    IF delta_qty <> 0 THEN
      IF delta_qty > 0 THEN
        idem := 'order-stock:return:' || p_order_id::text || ':' || r.item_id::text || ':' || p_new_status::text;
        PERFORM public.post_order_stock_movement(p_order_id, r.product_id, r.variant_id, delta_qty, 'order_return', 'Auto stock restore for ' || p_new_status::text, idem);
      ELSE
        idem := 'order-stock:return-reversal:' || p_order_id::text || ':' || r.item_id::text || ':' || p_new_status::text;
        PERFORM public.post_order_stock_movement(p_order_id, r.product_id, r.variant_id, delta_qty, 'order_return_reversal', 'Auto stock re-deduction after leaving return/cancel state', idem);
      END IF;
      made := made + 1;
    END IF;
  END LOOP;

  RETURN made;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_stock(_order_id uuid, _items jsonb DEFAULT '[]'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT oi.product_id, oi.variant_id, COALESCE(oi.quantity,0) AS qty
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = _order_id
      AND COALESCE(p.is_combo, false) = false
  LOOP
    IF r.qty <= 0 THEN CONTINUE; END IF;
    IF r.variant_id IS NOT NULL THEN
      UPDATE public.product_variants
         SET reserved_stock = GREATEST(reserved_stock + r.qty, 0), updated_at = now()
       WHERE id = r.variant_id;
    ELSIF r.product_id IS NOT NULL THEN
      UPDATE public.products
         SET reserved_stock = GREATEST(reserved_stock + r.qty, 0), updated_at = now()
       WHERE id = r.product_id;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_stock_reservation(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT oi.product_id, oi.variant_id, COALESCE(oi.quantity,0) AS qty
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = _order_id
      AND COALESCE(p.is_combo, false) = false
  LOOP
    IF r.qty <= 0 THEN CONTINUE; END IF;
    IF r.variant_id IS NOT NULL THEN
      UPDATE public.product_variants
         SET reserved_stock = GREATEST(reserved_stock - r.qty, 0), updated_at = now()
       WHERE id = r.variant_id;
    ELSIF r.product_id IS NOT NULL THEN
      UPDATE public.products
         SET reserved_stock = GREATEST(reserved_stock - r.qty, 0), updated_at = now()
       WHERE id = r.product_id;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_reserved_stock(p_product_id uuid, p_variant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_qty integer;
  v_is_combo boolean;
BEGIN
  IF p_variant_id IS NOT NULL THEN
    SELECT COALESCE(SUM(oi.quantity), 0)::int INTO v_qty
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE oi.variant_id = p_variant_id
      AND COALESCE(p.is_combo, false) = false
      AND public.order_stock_is_reserved_status(o.status);
    UPDATE public.product_variants SET reserved_stock = v_qty, updated_at = now() WHERE id = p_variant_id;
  END IF;

  IF p_product_id IS NOT NULL THEN
    SELECT COALESCE(is_combo, false) INTO v_is_combo FROM public.products WHERE id = p_product_id;
    IF COALESCE(v_is_combo, false) THEN
      RETURN;
    END IF;
    SELECT COALESCE(SUM(oi.quantity), 0)::int INTO v_qty
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.product_id = p_product_id
      AND oi.variant_id IS NULL
      AND public.order_stock_is_reserved_status(o.status);
    UPDATE public.products SET reserved_stock = v_qty, updated_at = now() WHERE id = p_product_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_orders_stock_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  items jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_id', oi.product_id,
    'variant_id', oi.variant_id,
    'qty', oi.quantity
  )), '[]'::jsonb)
  INTO items
  FROM public.order_items oi
  WHERE oi.order_id = NEW.id;

  IF TG_OP = 'INSERT' THEN
    IF public.order_stock_is_reserved_status(NEW.status) THEN
      PERFORM public.reserve_stock(NEW.id, items);
    END IF;
    IF public.order_stock_is_deducted_status(NEW.status) THEN
      PERFORM public.apply_order_stock_ledger(NEW.id, NULL, NEW.status);
    END IF;
    RETURN NEW;
  END IF;

  IF public.order_stock_is_reserved_status(NEW.status) AND NOT public.order_stock_is_reserved_status(OLD.status) THEN
    PERFORM public.reserve_stock(NEW.id, items);
  ELSIF NOT public.order_stock_is_reserved_status(NEW.status) AND public.order_stock_is_reserved_status(OLD.status) THEN
    PERFORM public.release_stock_reservation(NEW.id);
  END IF;

  PERFORM public.apply_order_stock_ledger(NEW.id, OLD.status, NEW.status);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_stock_reservation ON public.orders;
CREATE TRIGGER trg_orders_stock_reservation
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.tg_orders_stock_reservation();

CREATE OR REPLACE FUNCTION public.tg_order_items_recompute_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected_order_id uuid;
  old_product_id uuid;
  old_variant_id uuid;
  new_product_id uuid;
  new_variant_id uuid;
BEGIN
  affected_order_id := COALESCE(NEW.order_id, OLD.order_id);
  old_product_id := OLD.product_id;
  old_variant_id := OLD.variant_id;
  new_product_id := NEW.product_id;
  new_variant_id := NEW.variant_id;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_reserved_stock(old_product_id, old_variant_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    PERFORM public.recompute_reserved_stock(old_product_id, old_variant_id);
  END IF;

  PERFORM public.recompute_reserved_stock(new_product_id, new_variant_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_recompute_stock ON public.order_items;
CREATE TRIGGER trg_order_items_recompute_stock
AFTER INSERT OR UPDATE OF product_id, variant_id, quantity, order_id OR DELETE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.tg_order_items_recompute_stock();

-- Historical one-time backfill. It creates idempotent order_stock sale movements only for
-- orders whose item has not already been deducted by this new ledger.
DO $$
DECLARE
  backfill_key text := 'fix_order_stock_sales_20260728';
  v_scanned integer := 0;
  v_created integer := 0;
  v_deducted integer := 0;
  v_restored integer := 0;
  r RECORD;
  sale_idem text;
  return_idem text;
  restore_qty integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.order_stock_backfill_runs WHERE run_key = backfill_key) THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT o.id AS order_id,
           o.status,
           oi.id AS item_id,
           oi.product_id,
           oi.variant_id,
           COALESCE(oi.quantity,0)::integer AS qty,
           COALESCE(p.is_combo, false) AS is_combo
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE public.order_stock_is_deducted_status(o.status)
      AND oi.product_id IS NOT NULL
      AND COALESCE(oi.quantity,0) > 0
      AND COALESCE(p.is_combo, false) = false
    ORDER BY o.created_at, o.id, oi.id
  LOOP
    v_scanned := v_scanned + 1;
    sale_idem := 'order-stock:sale:' || r.order_id::text || ':' || r.item_id::text;

    IF NOT EXISTS (SELECT 1 FROM public.stock_movements WHERE idempotency_key = sale_idem) THEN
      PERFORM public.post_order_stock_movement(
        r.order_id,
        r.product_id,
        r.variant_id,
        -r.qty,
        'order_sale_backfill',
        'Backfill historical order stock deduction for ' || r.status::text,
        sale_idem
      );
      v_created := v_created + 1;
      v_deducted := v_deducted + r.qty;
    END IF;

    restore_qty := round(public.order_stock_restore_multiplier(r.status) * r.qty)::integer;
    IF restore_qty > 0 THEN
      return_idem := 'order-stock:return:' || r.order_id::text || ':' || r.item_id::text || ':' || r.status::text;
      IF NOT EXISTS (SELECT 1 FROM public.stock_movements WHERE idempotency_key = return_idem) THEN
        PERFORM public.post_order_stock_movement(
          r.order_id,
          r.product_id,
          r.variant_id,
          restore_qty,
          'order_return_backfill',
          'Backfill historical returned/cancelled stock restore for ' || r.status::text,
          return_idem
        );
        v_created := v_created + 1;
        v_restored := v_restored + restore_qty;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.order_stock_backfill_runs (run_key, orders_scanned, movements_created, qty_deducted, qty_restored, note)
  VALUES (backfill_key, v_scanned, v_created, v_deducted, v_restored, 'Order stock ledger migration/backfill');

  -- Recalculate reservation counts after historical states were normalized.
  PERFORM public.recompute_reserved_stock(x.product_id, x.variant_id)
  FROM (
    SELECT DISTINCT product_id, variant_id FROM public.order_items WHERE product_id IS NOT NULL
  ) x;
END $$;