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
), jc AS (
  SELECT j.*,
    -- Courier payout + only the still-outstanding part of the advance.
    -- Some couriers report the full order value as collected (advance already
    -- inside it); adding advance again would overstate cash.
    (courier_collected
      + LEAST(advance_amount, GREATEST(total - courier_collected, 0)))::numeric AS cash_collected
  FROM j
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
    SUM(CASE WHEN is_delivered AND settle_rows > 0 THEN cash_collected ELSE 0 END)::numeric AS collected_amount,
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
  FROM jc GROUP BY cid
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

REVOKE ALL ON FUNCTION public.mkt_campaign_cash(uuid[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_campaign_cash(uuid[], date, date) TO authenticated, service_role;