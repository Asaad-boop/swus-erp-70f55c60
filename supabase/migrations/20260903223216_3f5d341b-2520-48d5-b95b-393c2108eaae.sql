-- Effective USD→BDT rate for a set of brands (ad-account rate first, then FX table)
CREATE OR REPLACE FUNCTION public.mkt_usd_bdt_rate(_brand_ids uuid[])
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT NULLIF(a.usd_to_bdt_rate,0)::numeric FROM public.mkt_ad_accounts a
      WHERE a.brand_id = ANY(_brand_ids) AND COALESCE(a.usd_to_bdt_rate,0) > 0
      ORDER BY a.updated_at DESC NULLS LAST LIMIT 1),
    (SELECT NULLIF(a.usd_to_bdt_rate,0)::numeric FROM public.mkt_ad_accounts a
      WHERE COALESCE(a.usd_to_bdt_rate,0) > 0 ORDER BY a.updated_at DESC NULLS LAST LIMIT 1),
    (SELECT f.rate::numeric FROM public.erp_fx_rates f
      WHERE f.from_ccy = 'USD' AND f.to_ccy = 'BDT' ORDER BY f.rate_date DESC LIMIT 1),
    0
  );
$$;
GRANT EXECUTE ON FUNCTION public.mkt_usd_bdt_rate(uuid[]) TO authenticated, service_role;

-- Meta spend summary: USD spent, BDT charged, rate applied, coverage, last sync
CREATE OR REPLACE FUNCTION public.mkt_meta_spend_summary(_brand_ids uuid[], _from date, _to date)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
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
  'last_insight_at', agg.last_insight_at,
  'last_sync_at', COALESCE(sync.last_insights_sync, sync.last_any_sync)
) FROM agg, sync;
$$;
GRANT EXECUTE ON FUNCTION public.mkt_meta_spend_summary(uuid[], date, date) TO authenticated, service_role;

