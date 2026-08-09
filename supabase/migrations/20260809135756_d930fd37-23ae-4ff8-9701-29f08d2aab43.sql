CREATE OR REPLACE FUNCTION public.rpt_lines(
  _brand_ids uuid[],
  _from date,
  _to date,
  _basis text DEFAULT 'delivered'
)
RETURNS TABLE(
  order_id uuid, order_item_id uuid, brand_id uuid, day date, status text,
  is_delivered boolean, is_returned boolean, is_cancelled boolean,
  product_id uuid, variant_id uuid, product_name text, variant_label text, sku text,
  quantity numeric, gross_line numeric, discount_alloc numeric, net_revenue numeric,
  unit_cost numeric, line_cogs numeric, cost_source text, cost_missing boolean,
  courier_cost numeric, packaging_cost numeric, refund_alloc numeric,
  source text, payment_method text, courier_name text, city text, customer_phone text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH ord AS (
    SELECT
      o.id,
      o.brand_id,
      o.status::text AS status,
      CASE _basis
        WHEN 'created'   THEN o.created_at
        WHEN 'confirmed' THEN COALESCE(o.confirmed_at, o.created_at)
        ELSE COALESCE(o.delivered_at, o.created_at)
      END AS basis_ts,
      COALESCE(o.discount_amount, 0)::numeric AS discount_amount,
      COALESCE(o.source::text, 'manual') AS source,
      COALESCE(NULLIF(o.payment_method, ''), 'cod') AS payment_method,
      COALESCE(NULLIF(o.courier_name, ''), 'unassigned') AS courier_name,
      COALESCE(NULLIF(o.pathao_city_name, ''), NULLIF(o.shipping_city, ''), 'Unknown') AS city,
      COALESCE(NULLIF(o.shipping_phone, ''), o.guest_phone) AS customer_phone
    FROM public.orders o
    WHERE o.brand_id = ANY(_brand_ids)
      AND (CASE _basis
             WHEN 'created'   THEN o.created_at
             WHEN 'confirmed' THEN COALESCE(o.confirmed_at, o.created_at)
             ELSE COALESCE(o.delivered_at, o.created_at)
           END) >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND (CASE _basis
             WHEN 'created'   THEN o.created_at
             WHEN 'confirmed' THEN COALESCE(o.confirmed_at, o.created_at)
             ELSE COALESCE(o.delivered_at, o.created_at)
           END) <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND (_basis <> 'delivered' OR o.delivered_at IS NOT NULL
           OR o.status::text IN ('delivered','completed','partial_delivered'))
  ),
  ord_tot AS (
    SELECT oi.order_id, SUM(COALESCE(oi.line_total, 0))::numeric AS lines_total
    FROM public.order_items oi
    JOIN ord ON ord.id = oi.order_id
    GROUP BY oi.order_id
  ),
  base AS (
    SELECT
      o.id AS order_id,
      oi.id AS order_item_id,
      o.brand_id,
      (o.basis_ts AT TIME ZONE 'Asia/Dhaka')::date AS day,
      o.status,
      (o.status IN ('delivered','completed','partial_delivered')) AS is_delivered,
      (o.status IN ('returned','paid_return','unpaid_return','partial_return','return_in_transit','pending_return')) AS is_returned,
      (o.status IN ('cancelled','fake')) AS is_cancelled,
      oi.product_id,
      oi.variant_id,
      COALESCE(p.title, oi.name, 'Unknown product') AS product_name,
      oi.variant_label,
      COALESCE(pv.sku, p.sku) AS sku,
      COALESCE(oi.quantity, 0)::numeric AS quantity,
      COALESCE(oi.line_total, 0)::numeric AS gross_line,
      CASE WHEN COALESCE(t.lines_total, 0) > 0
           THEN (o.discount_amount * COALESCE(oi.line_total, 0) / t.lines_total)::numeric
           ELSE 0::numeric END AS discount_alloc,
      NULLIF(oi.unit_cost_snapshot, 0)::numeric AS snap_cost,
      NULLIF(pv.weighted_avg_cost, 0)::numeric AS variant_wac,
      NULLIF(p.weighted_avg_cost, 0)::numeric AS product_wac,
      NULLIF(p.cost_price, 0)::numeric AS product_cost_price,
      COALESCE(oi.courier_cost_allocated, 0)::numeric AS courier_cost,
      COALESCE(oi.packaging_cost_allocated, 0)::numeric AS packaging_cost,
      COALESCE(oi.refund_amount_allocated, 0)::numeric AS refund_alloc,
      o.source, o.payment_method, o.courier_name, o.city, o.customer_phone
    FROM ord o
    JOIN public.order_items oi ON oi.order_id = o.id
    LEFT JOIN ord_tot t ON t.order_id = o.id
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    LEFT JOIN public.products p ON p.id = oi.product_id
  )
  SELECT
    b.order_id, b.order_item_id, b.brand_id, b.day, b.status,
    b.is_delivered, b.is_returned, b.is_cancelled,
    b.product_id, b.variant_id, b.product_name, b.variant_label, b.sku,
    b.quantity, b.gross_line, b.discount_alloc,
    (b.gross_line - b.discount_alloc)::numeric AS net_revenue,
    COALESCE(b.snap_cost, b.variant_wac, b.product_wac, b.product_cost_price, 0)::numeric AS unit_cost,
    (COALESCE(b.snap_cost, b.variant_wac, b.product_wac, b.product_cost_price, 0) * b.quantity)::numeric AS line_cogs,
    CASE
      WHEN b.snap_cost IS NOT NULL THEN 'snapshot'
      WHEN b.variant_wac IS NOT NULL THEN 'wac_variant'
      WHEN b.product_wac IS NOT NULL THEN 'wac_product'
      WHEN b.product_cost_price IS NOT NULL THEN 'cost_price'
      ELSE 'missing'
    END AS cost_source,
    (COALESCE(b.snap_cost, b.variant_wac, b.product_wac, b.product_cost_price) IS NULL) AS cost_missing,
    b.courier_cost, b.packaging_cost, b.refund_alloc,
    b.source, b.payment_method, b.courier_name, b.city, b.customer_phone
  FROM base b;
$function$;

CREATE OR REPLACE FUNCTION public.rpt_sales_summary(
  _brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'delivered'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH l AS (SELECT * FROM public.rpt_lines(_brand_ids, _from, _to, _basis)),
  agg AS (
    SELECT
      COUNT(DISTINCT order_id) AS total_orders,
      COUNT(DISTINCT order_id) FILTER (WHERE is_delivered) AS delivered_orders,
      COUNT(DISTINCT order_id) FILTER (WHERE is_returned)  AS returned_orders,
      COUNT(DISTINCT order_id) FILTER (WHERE is_cancelled) AS cancelled_orders,
      COALESCE(SUM(quantity) FILTER (WHERE is_delivered), 0) AS units_sold,
      COALESCE(SUM(gross_line) FILTER (WHERE is_delivered), 0) AS gross_sales,
      COALESCE(SUM(discount_alloc) FILTER (WHERE is_delivered), 0) AS discounts,
      COALESCE(SUM(net_revenue) FILTER (WHERE is_delivered), 0) AS net_revenue,
      COALESCE(SUM(line_cogs) FILTER (WHERE is_delivered), 0) AS cogs,
      COALESCE(SUM(courier_cost) FILTER (WHERE is_delivered), 0) AS courier_cost,
      COALESCE(SUM(packaging_cost) FILTER (WHERE is_delivered), 0) AS packaging_cost,
      COALESCE(SUM(refund_alloc) FILTER (WHERE is_delivered), 0) AS refunds,
      COALESCE(SUM(net_revenue) FILTER (WHERE is_returned), 0) AS returned_value,
      COALESCE(SUM(courier_cost) FILTER (WHERE is_returned), 0) AS return_courier_cost,
      COALESCE(SUM(quantity) FILTER (WHERE is_delivered AND cost_missing), 0) AS cost_missing_units
    FROM l
  )
  SELECT jsonb_build_object(
    'total_orders', a.total_orders,
    'delivered_orders', a.delivered_orders,
    'returned_orders', a.returned_orders,
    'cancelled_orders', a.cancelled_orders,
    'units_sold', a.units_sold,
    'gross_sales', round(a.gross_sales, 2),
    'discounts', round(a.discounts, 2),
    'net_revenue', round(a.net_revenue, 2),
    'cogs', round(a.cogs, 2),
    'gross_profit', round(a.net_revenue - a.cogs, 2),
    'courier_cost', round(a.courier_cost, 2),
    'packaging_cost', round(a.packaging_cost, 2),
    'refunds', round(a.refunds, 2),
    'returned_value', round(a.returned_value, 2),
    'return_courier_cost', round(a.return_courier_cost, 2),
    'contribution_profit', round(a.net_revenue - a.cogs - a.courier_cost - a.packaging_cost - a.refunds - a.return_courier_cost, 2),
    'aov', CASE WHEN a.delivered_orders > 0 THEN round(a.net_revenue / a.delivered_orders, 2) ELSE 0 END,
    'delivery_rate', CASE WHEN a.total_orders > 0 THEN round(100.0 * a.delivered_orders / a.total_orders, 2) ELSE 0 END,
    'return_rate', CASE WHEN a.total_orders > 0 THEN round(100.0 * a.returned_orders / a.total_orders, 2) ELSE 0 END,
    'cancel_rate', CASE WHEN a.total_orders > 0 THEN round(100.0 * a.cancelled_orders / a.total_orders, 2) ELSE 0 END,
    'cost_missing_units', a.cost_missing_units
  ) FROM agg a;
$function$;

CREATE OR REPLACE FUNCTION public.rpt_sales_timeseries(
  _brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'delivered'
)
RETURNS TABLE(
  day date, orders bigint, delivered_orders bigint, units numeric,
  net_revenue numeric, cogs numeric, gross_profit numeric,
  courier_cost numeric, contribution_profit numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH l AS (SELECT * FROM public.rpt_lines(_brand_ids, _from, _to, _basis))
  SELECT
    d.day::date,
    COUNT(DISTINCT l.order_id) AS orders,
    COUNT(DISTINCT l.order_id) FILTER (WHERE l.is_delivered) AS delivered_orders,
    COALESCE(SUM(l.quantity) FILTER (WHERE l.is_delivered), 0)::numeric AS units,
    round(COALESCE(SUM(l.net_revenue) FILTER (WHERE l.is_delivered), 0), 2) AS net_revenue,
    round(COALESCE(SUM(l.line_cogs) FILTER (WHERE l.is_delivered), 0), 2) AS cogs,
    round(COALESCE(SUM(l.net_revenue - l.line_cogs) FILTER (WHERE l.is_delivered), 0), 2) AS gross_profit,
    round(COALESCE(SUM(l.courier_cost) FILTER (WHERE l.is_delivered), 0), 2) AS courier_cost,
    round(COALESCE(SUM(l.net_revenue - l.line_cogs - l.courier_cost - l.packaging_cost - l.refund_alloc) FILTER (WHERE l.is_delivered), 0), 2) AS contribution_profit
  FROM generate_series(_from::date, _to::date, interval '1 day') d(day)
  LEFT JOIN l ON l.day = d.day::date
  GROUP BY d.day
  ORDER BY d.day;
$function$;

CREATE OR REPLACE FUNCTION public.rpt_sales_breakdown(
  _brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'delivered', _dim text DEFAULT 'source'
)
RETURNS TABLE(
  label text, orders bigint, delivered_orders bigint, units numeric,
  net_revenue numeric, cogs numeric, gross_profit numeric, courier_cost numeric,
  return_rate numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH l AS (SELECT * FROM public.rpt_lines(_brand_ids, _from, _to, _basis)),
  k AS (
    SELECT l.*,
      CASE _dim
        WHEN 'payment' THEN l.payment_method
        WHEN 'courier' THEN l.courier_name
        WHEN 'city'    THEN l.city
        WHEN 'brand'   THEN COALESCE((SELECT b.name FROM public.brands b WHERE b.id = l.brand_id), 'Unknown')
        WHEN 'status'  THEN l.status
        ELSE l.source
      END AS label
    FROM l
  )
  SELECT
    k.label,
    COUNT(DISTINCT k.order_id) AS orders,
    COUNT(DISTINCT k.order_id) FILTER (WHERE k.is_delivered) AS delivered_orders,
    COALESCE(SUM(k.quantity) FILTER (WHERE k.is_delivered), 0)::numeric AS units,
    round(COALESCE(SUM(k.net_revenue) FILTER (WHERE k.is_delivered), 0), 2) AS net_revenue,
    round(COALESCE(SUM(k.line_cogs) FILTER (WHERE k.is_delivered), 0), 2) AS cogs,
    round(COALESCE(SUM(k.net_revenue - k.line_cogs) FILTER (WHERE k.is_delivered), 0), 2) AS gross_profit,
    round(COALESCE(SUM(k.courier_cost) FILTER (WHERE k.is_delivered), 0), 2) AS courier_cost,
    CASE WHEN COUNT(DISTINCT k.order_id) > 0
      THEN round(100.0 * COUNT(DISTINCT k.order_id) FILTER (WHERE k.is_returned) / COUNT(DISTINCT k.order_id), 2)
      ELSE 0 END AS return_rate
  FROM k
  GROUP BY k.label
  ORDER BY 5 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.rpt_data_health(
  _brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'delivered'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH l AS (SELECT * FROM public.rpt_lines(_brand_ids, _from, _to, _basis)),
  d AS (SELECT * FROM l WHERE is_delivered)
  SELECT jsonb_build_object(
    'delivered_lines', (SELECT COUNT(*) FROM d),
    'cost_missing_units', (SELECT COALESCE(SUM(quantity), 0) FROM d WHERE cost_missing),
    'cost_missing_products', (SELECT COUNT(DISTINCT product_id) FROM d WHERE cost_missing),
    'orders_without_courier_cost', (SELECT COUNT(DISTINCT order_id) FROM d WHERE courier_cost = 0),
    'orders_without_delivered_at', (
      SELECT COUNT(*) FROM public.orders o
      WHERE o.brand_id = ANY(_brand_ids)
        AND o.status::text IN ('delivered','completed','partial_delivered')
        AND o.delivered_at IS NULL
    ),
    'unmatched_recon_rows', (
      SELECT COUNT(*) FROM public.erp_reconciliation_rows r
      WHERE r.match_status IS DISTINCT FROM 'matched'
    )
  );
$function$;

GRANT EXECUTE ON FUNCTION public.rpt_lines(uuid[], date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_sales_summary(uuid[], date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_sales_timeseries(uuid[], date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_sales_breakdown(uuid[], date, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_data_health(uuid[], date, date, text) TO authenticated;