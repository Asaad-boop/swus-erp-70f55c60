CREATE OR REPLACE FUNCTION public.inv_stock_aging(p_brand_ids uuid[])
RETURNS TABLE(product_id uuid, title text, sku text, brand_id uuid, stock integer, unit_cost numeric, stock_value numeric, last_sold_at timestamptz, days_idle integer, bucket text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH last_sale AS (
    SELECT oi.product_id, max(o.created_at) AS last_sold_at
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.brand_id = ANY(p_brand_ids)
      AND o.status::text NOT IN ('cancelled','fake','incomplete','returned')
      AND coalesce(oi.is_combo_child,false) = false
    GROUP BY oi.product_id
  )
  SELECT p.id, p.title, p.sku, p.brand_id, coalesce(p.stock,0)::int,
    coalesce(nullif(p.weighted_avg_cost,0), p.cost_price, 0),
    coalesce(p.stock,0) * coalesce(nullif(p.weighted_avg_cost,0), p.cost_price, 0),
    ls.last_sold_at,
    (current_date - (coalesce(ls.last_sold_at, p.created_at) AT TIME ZONE 'Asia/Dhaka')::date)::int,
    CASE
      WHEN (current_date - (coalesce(ls.last_sold_at, p.created_at) AT TIME ZONE 'Asia/Dhaka')::date) <= 30 THEN '0-30'
      WHEN (current_date - (coalesce(ls.last_sold_at, p.created_at) AT TIME ZONE 'Asia/Dhaka')::date) <= 60 THEN '31-60'
      WHEN (current_date - (coalesce(ls.last_sold_at, p.created_at) AT TIME ZONE 'Asia/Dhaka')::date) <= 90 THEN '61-90'
      ELSE '90+' END
  FROM products p LEFT JOIN last_sale ls ON ls.product_id = p.id
  WHERE p.brand_id = ANY(p_brand_ids) AND p.is_active = true AND coalesce(p.stock,0) > 0
  ORDER BY 9 DESC;
$$;
REVOKE ALL ON FUNCTION public.inv_stock_aging(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.inv_stock_aging(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supplier_scorecard(p_brand_ids uuid[])
RETURNS TABLE(supplier_id uuid, name text, po_count integer, total_bdt numeric, due_bdt numeric, avg_lead_days numeric, late_count integer, open_count integer, score text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH arr AS (
    SELECT entity_id, min(created_at) AS arrived_at FROM imp_status_history
    WHERE new_status IN ('arrived_bd','partially_received','completed') GROUP BY entity_id
  ), po AS (
    SELECT p.supplier_id, p.grand_total_bdt, p.due_bdt, p.status::text AS st,
      CASE WHEN a.arrived_at IS NOT NULL THEN ((a.arrived_at AT TIME ZONE 'Asia/Dhaka')::date - p.order_date) END AS lead
    FROM imp_purchase_orders p LEFT JOIN arr a ON a.entity_id = p.id
    WHERE p.brand_id = ANY(p_brand_ids) AND p.supplier_id IS NOT NULL AND p.status::text <> 'cancelled'
  ), agg AS (
    SELECT supplier_id, count(*)::int c, sum(coalesce(grand_total_bdt,0)) t, sum(coalesce(due_bdt,0)) d,
      round(avg(lead)::numeric,1) al, count(*) FILTER (WHERE lead > 30)::int lc,
      count(*) FILTER (WHERE st NOT IN ('completed'))::int oc
    FROM po GROUP BY supplier_id
  )
  SELECT s.id, s.name, a.c, a.t, a.d, a.al, a.lc, a.oc,
    CASE WHEN a.al IS NULL THEN '-'
         WHEN a.al <= 20 AND a.lc::numeric / greatest(a.c,1) <= 0.1 THEN 'A'
         WHEN a.al <= 35 AND a.lc::numeric / greatest(a.c,1) <= 0.3 THEN 'B' ELSE 'C' END
  FROM agg a JOIN erp_suppliers s ON s.id = a.supplier_id
  ORDER BY a.t DESC;
$$;
REVOKE ALL ON FUNCTION public.supplier_scorecard(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.supplier_scorecard(uuid[]) TO authenticated, service_role;