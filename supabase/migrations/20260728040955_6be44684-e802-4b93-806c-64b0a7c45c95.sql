WITH rocket AS (
  SELECT id, title, stock, reserved_stock, available_stock
  FROM public.products
  WHERE id = '4b1c9686-d440-4c79-b66a-02baecc089e3'
), movement_summary AS (
  SELECT reason, count(*)::int AS rows, COALESCE(sum(delta),0)::int AS delta_sum
  FROM public.stock_movements
  WHERE product_id = '4b1c9686-d440-4c79-b66a-02baecc089e3'
  GROUP BY reason
), status_summary AS (
  SELECT o.status, count(distinct o.id)::int AS orders, COALESCE(sum(oi.quantity),0)::int AS qty
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.product_id = '4b1c9686-d440-4c79-b66a-02baecc089e3'
  GROUP BY o.status
), trigger_summary AS (
  SELECT c.relname AS table_name, t.tgname AS trigger_name, pg_get_triggerdef(t.oid) AS trigger_def
  FROM pg_trigger t
  JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND c.relname IN ('orders','order_items')
    AND t.tgname IN ('trg_orders_stock_reservation','trg_order_items_recompute_stock')
    AND NOT t.tgisinternal
)
SELECT jsonb_build_object(
  'rocket_product', (SELECT to_jsonb(rocket) FROM rocket),
  'movements', COALESCE((SELECT jsonb_agg(to_jsonb(movement_summary) ORDER BY reason) FROM movement_summary), '[]'::jsonb),
  'orders_by_status', COALESCE((SELECT jsonb_agg(to_jsonb(status_summary) ORDER BY status) FROM status_summary), '[]'::jsonb),
  'stock_backfill_runs', COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY created_at DESC) FROM public.order_stock_backfill_runs b WHERE run_key LIKE 'fix_order_stock%'), '[]'::jsonb),
  'triggers', COALESCE((SELECT jsonb_agg(to_jsonb(trigger_summary) ORDER BY table_name, trigger_name) FROM trigger_summary), '[]'::jsonb)
) AS verification;