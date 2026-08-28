-- 1) New/on-hold orders should hold reserved stock
CREATE OR REPLACE FUNCTION public.order_stock_is_reserved_status(p_status order_status)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $function$
  SELECT p_status IN ('new','on_hold','confirmed','packaging','ready_to_pack','packed','ready_to_ship','courier_entry');
$function$;

-- 2) Generic per-order stock resync for a product
CREATE OR REPLACE FUNCTION public.resync_order_stock_for_product(p_product_id uuid)
RETURNS TABLE(orders_fixed integer, total_delta integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  r record;
  v_orders integer := 0;
  v_delta integer := 0;
  v_gap integer;
BEGIN
  FOR r IN
    SELECT o.id AS order_id,
           oi.variant_id,
           SUM(oi.quantity)::int AS qty,
           public.order_stock_net_multiplier(o.status) AS mult,
           COALESCE((
             SELECT SUM(sm.delta)::int FROM public.stock_movements sm
             WHERE sm.reference_type = 'order_stock'
               AND sm.reference_id = o.id
               AND sm.product_id = p_product_id
               AND sm.variant_id IS NOT DISTINCT FROM oi.variant_id
           ), 0) AS actual
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    JOIN public.products p ON p.id = oi.product_id
    WHERE oi.product_id = p_product_id
      AND COALESCE(p.is_combo, false) = false
    GROUP BY o.id, oi.variant_id, o.status
  LOOP
    v_gap := (r.mult * r.qty) - r.actual;
    IF v_gap <> 0 THEN
      PERFORM public.post_order_stock_movement(
        r.order_id, p_product_id, r.variant_id, v_gap,
        'order_stock_resync',
        'Ledger resync: expected ' || (r.mult * r.qty)::text || ', recorded ' || r.actual::text,
        'order-stock:resync:' || r.order_id::text || ':' || COALESCE(r.variant_id::text,'base') || ':' || clock_timestamp()::text
      );
      v_orders := v_orders + 1;
      v_delta := v_delta + v_gap;
    END IF;
  END LOOP;

  PERFORM public.recompute_reserved_stock(p_product_id, NULL);
  orders_fixed := v_orders;
  total_delta := v_delta;
  RETURN NEXT;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resync_order_stock_for_product(uuid) TO authenticated, service_role;

-- 3) Resync this product's ledger
SELECT * FROM public.resync_order_stock_for_product('026a1808-24b1-43a9-ab66-c367a39be559');

-- 4) Physical count adjustment to 8 pcs
DO $$
DECLARE
  v_cur integer;
  v_uid uuid;
  v_bid uuid;
BEGIN
  SELECT stock, brand_id INTO v_cur, v_bid FROM public.products WHERE id = '026a1808-24b1-43a9-ab66-c367a39be559';
  SELECT id INTO v_uid FROM public.profiles ORDER BY created_at ASC NULLS LAST, id ASC LIMIT 1;
  IF v_cur IS DISTINCT FROM 8 THEN
    UPDATE public.products SET stock = 8, updated_at = now() WHERE id = '026a1808-24b1-43a9-ab66-c367a39be559';
    INSERT INTO public.stock_movements (product_id, brand_id, user_id, delta, stock_before, stock_after, running_stock, reason, note, movement_source, reference_type)
    VALUES ('026a1808-24b1-43a9-ab66-c367a39be559', v_bid, v_uid, 8 - v_cur, v_cur, 8, 8, 'physical_audit', 'Physical count audit 28 Aug 2026: counted 8 pcs', 'manual', 'audit');
  END IF;
END $$;

-- 5) Refresh reserved stock everywhere (new/on_hold now reserve)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT oi.product_id, oi.variant_id
           FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
           WHERE o.status IN ('new','on_hold')
  LOOP
    PERFORM public.recompute_reserved_stock(r.product_id, r.variant_id);
  END LOOP;
END $$;