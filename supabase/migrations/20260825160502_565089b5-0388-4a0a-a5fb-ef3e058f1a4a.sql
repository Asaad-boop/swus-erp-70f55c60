
-- ABC analysis ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpt_abc_analysis(_brand_ids uuid[], _from date, _to date)
RETURNS TABLE(product_id uuid, product_name text, sku text, units numeric, net_revenue numeric,
              gross_profit numeric, margin_pct numeric, revenue_share numeric, cum_share numeric, abc_class text)
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  WITH p AS (
    SELECT r.product_id, r.product_name, r.sku, r.units, r.net_revenue, r.gross_profit, r.margin_pct
    FROM public.rpt_product_performance(_brand_ids, _from, _to, 'delivered', 'product') r
    WHERE r.net_revenue > 0
  ),
  tot AS (SELECT NULLIF(SUM(net_revenue),0) AS t FROM p),
  ranked AS (
    SELECT p.*,
           p.net_revenue / (SELECT t FROM tot) * 100 AS share,
           SUM(p.net_revenue) OVER (ORDER BY p.net_revenue DESC ROWS UNBOUNDED PRECEDING) / (SELECT t FROM tot) * 100 AS cum
    FROM p
  )
  SELECT product_id, product_name, sku, ROUND(units,2), ROUND(net_revenue,2), ROUND(gross_profit,2),
         ROUND(COALESCE(margin_pct,0),2), ROUND(share,2), ROUND(cum,2),
         CASE WHEN cum <= 80 THEN 'A' WHEN cum <= 95 THEN 'B' ELSE 'C' END
  FROM ranked ORDER BY net_revenue DESC;
$function$;

-- Customer cohort ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpt_customer_cohort(_brand_ids uuid[], _months integer DEFAULT 6)
RETURNS TABLE(cohort_month text, month_index integer, customers bigint, orders bigint, revenue numeric)
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  WITH o AS (
    SELECT public.crm_normalize_phone(COALESCE(o.shipping_phone, o.guest_phone)) AS phone,
           date_trunc('month', (o.created_at AT TIME ZONE 'Asia/Dhaka'))::date AS m,
           COALESCE(o.total,0)::numeric AS total, o.id
    FROM public.orders o
    WHERE o.brand_id = ANY(_brand_ids)
      AND COALESCE(o.shipping_phone, o.guest_phone) IS NOT NULL
      AND o.status::text NOT IN ('cancelled','fake','incomplete')
      AND (o.created_at AT TIME ZONE 'Asia/Dhaka')::date >= (date_trunc('month', now() AT TIME ZONE 'Asia/Dhaka') - make_interval(months => GREATEST(_months,1) - 1))::date
  ),
  first_m AS (SELECT phone, MIN(m) AS cohort FROM o GROUP BY 1)
  SELECT to_char(f.cohort, 'YYYY-MM'),
         (EXTRACT(YEAR FROM age(o.m, f.cohort)) * 12 + EXTRACT(MONTH FROM age(o.m, f.cohort)))::int,
         COUNT(DISTINCT o.phone)::bigint,
         COUNT(*)::bigint,
         ROUND(SUM(o.total),2)
  FROM o JOIN first_m f ON f.phone = o.phone
  GROUP BY 1,2 ORDER BY 1 DESC, 2;
$function$;