-- Campaign truth: stop treating unconverted USD as BDT
CREATE OR REPLACE FUNCTION public.mkt_campaign_truth(_brand_ids uuid[], _from date, _to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH fx AS (SELECT public.mkt_usd_bdt_rate(_brand_ids) AS r),
ins AS (
  SELECT i.campaign_id AS cid,
    SUM(CASE WHEN COALESCE(i.spend_bdt_fifo,0) > 0 THEN i.spend_bdt_fifo
             WHEN COALESCE(a.currency,'USD') = 'BDT' THEN COALESCE(i.spend,0)
             ELSE COALESCE(i.spend,0) * (SELECT r FROM fx) END) AS spend,
    SUM(COALESCE(i.clicks,0)) AS clicks,
    SUM(COALESCE(i.meta_purchases,0)) AS meta_purchases,
    SUM(COALESCE(i.meta_purchase_value,0)) AS meta_purchase_value
  FROM public.mkt_insights_daily i
  LEFT JOIN public.mkt_ad_accounts a ON a.id = i.account_id
  WHERE i.brand_id = ANY(_brand_ids) AND i.date >= _from AND i.date <= _to
  GROUP BY 1
), pc AS (
  SELECT * FROM public.mkt_order_primary_campaign(_brand_ids, _from, _to)
), ord2 AS (
  SELECT o.id, o.status::text AS status, o.confirmation_status::text AS confirmation_status,
         COALESCE(o.total,0)::numeric AS total,
         pc.campaign_id AS cid, pc.source AS attr_source, pc.priority AS attr_priority,
         pc.confidence AS attr_conf
  FROM public.orders o
  JOIN pc ON pc.order_id = o.id
  WHERE o.brand_id = ANY(_brand_ids)
), att AS (
  SELECT cid,
    COUNT(*) AS orders,
    COUNT(*) AS attributed_orders,
    COUNT(*) FILTER (WHERE attr_priority <= 2) AS explicit_attributed_orders,
    COUNT(*) FILTER (WHERE attr_priority > 2) AS auto_attributed_orders,
    0 AS unlinked_orders,
    AVG(COALESCE(attr_conf,0)) AS attr_confidence,
    COUNT(*) FILTER (WHERE confirmation_status = 'confirmed'
                        OR status NOT IN ('new','incomplete','cancelled','fake','on_hold','advance_payment_pending')) AS confirmed_orders,
    COUNT(*) FILTER (WHERE status = ANY(public.rpt_delivered_statuses())) AS delivered_orders,
    COUNT(*) FILTER (WHERE status IN ('returned','paid_return','unpaid_return','partial_return','pending_return','return_in_transit')) AS returned_orders,
    COUNT(*) FILTER (WHERE status IN ('cancelled','fake')) AS cancelled_orders,
    COUNT(*) FILTER (WHERE status NOT IN ('cancelled','fake','returned','paid_return','unpaid_return','partial_return','pending_return','return_in_transit')
      AND NOT (status = ANY(public.rpt_delivered_statuses()))) AS in_progress_orders,
    COALESCE(SUM(total) FILTER (WHERE status = ANY(public.rpt_delivered_statuses())),0) AS delivered_revenue,
    COALESCE(SUM(total),0) AS booked_revenue,
    MODE() WITHIN GROUP (ORDER BY attr_source) AS primary_source
  FROM ord2 WHERE cid IS NOT NULL GROUP BY 1
), cash AS (
  SELECT (e->>'campaign_id')::uuid AS cid, e AS c
  FROM jsonb_array_elements(public.mkt_campaign_cash(_brand_ids, _from, _to)) e
), j AS (
  SELECT c.id, COALESCE(c.name,'(unnamed)') AS name, COALESCE(c.effective_status, c.status, '—') AS status,
    c.external_id,
    COALESCE(i.spend,0) AS spend, COALESCE(i.clicks,0) AS clicks,
    COALESCE(i.meta_purchases,0) AS meta_purchases,
    COALESCE(i.meta_purchase_value,0) AS meta_purchase_value,
    COALESCE(t.orders,0) AS orders,
    COALESCE(t.attributed_orders,0) AS attributed_orders,
    COALESCE(t.explicit_attributed_orders,0) AS explicit_attributed_orders,
    COALESCE(t.auto_attributed_orders,0) AS auto_attributed_orders,
    COALESCE(t.unlinked_orders,0) AS unlinked_orders,
    t.attr_confidence,
    COALESCE(t.confirmed_orders,0) AS confirmed_orders,
    COALESCE(t.delivered_orders,0) AS delivered_orders,
    COALESCE(t.returned_orders,0) AS returned_orders,
    COALESCE(t.cancelled_orders,0) AS cancelled_orders,
    COALESCE(t.in_progress_orders,0) AS in_progress_orders,
    COALESCE(t.delivered_revenue,0) AS delivered_revenue,
    COALESCE(t.booked_revenue,0) AS booked_revenue,
    t.primary_source,
    ch.c AS cash
  FROM public.mkt_campaigns c
  LEFT JOIN ins i ON i.cid = c.id
  LEFT JOIN att t ON t.cid = c.id
  LEFT JOIN cash ch ON ch.cid = c.id
  WHERE (COALESCE(i.spend,0) > 0 OR COALESCE(t.orders,0) > 0)
    AND (
      c.brand_id = ANY(_brand_ids)
      OR i.cid IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.mkt_ad_accounts a
                  WHERE a.id = c.account_id AND a.brand_id = ANY(_brand_ids))
      OR EXISTS (SELECT 1 FROM public.mkt_ad_account_brands ab
                  WHERE ab.ad_account_id = c.account_id AND ab.brand_id = ANY(_brand_ids))
    )
)
SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'spend')::numeric DESC), '[]'::jsonb)
FROM (
  SELECT jsonb_build_object(
    'id', id, 'name', name, 'status', status, 'external_id', external_id,
    'spend', round(spend,2), 'clicks', clicks,
    'meta_purchases', meta_purchases,
    'meta_purchase_value', round(meta_purchase_value,2),
    'meta_roas', CASE WHEN spend > 0 THEN round(meta_purchase_value/spend,2) ELSE 0 END,
    'orders', orders,
    'attributed_orders', attributed_orders,
    'explicit_attributed_orders', explicit_attributed_orders,
    'auto_attributed_orders', auto_attributed_orders,
    'unlinked_orders', unlinked_orders,
    'attribution_source', primary_source,
    'attribution_confidence', CASE WHEN attr_confidence IS NULL THEN NULL ELSE round(100.0*attr_confidence,1) END,
    'attribution_coverage', CASE WHEN orders > 0 THEN round(100.0*attributed_orders/orders,1) ELSE NULL END,
    'match_status', CASE
      WHEN orders = 0 AND spend > 0 THEN 'no_orders'
      WHEN explicit_attributed_orders = orders AND orders > 0 THEN 'linked'
      WHEN explicit_attributed_orders = 0 THEN 'utm_only'
      ELSE 'partial' END,
    'confirmed_orders', confirmed_orders,
    'delivered_orders', delivered_orders, 'returned_orders', returned_orders,
    'cancelled_orders', cancelled_orders, 'in_progress_orders', in_progress_orders,
    'delivered_revenue', round(delivered_revenue,2),
    'booked_revenue', round(booked_revenue,2),
    'actual_roas', CASE WHEN spend > 0 THEN round(delivered_revenue/spend,2) ELSE 0 END,
    'booked_roas', CASE WHEN spend > 0 THEN round(booked_revenue/spend,2) ELSE 0 END,
    'purchase_gap', orders - meta_purchases,
    'delivery_rate', CASE WHEN orders > 0 THEN round(100.0*delivered_orders/orders,1) ELSE 0 END,
    'cpa', CASE WHEN orders > 0 THEN round(spend/orders,2) ELSE 0 END,
    'cac', CASE WHEN delivered_orders > 0 THEN round(spend/delivered_orders,2) ELSE 0 END
  ) || COALESCE(cash - 'campaign_id', '{}'::jsonb) AS x FROM j
) s;
$function$;

