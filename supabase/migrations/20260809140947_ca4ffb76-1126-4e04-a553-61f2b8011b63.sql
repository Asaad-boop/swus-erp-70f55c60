
-- Product / variant performance
CREATE OR REPLACE FUNCTION public.rpt_product_performance(
  _brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'delivered', _level text DEFAULT 'product'
)
RETURNS TABLE(
  product_id uuid, variant_id uuid, product_name text, variant_label text, sku text,
  orders bigint, units numeric, gross_sales numeric, discounts numeric, net_revenue numeric,
  cogs numeric, gross_profit numeric, margin_pct numeric, courier_cost numeric,
  contribution_profit numeric, avg_price numeric, avg_cost numeric,
  returned_units numeric, return_rate numeric, cost_missing_units numeric
)
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  WITH l AS (
    SELECT * FROM public.rpt_lines(_brand_ids, _from, _to, _basis)
  ), g AS (
    SELECT
      l.product_id,
      CASE WHEN _level = 'variant' THEN l.variant_id ELSE NULL::uuid END AS variant_id,
      MIN(l.product_name) AS product_name,
      CASE WHEN _level = 'variant' THEN MIN(l.variant_label) ELSE NULL::text END AS variant_label,
      MIN(l.sku) AS sku,
      COUNT(DISTINCT l.order_id) FILTER (WHERE l.is_delivered) AS orders,
      SUM(l.quantity) FILTER (WHERE l.is_delivered) AS units,
      SUM(l.gross_line) FILTER (WHERE l.is_delivered) AS gross_sales,
      SUM(l.discount_alloc) FILTER (WHERE l.is_delivered) AS discounts,
      SUM(l.net_revenue) FILTER (WHERE l.is_delivered) AS net_revenue,
      SUM(l.line_cogs) FILTER (WHERE l.is_delivered) AS cogs,
      SUM(l.courier_cost) FILTER (WHERE l.is_delivered) AS courier_cost,
      SUM(l.packaging_cost) FILTER (WHERE l.is_delivered) AS packaging_cost,
      SUM(l.refund_alloc) FILTER (WHERE l.is_delivered) AS refunds,
      SUM(l.quantity) FILTER (WHERE l.is_returned) AS returned_units,
      SUM(l.quantity) FILTER (WHERE l.is_delivered AND l.cost_missing) AS cost_missing_units
    FROM l
    GROUP BY 1, 2
  )
  SELECT
    g.product_id, g.variant_id, g.product_name, g.variant_label, g.sku,
    COALESCE(g.orders, 0),
    COALESCE(g.units, 0)::numeric,
    ROUND(COALESCE(g.gross_sales, 0), 2),
    ROUND(COALESCE(g.discounts, 0), 2),
    ROUND(COALESCE(g.net_revenue, 0), 2),
    ROUND(COALESCE(g.cogs, 0), 2),
    ROUND(COALESCE(g.net_revenue, 0) - COALESCE(g.cogs, 0), 2),
    CASE WHEN COALESCE(g.net_revenue, 0) > 0
      THEN ROUND(((COALESCE(g.net_revenue,0) - COALESCE(g.cogs,0)) / g.net_revenue) * 100, 2)
      ELSE 0 END,
    ROUND(COALESCE(g.courier_cost, 0), 2),
    ROUND(COALESCE(g.net_revenue,0) - COALESCE(g.cogs,0) - COALESCE(g.courier_cost,0)
          - COALESCE(g.packaging_cost,0) - COALESCE(g.refunds,0), 2),
    CASE WHEN COALESCE(g.units,0) > 0 THEN ROUND(COALESCE(g.net_revenue,0)/g.units, 2) ELSE 0 END,
    CASE WHEN COALESCE(g.units,0) > 0 THEN ROUND(COALESCE(g.cogs,0)/g.units, 2) ELSE 0 END,
    COALESCE(g.returned_units, 0)::numeric,
    CASE WHEN COALESCE(g.units,0) + COALESCE(g.returned_units,0) > 0
      THEN ROUND((COALESCE(g.returned_units,0) / (COALESCE(g.units,0) + COALESCE(g.returned_units,0))) * 100, 2)
      ELSE 0 END,
    COALESCE(g.cost_missing_units, 0)::numeric
  FROM g
  WHERE g.product_id IS NOT NULL
  ORDER BY 10 DESC;
