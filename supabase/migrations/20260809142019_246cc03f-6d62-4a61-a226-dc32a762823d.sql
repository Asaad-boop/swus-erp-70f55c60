
-- =========================
-- Phase 3: Customers
-- =========================

CREATE OR REPLACE FUNCTION public.rpt_customer_summary(
  _brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'delivered'
) RETURNS json
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH lines AS (
    SELECT * FROM public.rpt_lines(_brand_ids, _from, _to, _basis)
    WHERE customer_phone IS NOT NULL AND customer_phone <> ''
  ),
  ord AS (
    SELECT order_id, customer_phone,
           MAX(day) AS day,
           bool_or(is_delivered) AS is_delivered,
           SUM(CASE WHEN is_delivered THEN net_revenue ELSE 0 END) AS revenue,
           SUM(CASE WHEN is_delivered THEN net_revenue - line_cogs - courier_cost - packaging_cost - refund_alloc ELSE 0 END) AS profit
    FROM lines GROUP BY order_id, customer_phone
  ),
  cust AS (
    SELECT customer_phone,
           COUNT(*) AS orders,
           COUNT(*) FILTER (WHERE is_delivered) AS delivered_orders,
           SUM(revenue) AS revenue,
           SUM(profit) AS profit
    FROM ord GROUP BY customer_phone
  ),
  firsts AS (
    SELECT COALESCE(NULLIF(o.shipping_phone,''), o.guest_phone) AS phone,
           MIN((o.created_at AT TIME ZONE 'Asia/Dhaka')::date) AS first_day
    FROM public.orders o
    WHERE o.brand_id = ANY(_brand_ids)
      AND COALESCE(NULLIF(o.shipping_phone,''), o.guest_phone) IS NOT NULL
    GROUP BY 1
  )
  SELECT json_build_object(
    'customers', COALESCE((SELECT COUNT(*) FROM cust),0),
    'new_customers', COALESCE((SELECT COUNT(*) FROM cust c JOIN firsts f ON f.phone = c.customer_phone WHERE f.first_day >= _from AND f.first_day <= _to),0),
    'returning_customers', COALESCE((SELECT COUNT(*) FROM cust c JOIN firsts f ON f.phone = c.customer_phone WHERE f.first_day < _from),0),
    'repeat_customers', COALESCE((SELECT COUNT(*) FROM cust WHERE orders > 1),0),
    'repeat_rate', COALESCE((SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE orders > 1) / NULLIF(COUNT(*),0), 2) FROM cust),0),
    'orders_per_customer', COALESCE((SELECT ROUND(AVG(orders)::numeric, 2) FROM cust),0),
    'avg_ltv', COALESCE((SELECT ROUND(AVG(revenue)::numeric, 2) FROM cust),0),
    'avg_profit_per_customer', COALESCE((SELECT ROUND(AVG(profit)::numeric, 2) FROM cust),0),
    'total_revenue', COALESCE((SELECT SUM(revenue) FROM cust),0),
    'total_profit', COALESCE((SELECT SUM(profit) FROM cust),0),
    'orders', COALESCE((SELECT COUNT(*) FROM ord),0)
  );
$$;

