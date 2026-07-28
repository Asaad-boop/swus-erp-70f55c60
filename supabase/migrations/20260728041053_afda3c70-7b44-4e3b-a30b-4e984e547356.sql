WITH rocket AS (
  SELECT id, title, stock, reserved_stock, available_stock
  FROM public.products
  WHERE id = '4b1c9686-d440-4c79-b66a-02baecc089e3'
), movement_summary AS (
  SELECT reason, count(*)::int AS rows, COALESCE(sum(delta),0)::int AS delta_sum
  FROM public.stock_movements
  WHERE product_id = '4b1c9686-d440-4c79-b66a-02baecc089e3'
  GROUP BY reason
), dup_check AS (
  SELECT count(*)::int AS extra_item_insert_rows
  FROM public.stock_movements
  WHERE reference_type = 'order_stock'
    AND reason = 'order_item_insert'
    AND idempotency_key LIKE 'order-stock:item-insert:%'
), backfill AS (
  SELECT run_key, movements_created, qty_deducted, qty_restored, note
  FROM public.order_stock_backfill_runs
  WHERE run_key LIKE 'fix_order_stock%'
)
SELECT jsonb_build_object(
  'rocket_product', (SELECT to_jsonb(rocket) FROM rocket),
  'movements', COALESCE((SELECT jsonb_agg(to_jsonb(movement_summary) ORDER BY reason) FROM movement_summary), '[]'::jsonb),
  'duplicate_item_insert_rows', (SELECT extra_item_insert_rows FROM dup_check),
  'backfill_runs', COALESCE((SELECT jsonb_agg(to_jsonb(backfill) ORDER BY run_key) FROM backfill), '[]'::jsonb)
) AS verification;