$function$;

-- Order funnel / operations summary (cohort = orders created|confirmed|delivered in range)
CREATE OR REPLACE FUNCTION public.rpt_order_performance(
  _brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'created'
)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  WITH o AS (
    SELECT
      ord.*,
      (CASE _basis
         WHEN 'delivered' THEN COALESCE(ord.delivered_at, ord.created_at)
         WHEN 'confirmed' THEN COALESCE(ord.confirmed_at, ord.created_at)
         ELSE ord.created_at END) AS basis_ts
    FROM public.orders ord
    WHERE ord.brand_id = ANY(_brand_ids)
  ), f AS (
    SELECT * FROM o
    WHERE basis_ts >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND basis_ts <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  ), agg AS (
    SELECT
      COUNT(*) AS placed,
      COUNT(*) FILTER (WHERE confirmed_at IS NOT NULL) AS confirmed,
      COUNT(*) FILTER (WHERE status::text IN ('shipped','in_transit','delivered','completed','partial_delivered','returned','paid_return','unpaid_return','partial_return','return_in_transit','pending_return')) AS shipped,
      COUNT(*) FILTER (WHERE status::text IN ('delivered','completed','partial_delivered')) AS delivered,
      COUNT(*) FILTER (WHERE status::text IN ('returned','paid_return','unpaid_return','partial_return','return_in_transit','pending_return')) AS returned,
      COUNT(*) FILTER (WHERE status::text IN ('cancelled','fake')) AS cancelled,
      COUNT(*) FILTER (WHERE status::text IN ('new','confirmed','packaging','packed','ready_to_ship','ready_to_pack','courier_entry','on_hold','advance_payment_pending','pre_order')) AS open_orders,
      COALESCE(SUM(total) FILTER (WHERE status::text IN ('delivered','completed','partial_delivered')), 0) AS delivered_value,
      COALESCE(SUM(total), 0) AS placed_value,
      AVG(EXTRACT(EPOCH FROM (confirmed_at - created_at))/3600.0) FILTER (WHERE confirmed_at IS NOT NULL) AS h_to_confirm,
      AVG(EXTRACT(EPOCH FROM (shipped_at - confirmed_at))/3600.0) FILTER (WHERE shipped_at IS NOT NULL AND confirmed_at IS NOT NULL) AS h_to_ship,
      AVG(EXTRACT(EPOCH FROM (delivered_at - shipped_at))/3600.0) FILTER (WHERE delivered_at IS NOT NULL AND shipped_at IS NOT NULL) AS h_to_deliver
    FROM f
  )
  SELECT jsonb_build_object(
    'placed', placed, 'confirmed', confirmed, 'shipped', shipped, 'delivered', delivered,
    'returned', returned, 'cancelled', cancelled, 'open_orders', open_orders,
    'delivered_value', ROUND(delivered_value, 2), 'placed_value', ROUND(placed_value, 2),
    'aov', CASE WHEN delivered > 0 THEN ROUND(delivered_value / delivered, 2) ELSE 0 END,
    'confirm_rate', CASE WHEN placed > 0 THEN ROUND(confirmed::numeric*100/placed, 2) ELSE 0 END,
    'delivery_rate', CASE WHEN placed > 0 THEN ROUND(delivered::numeric*100/placed, 2) ELSE 0 END,
    'return_rate', CASE WHEN placed > 0 THEN ROUND(returned::numeric*100/placed, 2) ELSE 0 END,
    'cancel_rate', CASE WHEN placed > 0 THEN ROUND(cancelled::numeric*100/placed, 2) ELSE 0 END,
    'hours_to_confirm', ROUND(COALESCE(h_to_confirm, 0)::numeric, 1),
    'hours_to_ship', ROUND(COALESCE(h_to_ship, 0)::numeric, 1),
    'hours_to_deliver', ROUND(COALESCE(h_to_deliver, 0)::numeric, 1)
  ) FROM agg;