CREATE OR REPLACE FUNCTION public.rpt_customer_top(
  _brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'delivered', _limit int DEFAULT 200
) RETURNS TABLE(
  customer_phone text, customer_name text, orders bigint, delivered_orders bigint,
  returned_orders bigint, units numeric, net_revenue numeric, gross_profit numeric,
  contribution_profit numeric, aov numeric, first_order date, last_order date,
  return_rate numeric, is_new boolean
)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH lines AS (
    SELECT * FROM public.rpt_lines(_brand_ids, _from, _to, _basis)
    WHERE customer_phone IS NOT NULL AND customer_phone <> ''
  ),
  ord AS (
    SELECT order_id, customer_phone, MAX(day) AS day,
           bool_or(is_delivered) AS is_delivered,
           bool_or(is_returned) AS is_returned,
           SUM(CASE WHEN is_delivered THEN quantity ELSE 0 END) AS units,
           SUM(CASE WHEN is_delivered THEN net_revenue ELSE 0 END) AS revenue,
           SUM(CASE WHEN is_delivered THEN net_revenue - line_cogs ELSE 0 END) AS gross_profit,
           SUM(CASE WHEN is_delivered THEN net_revenue - line_cogs - courier_cost - packaging_cost - refund_alloc ELSE 0 END) AS contribution
    FROM lines GROUP BY order_id, customer_phone
  ),
  names AS (
    SELECT COALESCE(NULLIF(o.shipping_phone,''), o.guest_phone) AS phone,
           MIN((o.created_at AT TIME ZONE 'Asia/Dhaka')::date) AS first_day,
           (array_agg(COALESCE(NULLIF(o.shipping_name,''), o.guest_name) ORDER BY o.created_at DESC))[1] AS name
    FROM public.orders o
    WHERE o.brand_id = ANY(_brand_ids)
      AND COALESCE(NULLIF(o.shipping_phone,''), o.guest_phone) IS NOT NULL
    GROUP BY 1
  )
  SELECT
    c.customer_phone,
    n.name AS customer_name,
    COUNT(*)::bigint AS orders,
    COUNT(*) FILTER (WHERE c.is_delivered)::bigint AS delivered_orders,
    COUNT(*) FILTER (WHERE c.is_returned)::bigint AS returned_orders,
    COALESCE(SUM(c.units),0)::numeric AS units,
    ROUND(COALESCE(SUM(c.revenue),0)::numeric, 2) AS net_revenue,
    ROUND(COALESCE(SUM(c.gross_profit),0)::numeric, 2) AS gross_profit,
    ROUND(COALESCE(SUM(c.contribution),0)::numeric, 2) AS contribution_profit,
    ROUND(COALESCE(SUM(c.revenue),0)::numeric / NULLIF(COUNT(*) FILTER (WHERE c.is_delivered),0), 2) AS aov,
    n.first_day AS first_order,
    MAX(c.day) AS last_order,
    ROUND(100.0 * COUNT(*) FILTER (WHERE c.is_returned) / NULLIF(COUNT(*),0), 2) AS return_rate,
    (n.first_day >= _from) AS is_new
  FROM ord c
  LEFT JOIN names n ON n.phone = c.customer_phone
  GROUP BY c.customer_phone, n.name, n.first_day
  ORDER BY 7 DESC
  LIMIT GREATEST(_limit, 1);
$$;

