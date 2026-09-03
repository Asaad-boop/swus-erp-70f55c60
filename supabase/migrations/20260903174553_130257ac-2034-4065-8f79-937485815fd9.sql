CREATE OR REPLACE FUNCTION public.mkt_campaign_cash(_brand_ids uuid[], _from date, _to date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH o AS (
  SELECT ord.id, ord.brand_id, ord.status::text AS status,
         ord.confirmation_status::text AS confirmation_status,
         COALESCE(ord.total,0)::numeric AS total,
         COALESCE(ord.advance_amount,0)::numeric AS advance_amount
  FROM public.orders ord
  WHERE ord.brand_id = ANY(_brand_ids)
    AND ord.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND ord.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
), pc AS (
  SELECT * FROM public.mkt_order_primary_campaign(_brand_ids, _from, _to)
), recon AS (
  SELECT r.matched_order_id AS oid,
         SUM(COALESCE(r.collected,0))::numeric AS collected,
         SUM(COALESCE(r.return_fee,0))::numeric AS return_fee,
         COUNT(*)::int AS n
  FROM public.erp_reconciliation_rows r
  WHERE r.matched_order_id IS NOT NULL
  GROUP BY 1
), settle AS (
  SELECT s.matched_order_id AS oid,
         SUM(COALESCE(s.collected_amount,0))::numeric AS collected,
         SUM(COALESCE(s.final_fee,0))::numeric AS fee,
         COUNT(*)::int AS n
  FROM public.erp_courier_settlement_lines s
  WHERE s.matched_order_id IS NOT NULL
  GROUP BY 1
), rc AS (
  SELECT c.order_id AS oid,
         SUM(COALESCE(c.return_delivery_cost,0))::numeric AS return_delivery_cost,
         SUM(CASE WHEN c.item_condition = 'sellable'
                  THEN COALESCE(c.qty,0) * COALESCE(NULLIF(oi.unit_cost_snapshot,0),
                                                    NULLIF(pv.weighted_avg_cost,0),
                                                    NULLIF(p.weighted_avg_cost,0),
                                                    NULLIF(p.cost_price,0), 0)
                  ELSE 0 END)::numeric AS cogs_recovered
  FROM public.erp_return_cases c
  LEFT JOIN public.order_items oi ON oi.id = c.order_item_id
  LEFT JOIN public.product_variants pv ON pv.id = c.variant_id
  LEFT JOIN public.products p ON p.id = c.product_id
  GROUP BY 1
), est AS (
  SELECT AVG(NULLIF(ord.courier_fee,0))::numeric AS avg_fee
  FROM public.orders ord
  WHERE ord.brand_id = ANY(_brand_ids)
    AND ord.courier_fee IS NOT NULL
    AND ord.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND ord.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
), j AS (
  SELECT
    pc.campaign_id AS cid,
    o.id AS oid,
    o.status,
    o.confirmation_status,
    o.total,
    o.advance_amount,
    (o.status = ANY(public.rpt_delivered_statuses())) AS is_delivered,
    (o.status IN ('returned','paid_return','unpaid_return','partial_return','pending_return','return_in_transit')) AS is_returned,
    (o.status IN ('cancelled','fake')) AS is_cancelled,
    (o.confirmation_status = 'confirmed'
       OR o.status NOT IN ('new','incomplete','cancelled','fake','on_hold','advance_payment_pending')) AS is_confirmed,
    COALESCE(recon.n,0) + COALESCE(settle.n,0) AS settle_rows,
    (COALESCE(recon.collected,0) + COALESCE(settle.collected,0))::numeric AS courier_collected,
    COALESCE(recon.return_fee, 0)::numeric AS recon_return_fee,
    COALESCE(rc.return_delivery_cost, 0)::numeric AS case_return_fee,
    COALESCE(rc.cogs_recovered, 0)::numeric AS cogs_recovered,
    (SELECT avg_fee FROM est) AS est_fee
  FROM o
  JOIN pc ON pc.order_id = o.id
  LEFT JOIN recon ON recon.oid = o.id
  LEFT JOIN settle ON settle.oid = o.id
  LEFT JOIN rc ON rc.oid = o.id
  WHERE pc.campaign_id IS NOT NULL
), k AS (
  SELECT
    cid,
    COUNT(*)::int AS booked_order_count,
    SUM(total)::numeric AS booked_value,
    COUNT(*) FILTER (WHERE is_cancelled)::int AS cancelled_count,
    COALESCE(SUM(total) FILTER (WHERE is_cancelled),0)::numeric AS cancelled_value,
    COUNT(*) FILTER (WHERE is_confirmed)::int AS confirmed_count,
    COALESCE(SUM(total) FILTER (WHERE is_confirmed),0)::numeric AS confirmed_value,
    COUNT(*) FILTER (WHERE is_delivered)::int AS delivered_count,
    COALESCE(SUM(total) FILTER (WHERE is_delivered),0)::numeric AS delivered_order_value,
    COUNT(*) FILTER (WHERE is_returned)::int AS returned_count,
    COUNT(*) FILTER (WHERE is_delivered AND settle_rows > 0)::int AS settled_delivered_count,
    SUM(CASE WHEN is_delivered AND settle_rows > 0
             THEN courier_collected + advance_amount ELSE 0 END)::numeric AS collected_amount,
    SUM(CASE WHEN is_delivered AND settle_rows > 0 THEN total ELSE 0 END)::numeric AS expected_collectible,
    SUM(CASE WHEN is_returned THEN
          CASE WHEN recon_return_fee > 0 THEN recon_return_fee
               WHEN case_return_fee  > 0 THEN case_return_fee
               ELSE COALESCE(est_fee, 0) END
         ELSE 0 END)::numeric AS return_charge,
    BOOL_OR(is_returned AND recon_return_fee = 0 AND case_return_fee = 0) AS return_charge_is_estimate,
    COUNT(*) FILTER (WHERE is_returned AND recon_return_fee = 0 AND case_return_fee = 0
                       AND (SELECT avg_fee FROM est) IS NULL)::int AS return_charge_unknown_count,
    SUM(cogs_recovered) FILTER (WHERE is_delivered)::numeric AS cogs_recovered
  FROM j GROUP BY cid
)
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'campaign_id', cid,
  'booked_order_count', booked_order_count,
  'booked_value', round(booked_value,2),
  'cancelled_count', cancelled_count,
  'cancelled_value', round(cancelled_value,2),
  'confirmed_count', confirmed_count,
  'confirmed_value', round(confirmed_value,2),
  'delivered_count', delivered_count,
  'delivered_order_value', round(delivered_order_value,2),
  'returned_count', returned_count,
  'settled_delivered_count', settled_delivered_count,
  'collected_amount', CASE WHEN settled_delivered_count > 0 THEN round(collected_amount,2) ELSE NULL END,
  'expected_collectible', CASE WHEN settled_delivered_count > 0 THEN round(expected_collectible,2) ELSE NULL END,
  'collection_variance', CASE WHEN settled_delivered_count > 0
                              THEN round(expected_collectible - collected_amount,2) ELSE NULL END,
  'return_charge', CASE WHEN returned_count > 0 AND return_charge_unknown_count < returned_count
                        THEN round(return_charge,2) ELSE NULL END,
  'return_charge_is_estimate', COALESCE(return_charge_is_estimate,false),
  'cogs_recovered', round(COALESCE(cogs_recovered,0),2),
  'settlement_coverage', CASE WHEN delivered_count > 0
                              THEN round(100.0 * settled_delivered_count / delivered_count, 1) ELSE NULL END
)), '[]'::jsonb) FROM k;
$function$;

