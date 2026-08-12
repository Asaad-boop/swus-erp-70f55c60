-- 1. Stock adjustment summary by reason
CREATE OR REPLACE FUNCTION public.rpt_stock_adjustments(
  _brand_ids uuid[], _from date, _to date
) RETURNS TABLE(
  reason text, movements bigint, units_in numeric, units_out numeric, net_units numeric,
  value_in numeric, value_out numeric, net_value numeric
)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT
    COALESCE(NULLIF(sm.reason, ''), 'unspecified') AS reason,
    COUNT(*)::bigint AS movements,
    COALESCE(SUM(sm.delta) FILTER (WHERE sm.delta > 0), 0)::numeric AS units_in,
    COALESCE(SUM(-sm.delta) FILTER (WHERE sm.delta < 0), 0)::numeric AS units_out,
    COALESCE(SUM(sm.delta), 0)::numeric AS net_units,
    ROUND(COALESCE(SUM(sm.delta * COALESCE(sm.unit_cost_bdt, 0)) FILTER (WHERE sm.delta > 0), 0), 2) AS value_in,
    ROUND(COALESCE(SUM(-sm.delta * COALESCE(sm.unit_cost_bdt, 0)) FILTER (WHERE sm.delta < 0), 0), 2) AS value_out,
    ROUND(COALESCE(SUM(sm.delta * COALESCE(sm.unit_cost_bdt, 0)), 0), 2) AS net_value
  FROM public.stock_movements sm
  WHERE sm.brand_id = ANY(_brand_ids)
    AND (sm.created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
  GROUP BY 1
  ORDER BY ABS(COALESCE(SUM(sm.delta * COALESCE(sm.unit_cost_bdt, 0)), 0)) DESC;
$$;

-- 2. Stock adjustment detail rows (manual / non-order movements first)
CREATE OR REPLACE FUNCTION public.rpt_stock_adjustment_rows(
  _brand_ids uuid[], _from date, _to date, _limit int DEFAULT 2000
) RETURNS TABLE(
  id uuid, moved_at timestamptz, day date, reason text, movement_source text,
  product_name text, sku text, variant_label text, warehouse text,
  delta numeric, stock_before numeric, stock_after numeric,
  unit_cost numeric, value numeric, note text, reference_type text, user_email text
)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT
    sm.id,
    sm.created_at AS moved_at,
    (sm.created_at AT TIME ZONE 'Asia/Dhaka')::date AS day,
    COALESCE(NULLIF(sm.reason, ''), 'unspecified') AS reason,
    COALESCE(sm.movement_source, '') AS movement_source,
    COALESCE(p.title, 'Unknown product') AS product_name,
    COALESCE(pv.sku, p.sku, '') AS sku,
    COALESCE(pv.color_name, '') AS variant_label,
    COALESCE(w.name, '') AS warehouse,
    sm.delta::numeric,
    sm.stock_before::numeric,
    sm.stock_after::numeric,
    COALESCE(sm.unit_cost_bdt, 0)::numeric AS unit_cost,
    ROUND(sm.delta * COALESCE(sm.unit_cost_bdt, 0), 2) AS value,
    COALESCE(sm.note, '') AS note,
    COALESCE(sm.reference_type, '') AS reference_type,
    COALESCE(pr.email, '') AS user_email
  FROM public.stock_movements sm
  LEFT JOIN public.products p ON p.id = sm.product_id
  LEFT JOIN public.product_variants pv ON pv.id = sm.variant_id
  LEFT JOIN public.warehouses w ON w.id = sm.warehouse_id
  LEFT JOIN public.profiles pr ON pr.id = sm.user_id
  WHERE sm.brand_id = ANY(_brand_ids)
    AND (sm.created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
  ORDER BY sm.created_at DESC
  LIMIT COALESCE(_limit, 2000);
$$;

-- 3. Stock aging: days since last inbound movement per product
CREATE OR REPLACE FUNCTION public.rpt_stock_aging(
  _brand_ids uuid[]
) RETURNS TABLE(
  product_id uuid, product_name text, sku text, stock numeric, unit_cost numeric,
  stock_value numeric, last_in date, last_sold date, age_days int, bucket text
)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH inb AS (
    SELECT sm.product_id,
           MAX((sm.created_at AT TIME ZONE 'Asia/Dhaka')::date) FILTER (WHERE sm.delta > 0) AS last_in,
           MAX((sm.created_at AT TIME ZONE 'Asia/Dhaka')::date) FILTER (WHERE sm.delta < 0) AS last_sold
    FROM public.stock_movements sm
    WHERE sm.brand_id = ANY(_brand_ids)
    GROUP BY sm.product_id
  ), base AS (
    SELECT p.id AS product_id,
           p.title AS product_name,
           COALESCE(p.sku, '') AS sku,
           COALESCE(p.stock, 0)::numeric AS stock,
           COALESCE(NULLIF(p.weighted_avg_cost, 0), p.cost_price, 0)::numeric AS unit_cost,
           inb.last_in,
           inb.last_sold,
           GREATEST(0, ((now() AT TIME ZONE 'Asia/Dhaka')::date - COALESCE(inb.last_in, (p.created_at AT TIME ZONE 'Asia/Dhaka')::date)))::int AS age_days
    FROM public.products p
    LEFT JOIN inb ON inb.product_id = p.id
    WHERE p.brand_id = ANY(_brand_ids)
      AND COALESCE(p.stock, 0) > 0
  )
  SELECT b.product_id, b.product_name, b.sku, b.stock, b.unit_cost,
         ROUND(b.stock * b.unit_cost, 2) AS stock_value,
         b.last_in, b.last_sold, b.age_days,
         CASE WHEN b.age_days <= 30 THEN '0-30 days'
              WHEN b.age_days <= 60 THEN '31-60 days'
              WHEN b.age_days <= 90 THEN '61-90 days'
              WHEN b.age_days <= 180 THEN '91-180 days'
              ELSE '180+ days' END AS bucket
  FROM base b
  ORDER BY b.age_days DESC, (b.stock * b.unit_cost) DESC;
$$;

-- 4. Stocktake variance by session
CREATE OR REPLACE FUNCTION public.rpt_stocktake_variance(
  _brand_ids uuid[], _from date, _to date
) RETURNS TABLE(
  session_id uuid, name text, status text, warehouse text,
  started_at timestamptz, completed_at timestamptz,
  items_counted bigint, items_with_variance bigint,
  units_over numeric, units_short numeric, net_units numeric,
  variance_value numeric, accuracy_pct numeric
)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT
    s.id AS session_id,
    s.name,
    s.status,
    COALESCE(w.name, '') AS warehouse,
    s.started_at,
    s.completed_at,
    COUNT(i.id) FILTER (WHERE i.counted_qty IS NOT NULL)::bigint AS items_counted,
    COUNT(i.id) FILTER (WHERE COALESCE(i.variance, 0) <> 0)::bigint AS items_with_variance,
    COALESCE(SUM(i.variance) FILTER (WHERE i.variance > 0), 0)::numeric AS units_over,
    COALESCE(SUM(-i.variance) FILTER (WHERE i.variance < 0), 0)::numeric AS units_short,
    COALESCE(SUM(i.variance), 0)::numeric AS net_units,
    ROUND(COALESCE(SUM(COALESCE(i.variance_value, i.variance * i.unit_cost)), 0), 2) AS variance_value,
    CASE WHEN COUNT(i.id) FILTER (WHERE i.counted_qty IS NOT NULL) > 0
      THEN ROUND(100.0 * COUNT(i.id) FILTER (WHERE i.counted_qty IS NOT NULL AND COALESCE(i.variance, 0) = 0)
                 / COUNT(i.id) FILTER (WHERE i.counted_qty IS NOT NULL), 2)
      ELSE 0 END AS accuracy_pct
  FROM public.stocktake_sessions s
  LEFT JOIN public.stocktake_items i ON i.session_id = s.id
  LEFT JOIN public.warehouses w ON w.id = s.warehouse_id
  WHERE s.brand_id = ANY(_brand_ids)
    AND (s.started_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
  GROUP BY s.id, s.name, s.status, w.name, s.started_at, s.completed_at
  ORDER BY s.started_at DESC;
$$;

-- 5. Supplier performance
CREATE OR REPLACE FUNCTION public.rpt_supplier_performance(
  _brand_ids uuid[], _from date, _to date
) RETURNS TABLE(
  supplier_id uuid, supplier text, country text, supplier_type text,
  pos bigint, units numeric, po_value numeric, paid numeric, due numeric,
  avg_lead_days numeric, on_time_pct numeric, completed_pos bigint, cancelled_pos bigint,
  avg_landed_cost numeric, last_order date
)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH imp AS (
    SELECT po.supplier_id,
           1 AS po_cnt,
           COALESCE(po.total_units, 0)::numeric AS units,
           COALESCE(po.grand_total_bdt, 0)::numeric AS total,
           COALESCE(po.paid_bdt, 0)::numeric AS paid,
           COALESCE(po.due_bdt, 0)::numeric AS due,
           COALESCE(po.landed_cost_per_unit_bdt, 0)::numeric AS landed,
           po.order_date::date AS order_date,
           CASE WHEN po.status = 'completed' THEN 1 ELSE 0 END AS completed,
           CASE WHEN po.status = 'cancelled' THEN 1 ELSE 0 END AS cancelled,
           CASE WHEN po.status = 'completed' AND po.updated_at IS NOT NULL
                THEN ((po.updated_at AT TIME ZONE 'Asia/Dhaka')::date - po.order_date::date) END AS lead_days,
           NULL::int AS on_time
    FROM public.imp_purchase_orders po
    WHERE po.brand_id = ANY(_brand_ids)
      AND po.order_date::date BETWEEN _from AND _to
      AND po.supplier_id IS NOT NULL
  ), loc AS (
    SELECT lp.supplier_id,
           1 AS po_cnt,
           COALESCE((SELECT SUM(li.ordered_qty) FROM public.local_po_items li WHERE li.po_id = lp.id), 0)::numeric AS units,
           COALESCE(lp.total, 0)::numeric AS total,
           COALESCE(lp.amount_paid, 0)::numeric AS paid,
           COALESCE(lp.balance_due, 0)::numeric AS due,
           0::numeric AS landed,
           lp.order_date::date AS order_date,
           CASE WHEN lp.received_date IS NOT NULL THEN 1 ELSE 0 END AS completed,
           CASE WHEN lp.status = 'cancelled' THEN 1 ELSE 0 END AS cancelled,
           CASE WHEN lp.received_date IS NOT NULL THEN (lp.received_date::date - lp.order_date::date) END AS lead_days,
           CASE WHEN lp.received_date IS NOT NULL AND lp.expected_date IS NOT NULL
                THEN CASE WHEN lp.received_date::date <= lp.expected_date::date THEN 1 ELSE 0 END END AS on_time
    FROM public.local_purchase_orders lp
    WHERE lp.brand_id = ANY(_brand_ids)
      AND lp.order_date::date BETWEEN _from AND _to
  ), all_po AS (
    SELECT * FROM imp UNION ALL SELECT * FROM loc
  )
  SELECT
    s.id AS supplier_id,
    s.name AS supplier,
    COALESCE(s.country, '') AS country,
    COALESCE(s.supplier_type, '') AS supplier_type,
    COUNT(*)::bigint AS pos,
    COALESCE(SUM(a.units), 0) AS units,
    ROUND(COALESCE(SUM(a.total), 0), 2) AS po_value,
    ROUND(COALESCE(SUM(a.paid), 0), 2) AS paid,
    ROUND(COALESCE(SUM(a.due), 0), 2) AS due,
    ROUND(COALESCE(AVG(a.lead_days), 0), 1) AS avg_lead_days,
    CASE WHEN COUNT(a.on_time) > 0 THEN ROUND(100.0 * SUM(a.on_time) / COUNT(a.on_time), 2) ELSE NULL END AS on_time_pct,
    COALESCE(SUM(a.completed), 0)::bigint AS completed_pos,
    COALESCE(SUM(a.cancelled), 0)::bigint AS cancelled_pos,
    ROUND(COALESCE(AVG(NULLIF(a.landed, 0)), 0), 2) AS avg_landed_cost,
    MAX(a.order_date) AS last_order
  FROM all_po a
  JOIN public.erp_suppliers s ON s.id = a.supplier_id
  GROUP BY s.id, s.name, s.country, s.supplier_type
  ORDER BY 7 DESC;
$$;

-- 6. Cargo agent ledger rollup
CREATE OR REPLACE FUNCTION public.rpt_cargo_ledger(
  _brand_ids uuid[], _from date, _to date
) RETURNS TABLE(
  agent_id uuid, agent text, entries bigint,
  deposits numeric, charges numeric, net numeric, balance numeric, last_entry date
)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH rng AS (
    SELECT l.cargo_agent_id,
           COUNT(*)::bigint AS entries,
           COALESCE(SUM(l.credit_bdt), 0)::numeric AS deposits,
           COALESCE(SUM(l.debit_bdt), 0)::numeric AS charges,
           MAX(l.entry_date::date) AS last_entry
    FROM public.imp_cargo_ledger l
    WHERE l.brand_id = ANY(_brand_ids)
      AND l.entry_date::date BETWEEN _from AND _to
    GROUP BY l.cargo_agent_id
  ), bal AS (
    SELECT l.cargo_agent_id,
           COALESCE(SUM(l.credit_bdt - l.debit_bdt), 0)::numeric AS balance
    FROM public.imp_cargo_ledger l
    WHERE l.brand_id = ANY(_brand_ids)
      AND l.entry_date::date <= _to
    GROUP BY l.cargo_agent_id
  )
  SELECT
    a.id AS agent_id,
    a.name AS agent,
    COALESCE(r.entries, 0)::bigint,
    ROUND(COALESCE(r.deposits, 0), 2),
    ROUND(COALESCE(r.charges, 0), 2),
    ROUND(COALESCE(r.deposits, 0) - COALESCE(r.charges, 0), 2) AS net,
    ROUND(COALESCE(b.balance, 0), 2) AS balance,
    r.last_entry
  FROM public.imp_cargo_agents a
  LEFT JOIN rng r ON r.cargo_agent_id = a.id
  LEFT JOIN bal b ON b.cargo_agent_id = a.id
  WHERE (a.brand_id IS NULL OR a.brand_id = ANY(_brand_ids))
    AND (COALESCE(r.entries, 0) > 0 OR COALESCE(b.balance, 0) <> 0)
  ORDER BY ABS(COALESCE(b.balance, 0)) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.rpt_stock_adjustments(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_stock_adjustment_rows(uuid[], date, date, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_stock_aging(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_stocktake_variance(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_supplier_performance(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_cargo_ledger(uuid[], date, date) TO authenticated;