CREATE OR REPLACE FUNCTION public.rpt_customer_segments(
  _brand_ids uuid[], _to date DEFAULT CURRENT_DATE
) RETURNS TABLE(segment text, customers bigint, orders bigint, revenue numeric, avg_recency_days numeric)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH base AS (
    SELECT COALESCE(NULLIF(o.shipping_phone,''), o.guest_phone) AS phone,
           COUNT(*) FILTER (WHERE o.status::text IN ('delivered','completed','partial_delivered')) AS delivered_orders,
           COUNT(*) AS orders,
           SUM(CASE WHEN o.status::text IN ('delivered','completed','partial_delivered') THEN COALESCE(o.total,0) ELSE 0 END)::numeric AS revenue,
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
$$;

-- =========================
-- Phase 3: Inventory
-- =========================

CREATE OR REPLACE FUNCTION public.rpt_inventory_rows(
  _brand_ids uuid[], _from date, _to date, _level text DEFAULT 'product'
) RETURNS TABLE(
  product_id uuid, variant_id uuid, product_name text, variant_label text, sku text,
  stock numeric, reserved numeric, available numeric, unit_cost numeric, stock_value numeric,
  units_sold numeric, revenue numeric, daily_run_rate numeric, days_of_cover numeric,
  sell_through numeric, last_sold date, is_dead boolean, is_low boolean
)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH days AS (SELECT GREATEST((_to - _from) + 1, 1)::numeric AS n),
  sold AS (
    SELECT l.product_id, l.variant_id,
           SUM(CASE WHEN l.is_delivered THEN l.quantity ELSE 0 END)::numeric AS units_sold,
           SUM(CASE WHEN l.is_delivered THEN l.net_revenue ELSE 0 END)::numeric AS revenue,
           MAX(CASE WHEN l.is_delivered THEN l.day END) AS last_sold
    FROM public.rpt_lines(_brand_ids, _from, _to, 'created') l
    GROUP BY 1,2
  ),
  stockrows AS (
    SELECT
      p.id AS product_id,
      CASE WHEN _level = 'variant' THEN pv.id ELSE NULL END AS variant_id,
      p.title AS product_name,
      CASE WHEN _level = 'variant' THEN NULLIF(pv.sku, '') ELSE NULL END AS variant_label,
      CASE WHEN _level = 'variant' THEN COALESCE(pv.sku, p.sku) ELSE p.sku END AS sku,
      CASE WHEN _level = 'variant' THEN COALESCE(pv.stock,0) ELSE COALESCE(p.stock,0) END::numeric AS stock,
      CASE WHEN _level = 'variant' THEN COALESCE(pv.reserved_stock,0) ELSE COALESCE(p.reserved_stock,0) END::numeric AS reserved,
      CASE WHEN _level = 'variant' THEN COALESCE(pv.available_stock, pv.stock, 0) ELSE COALESCE(p.available_stock, p.stock, 0) END::numeric AS available,
      COALESCE(NULLIF(CASE WHEN _level='variant' THEN pv.weighted_avg_cost ELSE NULL END,0), NULLIF(p.weighted_avg_cost,0), NULLIF(p.cost_price,0), 0)::numeric AS unit_cost,
      COALESCE(NULLIF(CASE WHEN _level='variant' THEN pv.reorder_point ELSE NULL END,0), NULLIF(p.reorder_point,0), NULLIF(p.low_stock_threshold,0), 0)::numeric AS reorder_point
    FROM public.products p
    LEFT JOIN public.product_variants pv
      ON _level = 'variant' AND pv.product_id = p.id AND COALESCE(pv.is_active, true)
    WHERE p.brand_id = ANY(_brand_ids) AND COALESCE(p.is_active, true)
      AND (_level <> 'variant' OR pv.id IS NOT NULL
           OR NOT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id AND COALESCE(v.is_active,true)))
  ),
  joined AS (
    SELECT sr.*,
           COALESCE(SUM(s.units_sold),0)::numeric AS units_sold,
           COALESCE(SUM(s.revenue),0)::numeric AS revenue,
           MAX(s.last_sold) AS last_sold
    FROM stockrows sr
    LEFT JOIN sold s
      ON s.product_id = sr.product_id
     AND (sr.variant_id IS NULL OR s.variant_id = sr.variant_id)
    GROUP BY sr.product_id, sr.variant_id, sr.product_name, sr.variant_label, sr.sku,
             sr.stock, sr.reserved, sr.available, sr.unit_cost, sr.reorder_point
  )
  SELECT
    j.product_id, j.variant_id, j.product_name, j.variant_label, j.sku,
    j.stock, j.reserved, j.available, ROUND(j.unit_cost,2) AS unit_cost,
    ROUND(j.stock * j.unit_cost, 2) AS stock_value,
    j.units_sold,
    ROUND(j.revenue, 2) AS revenue,
    ROUND(j.units_sold / (SELECT n FROM days), 3) AS daily_run_rate,
    CASE WHEN j.units_sold > 0 THEN ROUND(j.available / (j.units_sold / (SELECT n FROM days)), 1) ELSE NULL END AS days_of_cover,
    CASE WHEN (j.units_sold + j.stock) > 0 THEN ROUND(100.0 * j.units_sold / (j.units_sold + j.stock), 2) ELSE 0 END AS sell_through,
    j.last_sold,
    (j.units_sold = 0 AND j.stock > 0) AS is_dead,
    (j.stock <= j.reorder_point AND j.reorder_point > 0) AS is_low
  FROM joined j
  ORDER BY (j.stock * j.unit_cost) DESC;
$$;

CREATE OR REPLACE FUNCTION public.rpt_inventory_summary(
  _brand_ids uuid[], _from date, _to date
) RETURNS json
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH r AS (SELECT * FROM public.rpt_inventory_rows(_brand_ids, _from, _to, 'product'))
  SELECT json_build_object(
    'skus', COALESCE((SELECT COUNT(*) FROM r),0),
    'units_on_hand', COALESCE((SELECT SUM(stock) FROM r),0),
    'stock_value', COALESCE((SELECT ROUND(SUM(stock_value),2) FROM r),0),
    'out_of_stock', COALESCE((SELECT COUNT(*) FROM r WHERE stock <= 0),0),
    'low_stock', COALESCE((SELECT COUNT(*) FROM r WHERE is_low AND stock > 0),0),
    'dead_skus', COALESCE((SELECT COUNT(*) FROM r WHERE is_dead),0),
    'dead_value', COALESCE((SELECT ROUND(SUM(stock_value),2) FROM r WHERE is_dead),0),
    'units_sold', COALESCE((SELECT SUM(units_sold) FROM r),0),
    'sell_through', COALESCE((SELECT ROUND(100.0 * SUM(units_sold) / NULLIF(SUM(units_sold) + SUM(stock),0),2) FROM r),0),
    'no_cost_skus', COALESCE((SELECT COUNT(*) FROM r WHERE unit_cost = 0 AND stock > 0),0)
  );
$$;

GRANT EXECUTE ON FUNCTION public.rpt_customer_summary(uuid[], date, date, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpt_customer_top(uuid[], date, date, text, int) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpt_customer_segments(uuid[], date) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpt_inventory_rows(uuid[], date, date, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpt_inventory_summary(uuid[], date, date) TO PUBLIC;