-- Trend: same FX-aware spend
CREATE OR REPLACE FUNCTION public.mkt_campaign_trend(_brand_ids uuid[], _from date, _to date, _grain text DEFAULT 'day'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH g AS (SELECT CASE WHEN lower(_grain) = 'week' THEN 'week' ELSE 'day' END AS grain),
fx AS (SELECT public.mkt_usd_bdt_rate(_brand_ids) AS r),
spend AS (
  SELECT i.campaign_id AS cid,
    date_trunc((SELECT grain FROM g), i.date::timestamp)::date AS bucket,
    SUM(CASE WHEN COALESCE(i.spend_bdt_fifo,0) > 0 THEN i.spend_bdt_fifo
             WHEN COALESCE(a.currency,'USD') = 'BDT' THEN COALESCE(i.spend,0)
             ELSE COALESCE(i.spend,0) * (SELECT r FROM fx) END)::numeric AS spend
  FROM public.mkt_insights_daily i
  LEFT JOIN public.mkt_ad_accounts a ON a.id = i.account_id
  WHERE i.brand_id = ANY(_brand_ids) AND i.date >= _from AND i.date <= _to
  GROUP BY 1,2
),
lines AS (
  SELECT l.campaign_id AS cid,
    date_trunc((SELECT grain FROM g), l.day::timestamp)::date AS bucket,
    SUM(l.line_total)::numeric AS revenue,
    SUM(l.line_cogs)::numeric AS cogs,
    SUM(l.operating_cost)::numeric AS opex
  FROM unnest(_brand_ids) AS b(bid)
  CROSS JOIN LATERAL public.mkt_delivered_line_costs(b.bid, _from, _to) l
  WHERE l.campaign_id IS NOT NULL
  GROUP BY 1,2
),
merged AS (
  SELECT COALESCE(s.cid, x.cid) AS cid,
         COALESCE(s.bucket, x.bucket) AS bucket,
         COALESCE(s.spend,0) AS spend,
         COALESCE(x.revenue,0) AS revenue,
         COALESCE(x.cogs,0) AS cogs,
         COALESCE(x.opex,0) AS opex
  FROM spend s
  FULL OUTER JOIN lines x ON x.cid = s.cid AND x.bucket = s.bucket
)
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'campaign_id', cid,
  'bucket', bucket,
  'spend', round(spend,2),
  'delivered_revenue', round(revenue,2),
  'cogs', round(cogs,2),
  'operating_cost', round(opex,2),
  'gross_profit', round(revenue - cogs - opex,2),
  'net_profit', round(revenue - cogs - opex - spend,2)
) ORDER BY bucket), '[]'::jsonb)
FROM merged WHERE cid IS NOT NULL;
$function$;