$function$;

-- Order funnel split by a dimension
CREATE OR REPLACE FUNCTION public.rpt_order_ops_breakdown(
  _brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'created', _dim text DEFAULT 'courier'
)
RETURNS TABLE(
  label text, placed bigint, confirmed bigint, delivered bigint, returned bigint, cancelled bigint,
  delivery_rate numeric, return_rate numeric, cancel_rate numeric, delivered_value numeric, aov numeric
)
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  WITH f AS (
    SELECT
      CASE _dim
        WHEN 'source'   THEN COALESCE(o.source::text, 'manual')
        WHEN 'payment'  THEN COALESCE(NULLIF(o.payment_method, ''), 'cod')
        WHEN 'city'     THEN COALESCE(NULLIF(o.pathao_city_name, ''), NULLIF(o.shipping_city, ''), 'Unknown')
        WHEN 'brand'    THEN COALESCE(b.name, 'Unknown')
        WHEN 'status'   THEN o.status::text
        ELSE COALESCE(NULLIF(o.courier_name, ''), 'unassigned')
      END AS label,
      o.status::text AS status, o.confirmed_at, o.total
    FROM public.orders o
    LEFT JOIN public.brands b ON b.id = o.brand_id
    WHERE o.brand_id = ANY(_brand_ids)
      AND (CASE _basis
             WHEN 'delivered' THEN COALESCE(o.delivered_at, o.created_at)
             WHEN 'confirmed' THEN COALESCE(o.confirmed_at, o.created_at)
             ELSE o.created_at END) >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND (CASE _basis
             WHEN 'delivered' THEN COALESCE(o.delivered_at, o.created_at)
             WHEN 'confirmed' THEN COALESCE(o.confirmed_at, o.created_at)
             ELSE o.created_at END) <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  ), g AS (
    SELECT
      label,
      COUNT(*) AS placed,
      COUNT(*) FILTER (WHERE confirmed_at IS NOT NULL) AS confirmed,
      COUNT(*) FILTER (WHERE status IN ('delivered','completed','partial_delivered')) AS delivered,
      COUNT(*) FILTER (WHERE status IN ('returned','paid_return','unpaid_return','partial_return','return_in_transit','pending_return')) AS returned,
      COUNT(*) FILTER (WHERE status IN ('cancelled','fake')) AS cancelled,
      COALESCE(SUM(total) FILTER (WHERE status IN ('delivered','completed','partial_delivered')), 0) AS delivered_value
    FROM f GROUP BY label
  )
  SELECT
    g.label, g.placed, g.confirmed, g.delivered, g.returned, g.cancelled,
    CASE WHEN g.placed > 0 THEN ROUND(g.delivered::numeric*100/g.placed, 2) ELSE 0 END,
    CASE WHEN g.placed > 0 THEN ROUND(g.returned::numeric*100/g.placed, 2) ELSE 0 END,
    CASE WHEN g.placed > 0 THEN ROUND(g.cancelled::numeric*100/g.placed, 2) ELSE 0 END,
    ROUND(g.delivered_value, 2),
    CASE WHEN g.delivered > 0 THEN ROUND(g.delivered_value/g.delivered, 2) ELSE 0 END
  FROM g ORDER BY g.placed DESC;
$function$;

REVOKE ALL ON FUNCTION public.rpt_product_performance(uuid[], date, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpt_order_performance(uuid[], date, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpt_order_ops_breakdown(uuid[], date, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpt_product_performance(uuid[], date, date, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_order_performance(uuid[], date, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_order_ops_breakdown(uuid[], date, date, text, text) TO authenticated, service_role;
