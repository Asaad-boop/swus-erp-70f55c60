UPDATE public.order_stock_backfill_runs b
SET movements_created = s.movements,
    qty_deducted = s.qty_deducted,
    qty_restored = s.qty_restored,
    note = COALESCE(b.note, '') || ' | audit counters recomputed'
FROM (
  SELECT count(*)::integer AS movements,
         COALESCE(sum(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0)::integer AS qty_deducted,
         COALESCE(sum(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0)::integer AS qty_restored
  FROM public.stock_movements
  WHERE reference_type = 'order_stock'
    AND reason IN ('order_sale_backfill','order_return_backfill')
) s
WHERE b.run_key = 'fix_order_stock_sales_20260728';