REVOKE ALL ON FUNCTION public.mkt_campaign_cash(uuid[], date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mkt_campaign_cash(uuid[], date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mkt_campaign_truth(_brand_ids uuid[], _from date, _to date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH ins AS (
  SELECT i.campaign_id AS cid,
    SUM(COALESCE(i.spend_bdt_fifo, i.spend, 0)) AS spend,
    SUM(COALESCE(i.clicks,0)) AS clicks,
    SUM(COALESCE(i.meta_purchases,0)) AS meta_purchases,
    SUM(COALESCE(i.meta_purchase_value,0)) AS meta_purchase_value
  FROM public.mkt_insights_daily i
  WHERE i.brand_id = ANY(_brand_ids) AND i.date >= _from AND i.date <= _to
  GROUP BY 1
), pc AS (
  SELECT * FROM public.mkt_order_primary_campaign(_brand_ids, _from, _to)
), ord2 AS (
  SELECT o.id, o.status::text AS status, o.confirmation_status::text AS confirmation_status,
         COALESCE(o.total,0)::numeric AS total,
         pc.campaign_id AS cid, pc.source AS attr_source, pc.priority AS attr_priority
  FROM public.orders o
  JOIN pc ON pc.order_id = o.id
  WHERE o.brand_id = ANY(_brand_ids)
), att AS (
  SELECT cid,
    COUNT(*) AS orders,
    COUNT(*) FILTER (WHERE attr_priority <= 2) AS attributed_orders,
    COUNT(*) FILTER (WHERE attr_priority > 2) AS unlinked_orders,
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
    COALESCE(t.unlinked_orders,0) AS unlinked_orders,
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
  WHERE c.brand_id = ANY(_brand_ids)
    AND (COALESCE(i.spend,0) > 0 OR COALESCE(t.orders,0) > 0)
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
    'unlinked_orders', unlinked_orders,
    'attribution_source', primary_source,
    'attribution_coverage', CASE WHEN orders > 0 THEN round(100.0*attributed_orders/orders,1) ELSE NULL END,
    'match_status', CASE
      WHEN orders = 0 AND spend > 0 THEN 'no_orders'
      WHEN unlinked_orders = 0 THEN 'linked'
      WHEN attributed_orders = 0 THEN 'utm_only'
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

REVOKE ALL ON FUNCTION public.mkt_campaign_truth(uuid[], date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mkt_campaign_truth(uuid[], date, date) TO authenticated, service_role;