-- Break-even -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpt_breakeven(_brand_ids uuid[], _from date, _to date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  WITH s AS (SELECT public.rpt_sales_summary(_brand_ids, _from, _to, 'delivered') AS j),
  m AS (SELECT public.rpt_marketing_summary(_brand_ids, _from, _to) AS j),
  fixed AS (
    SELECT COALESCE(SUM(t.amount),0)::numeric AS total
    FROM public.erp_transactions t
    LEFT JOIN public.erp_expense_categories c ON c.id = t.category_id
    WHERE t.brand_id = ANY(_brand_ids) AND t.txn_type = 'expense'
      AND t.transaction_date BETWEEN _from AND _to
      AND t.reference_type IS NULL
      AND COALESCE(c.excluded_from_pnl,false) = false
      AND COALESCE(c.is_cogs_category,false) = false
  ),
  v AS (
    SELECT (SELECT (j->>'contribution_profit')::numeric FROM s) AS contribution,
           (SELECT (j->>'delivered_orders')::numeric FROM s) AS delivered_orders,
           (SELECT (j->>'total_revenue')::numeric FROM s) AS revenue,
           (SELECT (j->>'aov')::numeric FROM s) AS aov,
           (SELECT COALESCE((j->>'total_spend')::numeric, 0) FROM m) AS ad_spend,
           (SELECT total FROM fixed) AS fixed_cost
  )
  SELECT jsonb_build_object(
    'fixed_cost', ROUND(v.fixed_cost + v.ad_spend, 2),
    'opex', ROUND(v.fixed_cost, 2),
    'ad_spend', ROUND(v.ad_spend, 2),
    'contribution_profit', ROUND(v.contribution, 2),
    'delivered_orders', v.delivered_orders,
    'contribution_per_order', CASE WHEN COALESCE(v.delivered_orders,0) > 0 THEN ROUND(v.contribution / v.delivered_orders, 2) ELSE 0 END,
    'contribution_margin_pct', CASE WHEN COALESCE(v.revenue,0) > 0 THEN ROUND(v.contribution / v.revenue * 100, 2) ELSE 0 END,
    'breakeven_orders', CASE WHEN COALESCE(v.delivered_orders,0) > 0 AND v.contribution > 0
        THEN CEIL((v.fixed_cost + v.ad_spend) / (v.contribution / v.delivered_orders)) ELSE NULL END,
    'breakeven_revenue', CASE WHEN COALESCE(v.revenue,0) > 0 AND v.contribution > 0
        THEN ROUND((v.fixed_cost + v.ad_spend) / (v.contribution / v.revenue), 2) ELSE NULL END,
    'net_profit', ROUND(v.contribution - v.fixed_cost - v.ad_spend, 2),
    'aov', ROUND(COALESCE(v.aov,0), 2)
  ) FROM v;
$function$;

-- Forecast -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpt_forecast(_brand_ids uuid[], _from date, _to date, _horizon integer DEFAULT 30)
RETURNS TABLE(product_id uuid, product_name text, sku text, stock numeric, daily_run_rate numeric,
              days_of_cover numeric, stockout_date date, forecast_units numeric, forecast_revenue numeric,
              reorder_units numeric, cash_required numeric)
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  SELECT r.product_id, r.product_name, r.sku,
         ROUND(r.stock,2), ROUND(r.daily_run_rate,3), ROUND(r.days_of_cover,1),
         CASE WHEN r.daily_run_rate > 0 THEN (current_date + (r.stock / r.daily_run_rate)::int) ELSE NULL END,
         ROUND(r.daily_run_rate * GREATEST(_horizon,1), 1),
         ROUND(r.daily_run_rate * GREATEST(_horizon,1) * CASE WHEN r.units_sold > 0 THEN r.revenue / r.units_sold ELSE 0 END, 2),
         GREATEST(ROUND(r.daily_run_rate * GREATEST(_horizon,1) - r.stock, 0), 0),
         ROUND(GREATEST(r.daily_run_rate * GREATEST(_horizon,1) - r.stock, 0) * COALESCE(r.unit_cost,0), 2)
  FROM public.rpt_inventory_rows(_brand_ids, _from, _to, 'product') r
  WHERE r.daily_run_rate > 0
  ORDER BY (CASE WHEN r.daily_run_rate > 0 THEN r.stock / r.daily_run_rate ELSE 1e9 END) ASC;
$function$;

REVOKE ALL ON FUNCTION public.rpt_abc_analysis(uuid[], date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpt_customer_cohort(uuid[], integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpt_breakeven(uuid[], date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpt_forecast(uuid[], date, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpt_abc_analysis(uuid[], date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_customer_cohort(uuid[], integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_breakeven(uuid[], date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_forecast(uuid[], date, date, integer) TO authenticated, service_role;
