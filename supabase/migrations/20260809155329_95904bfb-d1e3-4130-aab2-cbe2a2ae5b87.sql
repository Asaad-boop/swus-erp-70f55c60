CREATE OR REPLACE FUNCTION public.rpt_pnl_v2(_brand_ids uuid[], _from date, _to date)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH s AS (
    SELECT public.rpt_sales_summary(_brand_ids, _from, _to, 'delivered') AS j
  ),
  m AS (
    SELECT public.rpt_marketing_summary(_brand_ids, _from, _to) AS j
  ),
  opex AS (
    SELECT COALESCE(c.name, 'Uncategorized') AS name, SUM(t.amount)::numeric AS total
    FROM public.erp_transactions t
    LEFT JOIN public.erp_expense_categories c ON c.id = t.category_id
    WHERE t.brand_id = ANY(_brand_ids)
      AND t.txn_type = 'expense'
      AND t.transaction_date BETWEEN _from AND _to
      AND t.reference_type IS NULL
      AND COALESCE(c.excluded_from_pnl, false) = false
      AND COALESCE(c.is_cogs_category, false) = false
    GROUP BY 1
  ),
  other_income AS (
    SELECT COALESCE(SUM(t.amount), 0)::numeric AS total
    FROM public.erp_transactions t
    LEFT JOIN public.erp_expense_categories c ON c.id = t.category_id
    WHERE t.brand_id = ANY(_brand_ids)
      AND t.txn_type = 'income'
      AND t.transaction_date BETWEEN _from AND _to
      AND t.reference_type IS NULL
      AND COALESCE(c.excluded_from_pnl, false) = false
  ),
  v AS (
    SELECT
      (SELECT (j->>'net_revenue')::numeric FROM s)          AS net_revenue,
      (SELECT (j->>'gross_sales')::numeric FROM s)          AS gross_sales,
      (SELECT (j->>'discounts')::numeric FROM s)            AS discounts,
      (SELECT (j->>'cogs')::numeric FROM s)                 AS cogs,
      (SELECT (j->>'courier_cost')::numeric FROM s)         AS courier_cost,
      (SELECT (j->>'packaging_cost')::numeric FROM s)       AS packaging_cost,
      (SELECT (j->>'refunds')::numeric FROM s)              AS refunds,
      (SELECT (j->>'return_courier_cost')::numeric FROM s)  AS return_courier_cost,
      (SELECT (j->>'delivered_orders')::numeric FROM s)     AS delivered_orders,
      (SELECT (j->>'units_sold')::numeric FROM s)           AS units_sold,
      (SELECT (j->>'cost_missing_units')::numeric FROM s)   AS cost_missing_units,
      COALESCE((SELECT (j->>'total_spend')::numeric FROM m), 0) AS ad_spend,
      COALESCE((SELECT SUM(total) FROM opex), 0)            AS opex_total,
      (SELECT total FROM other_income)                      AS other_income
  )
  SELECT jsonb_build_object(
    'gross_sales', round(v.gross_sales, 2),
    'discounts', round(v.discounts, 2),
    'net_revenue', round(v.net_revenue, 2),
    'cogs', round(v.cogs, 2),
    'gross_profit', round(v.net_revenue - v.cogs, 2),
    'gross_margin_pct', CASE WHEN v.net_revenue > 0 THEN round(100.0 * (v.net_revenue - v.cogs) / v.net_revenue, 2) ELSE 0 END,
    'courier_cost', round(v.courier_cost, 2),
    'packaging_cost', round(v.packaging_cost, 2),
    'return_loss', round(v.refunds + v.return_courier_cost, 2),
    'refunds', round(v.refunds, 2),
    'return_courier_cost', round(v.return_courier_cost, 2),
    'contribution_profit', round(v.net_revenue - v.cogs - v.courier_cost - v.packaging_cost - v.refunds - v.return_courier_cost, 2),
    'ad_spend', round(v.ad_spend, 2),
    'opex_total', round(v.opex_total, 2),
    'opex_by_category', COALESCE((SELECT jsonb_object_agg(name, round(total, 2)) FROM opex), '{}'::jsonb),
    'other_income', round(v.other_income, 2),
    'net_profit', round(v.net_revenue - v.cogs - v.courier_cost - v.packaging_cost - v.refunds - v.return_courier_cost - v.ad_spend - v.opex_total + v.other_income, 2),
    'net_margin_pct', CASE WHEN v.net_revenue > 0 THEN round(100.0 * (v.net_revenue - v.cogs - v.courier_cost - v.packaging_cost - v.refunds - v.return_courier_cost - v.ad_spend - v.opex_total + v.other_income) / v.net_revenue, 2) ELSE 0 END,
    'delivered_orders', v.delivered_orders,
    'units_sold', v.units_sold,
    'cost_missing_units', v.cost_missing_units
  ) FROM v;
$function$;

REVOKE ALL ON FUNCTION public.rpt_pnl_v2(uuid[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpt_pnl_v2(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_pnl_v2(uuid[], date, date) TO service_role;