CREATE OR REPLACE FUNCTION public.mkt_meta_spend_summary(_brand_ids uuid[], _from date, _to date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH r AS (SELECT public.mkt_usd_bdt_rate(_brand_ids) AS fx),
i AS (
  SELECT i.*, COALESCE(a.currency,'USD') AS ccy
  FROM public.mkt_insights_daily i
  LEFT JOIN public.mkt_ad_accounts a ON a.id = i.account_id
  WHERE i.brand_id = ANY(_brand_ids) AND i.date >= _from AND i.date <= _to
),
agg AS (
  SELECT
    COALESCE(SUM(CASE WHEN ccy = 'BDT' THEN 0 ELSE COALESCE(spend,0) END),0) AS usd_spend,
    COALESCE(SUM(COALESCE(spend_bdt_fifo,0)),0) AS bdt_wallet,
    COALESCE(SUM(CASE WHEN COALESCE(spend_bdt_fifo,0) > 0 THEN 0
                      WHEN ccy = 'BDT' THEN COALESCE(spend,0)
                      ELSE COALESCE(spend,0) * (SELECT fx FROM r) END),0) AS bdt_converted,
    COALESCE(SUM(CASE WHEN COALESCE(spend_bdt_fifo,0) > 0 AND estimated_bdt_cost THEN spend_bdt_fifo ELSE 0 END),0) AS bdt_estimated_wallet,
    COALESCE(SUM(CASE WHEN COALESCE(spend_bdt_fifo,0) > 0 THEN 0 WHEN ccy='BDT' THEN 0 ELSE COALESCE(spend,0) END),0) AS usd_unconverted,
    MAX(date) AS data_through,
    MIN(date) AS data_from,
    MAX(updated_at) AS last_insight_at,
    COUNT(*) AS rows_count
  FROM i
),
sync AS (
  SELECT MAX(finished_at) FILTER (WHERE kind::text = 'insights' AND status::text = 'success') AS last_insights_sync,
         MAX(finished_at) FILTER (WHERE status::text = 'success') AS last_any_sync
  FROM public.mkt_sync_log
  WHERE brand_id = ANY(_brand_ids)
)
SELECT jsonb_build_object(
  'usd_spend', round(agg.usd_spend,2),
  'bdt_spend', round(agg.bdt_wallet + agg.bdt_converted,2),
  'bdt_from_wallet', round(agg.bdt_wallet,2),
  'bdt_from_fx', round(agg.bdt_converted,2),
  'bdt_estimated', round(agg.bdt_estimated_wallet + agg.bdt_converted,2),
  'usd_unconverted', round(agg.usd_unconverted,2),
  'fx_rate', round((SELECT fx FROM r),4),
  'effective_rate', CASE WHEN agg.usd_spend > 0
    THEN round((agg.bdt_wallet + agg.bdt_converted) / agg.usd_spend, 2) ELSE NULL END,
  'wallet_coverage_pct', CASE WHEN (agg.bdt_wallet + agg.bdt_converted) > 0
    THEN round(100.0 * agg.bdt_wallet / (agg.bdt_wallet + agg.bdt_converted),1) ELSE NULL END,
  'rows', agg.rows_count,
  'data_from', agg.data_from,
  'data_through', agg.data_through,
  'last_insight_at', agg.last_insight_at,
  'last_sync_at', COALESCE(sync.last_insights_sync, sync.last_any_sync)
) FROM agg, sync;
$function$;