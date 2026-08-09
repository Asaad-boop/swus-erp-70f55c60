CREATE OR REPLACE FUNCTION public.rpt_delivered_statuses()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT ARRAY['delivered','completed','partial_delivered','paid','exchanged']::text[];
$$;

CREATE OR REPLACE FUNCTION public.rpt_returned_statuses()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT ARRAY['returned','paid_return','unpaid_return','partial_return','return_in_transit','pending_return']::text[];
$$;

GRANT EXECUTE ON FUNCTION public.rpt_delivered_statuses() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_returned_statuses() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpt_lines(_brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'delivered'::text)
 RETURNS TABLE(order_id uuid, order_item_id uuid, brand_id uuid, day date, status text, is_delivered boolean, is_returned boolean, is_cancelled boolean, product_id uuid, variant_id uuid, product_name text, variant_label text, sku text, quantity numeric, gross_line numeric, discount_alloc numeric, net_revenue numeric, unit_cost numeric, line_cogs numeric, cost_source text, cost_missing boolean, courier_cost numeric, packaging_cost numeric, refund_alloc numeric, source text, payment_method text, courier_name text, city text, customer_phone text)
 LANGUAGE sql STABLE SET search_path TO 'public'
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
           OR o.status::text = ANY(public.rpt_delivered_statuses()))
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
      (o.status = ANY(public.rpt_delivered_statuses())) AS is_delivered,
      (o.status = ANY(public.rpt_returned_statuses())) AS is_returned,
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

CREATE OR REPLACE FUNCTION public.rpt_sales_summary(_brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'delivered'::text)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH l AS (SELECT * FROM public.rpt_lines(_brand_ids, _from, _to, _basis)),
  agg AS (
    SELECT
      COUNT(DISTINCT order_id) FILTER (WHERE is_delivered) AS delivered_orders,
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
  ),
  cohort AS (
    SELECT
      COUNT(*) AS placed,
      COUNT(*) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())) AS c_delivered,
      COUNT(*) FILTER (WHERE o.status::text = ANY(public.rpt_returned_statuses())) AS c_returned,
      COUNT(*) FILTER (WHERE o.status::text IN ('cancelled','fake')) AS c_cancelled,
      COUNT(*) FILTER (WHERE NOT (o.status::text = ANY(public.rpt_delivered_statuses()))
                        AND NOT (o.status::text = ANY(public.rpt_returned_statuses()))
                        AND o.status::text NOT IN ('cancelled','fake')) AS c_open
    FROM public.orders o
    WHERE o.brand_id = ANY(_brand_ids)
      AND o.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  )
  SELECT jsonb_build_object(
    'orders_placed', c.placed,
    'open_orders', c.c_open,
    'delivered_orders', a.delivered_orders,
    'returned_orders', c.c_returned,
    'cancelled_orders', c.c_cancelled,
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
    'delivery_rate', CASE WHEN (c.c_delivered + c.c_returned + c.c_cancelled) > 0 THEN round(100.0 * c.c_delivered / (c.c_delivered + c.c_returned + c.c_cancelled), 2) ELSE 0 END,
    'return_rate', CASE WHEN (c.c_delivered + c.c_returned) > 0 THEN round(100.0 * c.c_returned / (c.c_delivered + c.c_returned), 2) ELSE 0 END,
    'cancel_rate', CASE WHEN c.placed > 0 THEN round(100.0 * c.c_cancelled / c.placed, 2) ELSE 0 END,
    'cost_missing_units', a.cost_missing_units
  ) FROM agg a CROSS JOIN cohort c;
$function$;

CREATE OR REPLACE FUNCTION public.rpt_data_health(_brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'delivered'::text)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
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
        AND o.status::text = ANY(public.rpt_delivered_statuses())
        AND o.delivered_at IS NULL
    ),
    'unmatched_recon_rows', (
      SELECT COUNT(*) FROM public.erp_reconciliation_rows r
      WHERE r.match_status IS DISTINCT FROM 'matched'
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.rpt_customer_segments(_brand_ids uuid[], _to date DEFAULT CURRENT_DATE)
 RETURNS TABLE(segment text, customers bigint, orders bigint, revenue numeric, avg_recency_days numeric)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT COALESCE(NULLIF(o.shipping_phone,''), o.guest_phone) AS phone,
           COUNT(*) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())) AS delivered_orders,
           COUNT(*) AS orders,
           SUM(CASE WHEN o.status::text = ANY(public.rpt_delivered_statuses()) THEN COALESCE(o.total,0) ELSE 0 END)::numeric AS revenue,
           MAX((COALESCE(o.delivered_at, o.created_at) AT TIME ZONE 'Asia/Dhaka')::date) AS last_day
    FROM public.orders o
    WHERE o.brand_id = ANY(_brand_ids)
      AND COALESCE(NULLIF(o.shipping_phone,''), o.guest_phone) IS NOT NULL
      AND (o.created_at AT TIME ZONE 'Asia/Dhaka')::date <= _to
    GROUP BY 1
  ),
  seg AS (
    SELECT phone, orders, delivered_orders, revenue,
           (_to - last_day) AS recency,
           CASE
             WHEN (_to - last_day) <= 30 AND delivered_orders >= 3 THEN 'Champions'
             WHEN (_to - last_day) <= 60 AND delivered_orders >= 2 THEN 'Loyal'
             WHEN (_to - last_day) <= 30 AND delivered_orders <= 1 THEN 'New'
             WHEN (_to - last_day) <= 120 THEN 'At risk'
             ELSE 'Lost'
           END AS segment
    FROM base
  )
  SELECT segment, COUNT(*)::bigint, SUM(orders)::bigint, ROUND(SUM(revenue),2), ROUND(AVG(recency)::numeric,1)
  FROM seg GROUP BY segment ORDER BY 4 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.rpt_order_ops_breakdown(_brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'created'::text, _dim text DEFAULT 'courier'::text)
 RETURNS TABLE(label text, placed bigint, confirmed bigint, delivered bigint, returned bigint, cancelled bigint, delivery_rate numeric, return_rate numeric, cancel_rate numeric, delivered_value numeric, aov numeric)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
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
      COUNT(*) FILTER (WHERE status = ANY(public.rpt_delivered_statuses())) AS delivered,
      COUNT(*) FILTER (WHERE status = ANY(public.rpt_returned_statuses())) AS returned,
      COUNT(*) FILTER (WHERE status IN ('cancelled','fake')) AS cancelled,
      COALESCE(SUM(total) FILTER (WHERE status = ANY(public.rpt_delivered_statuses())), 0) AS delivered_value
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

CREATE OR REPLACE FUNCTION public.rpt_order_performance(_brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'created'::text)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
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
      COUNT(*) FILTER (WHERE status::text IN ('shipped','in_transit')
                          OR status::text = ANY(public.rpt_delivered_statuses())
                          OR status::text = ANY(public.rpt_returned_statuses())) AS shipped,
      COUNT(*) FILTER (WHERE status::text = ANY(public.rpt_delivered_statuses())) AS delivered,
      COUNT(*) FILTER (WHERE status::text = ANY(public.rpt_returned_statuses())) AS returned,
      COUNT(*) FILTER (WHERE status::text IN ('cancelled','fake')) AS cancelled,
      COUNT(*) FILTER (WHERE status::text IN ('new','confirmed','packaging','packed','ready_to_ship','ready_to_pack','courier_entry','on_hold','advance_payment_pending','pre_order','incomplete')) AS open_orders,
      COALESCE(SUM(total) FILTER (WHERE status::text = ANY(public.rpt_delivered_statuses())), 0) AS delivered_value,
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