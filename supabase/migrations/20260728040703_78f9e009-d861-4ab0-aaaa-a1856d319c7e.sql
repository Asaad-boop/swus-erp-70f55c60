UPDATE public.order_stock_backfill_runs b
SET qty_deducted = s.qty_deducted,
    qty_restored = s.qty_restored,
    note = COALESCE(b.note, '') || ' | audit counters recomputed'
FROM (
  SELECT COALESCE(sum(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0)::integer AS qty_deducted,
         COALESCE(sum(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0)::integer AS qty_restored
  FROM public.stock_movements
  WHERE reference_type = 'order_stock'
    AND reason = 'order_item_insert'
    AND idempotency_key LIKE 'order-stock:item-insert:%'
) s
WHERE b.run_key = 'fix_order_stock_item_insert_20260728';