DO $$
DECLARE
  r RECORD;
  v_orders integer := 0;
  v_movements integer := 0;
  v_created integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.order_stock_backfill_runs WHERE run_key = 'fix_order_stock_item_insert_20260728') THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT o.id
    FROM public.orders o
    WHERE public.order_stock_net_multiplier(o.status) <> 0
      AND EXISTS (
        SELECT 1
        FROM public.order_items oi
        LEFT JOIN public.products p ON p.id = oi.product_id
        WHERE oi.order_id = o.id
          AND oi.product_id IS NOT NULL
          AND COALESCE(oi.quantity,0) > 0
          AND COALESCE(p.is_combo,false) = false
          AND NOT EXISTS (
            SELECT 1 FROM public.stock_movements sm
            WHERE sm.idempotency_key = 'order-stock:item-insert:' || o.id::text || ':' || oi.id::text
          )
      )
    ORDER BY o.created_at, o.id
  LOOP
    v_created := public.backfill_order_stock_item_insert(r.id);
    IF v_created > 0 THEN
      v_orders := v_orders + 1;
      v_movements := v_movements + v_created;
    END IF;
  END LOOP;

  INSERT INTO public.order_stock_backfill_runs (run_key, orders_scanned, movements_created, qty_deducted, qty_restored, note)
  VALUES ('fix_order_stock_item_insert_20260728', v_orders, v_movements, 0, 0, 'Final item insert stock consistency pass; quantities are in stock_movements.');
END $$;