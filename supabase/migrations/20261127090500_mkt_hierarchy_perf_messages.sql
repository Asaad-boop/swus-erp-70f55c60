-- Campaign / ad set / ad table: message-ad results (Meta conversations started,
-- chats the inbox saw from each ad, cost per message).
CREATE OR REPLACE FUNCTION public.mkt_hierarchy_perf(_brand_ids uuid[], _from date, _to date, _level text DEFAULT 'campaign'::text, _parent_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH ins AS (
  SELECT
    CASE _level WHEN 'campaign' THEN i.campaign_id WHEN 'adset' THEN i.adset_id ELSE i.ad_id END AS node_id,
    SUM(COALESCE(i.spend_bdt_fifo, i.spend, 0)) AS spend,
    SUM(COALESCE(i.impressions,0)) AS impressions,
    SUM(COALESCE(i.clicks,0)) AS clicks,
    SUM(COALESCE(i.reach,0)) AS reach,
    SUM(COALESCE(i.meta_purchases,0)) AS meta_purchases,
    SUM(COALESCE(i.meta_messages,0)) AS meta_messages,
    SUM(COALESCE(i.meta_leads,0)) AS meta_leads
  FROM public.mkt_insights_daily i
  WHERE i.brand_id = ANY(_brand_ids)
    AND i.date >= _from AND i.date <= _to
    AND (_parent_id IS NULL
         OR (_level = 'adset' AND i.campaign_id = _parent_id)
         OR (_level = 'ad' AND i.adset_id = _parent_id))
  GROUP BY 1
), att AS (
  SELECT
    CASE _level WHEN 'campaign' THEN a.campaign_id WHEN 'adset' THEN a.adset_id ELSE a.ad_id END AS node_id,
    COUNT(DISTINCT o.id) AS orders,
    COUNT(DISTINCT o.id) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())) AS delivered_orders,
    COALESCE(SUM(o.total) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())),0) AS revenue,
    COALESCE(SUM(o.total),0) AS booked_revenue
  FROM public.mkt_order_attributions a
  JOIN public.orders o ON o.id = a.order_id
  WHERE a.brand_id = ANY(_brand_ids)
    AND o.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND (_parent_id IS NULL
         OR (_level = 'adset' AND a.campaign_id = _parent_id)
         OR (_level = 'ad' AND a.adset_id = _parent_id))
  GROUP BY 1
), chats AS (
  SELECT
    CASE _level WHEN 'campaign' THEN d.campaign_id WHEN 'adset' THEN d.adset_id ELSE d.id END AS node_id,
    COUNT(DISTINCT (r.channel_id, r.external_user_id)) AS chats
  FROM public.inbox_ad_referrals r
  JOIN public.mkt_ads d ON d.external_id = r.ad_id
  WHERE r.brand_id = ANY(_brand_ids)
    AND r.source IN ('ADS', 'CTWA')
    AND r.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND r.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
    AND (_parent_id IS NULL
         OR (_level = 'adset' AND d.campaign_id = _parent_id)
         OR (_level = 'ad' AND d.adset_id = _parent_id))
  GROUP BY 1
), nodes AS (
  SELECT c.id, c.name, COALESCE(c.effective_status, c.status, '—') AS status,
         c.objective, COALESCE(c.daily_budget, 0) AS daily_budget,
         COALESCE(c.lifetime_budget,0) AS lifetime_budget,
         c.target_roas, c.target_cpa, NULL::text AS targeting, NULL::text AS thumbnail,
         c.brand_id
  FROM public.mkt_campaigns c
  WHERE _level = 'campaign' AND c.brand_id = ANY(_brand_ids)
  UNION ALL
  SELECT s.id, s.name, COALESCE(s.effective_status, s.status, '—'),
         NULL, COALESCE(s.daily_budget,0), COALESCE(s.lifetime_budget,0),
         NULL, NULL, s.targeting_summary, NULL, s.brand_id
  FROM public.mkt_adsets s
  WHERE _level = 'adset' AND s.brand_id = ANY(_brand_ids)
    AND (_parent_id IS NULL OR s.campaign_id = _parent_id)
  UNION ALL
  SELECT d.id, d.name, COALESCE(d.effective_status, d.status, '—'),
         NULL, 0, 0, NULL, NULL, NULL, d.creative_thumbnail, d.brand_id
  FROM public.mkt_ads d
  WHERE _level = 'ad' AND d.brand_id = ANY(_brand_ids)
    AND (_parent_id IS NULL OR d.adset_id = _parent_id)
), j AS (
  SELECT n.*,
    COALESCE(i.spend,0) AS spend,
    COALESCE(i.impressions,0) AS impressions,
    COALESCE(i.clicks,0) AS clicks,
    COALESCE(i.reach,0) AS reach,
    COALESCE(i.meta_purchases,0) AS meta_purchases,
    COALESCE(i.meta_messages,0) AS meta_messages,
    COALESCE(i.meta_leads,0) AS meta_leads,
    COALESCE(ch.chats,0) AS chats,
    COALESCE(t.orders,0) AS orders,
    COALESCE(t.delivered_orders,0) AS delivered_orders,
    COALESCE(t.revenue,0) AS revenue,
    COALESCE(t.booked_revenue,0) AS booked_revenue
  FROM nodes n
  LEFT JOIN ins i ON i.node_id = n.id
  LEFT JOIN att t ON t.node_id = n.id
  LEFT JOIN chats ch ON ch.node_id = n.id
  WHERE COALESCE(i.spend,0) > 0 OR COALESCE(t.orders,0) > 0 OR COALESCE(ch.chats,0) > 0
)
SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'spend')::numeric DESC), '[]'::jsonb)
FROM (
  SELECT jsonb_build_object(
    'id', id, 'name', COALESCE(name,'(unnamed)'), 'status', status,
    'objective', objective, 'brand_id', brand_id,
    'daily_budget', round(daily_budget,2), 'lifetime_budget', round(lifetime_budget,2),
    'target_roas', target_roas, 'target_cpa', target_cpa,
    'targeting', targeting, 'thumbnail', thumbnail,
    'spend', round(spend,2), 'impressions', impressions, 'clicks', clicks, 'reach', reach,
    'meta_purchases', meta_purchases,
    'meta_messages', meta_messages,
    'meta_leads', meta_leads,
    'chats', chats,
    'cost_per_message', CASE WHEN meta_messages > 0 THEN round(spend/meta_messages,2) ELSE 0 END,
    'ctr', CASE WHEN impressions > 0 THEN round(100.0*clicks/impressions,2) ELSE 0 END,
    'cpc', CASE WHEN clicks > 0 THEN round(spend/clicks,2) ELSE 0 END,
    'cpm', CASE WHEN impressions > 0 THEN round(1000.0*spend/impressions,2) ELSE 0 END,
    'orders', orders, 'delivered_orders', delivered_orders,
    'revenue', round(revenue,2), 'booked_revenue', round(booked_revenue,2),
    'roas', CASE WHEN spend > 0 THEN round(revenue/spend,2) ELSE 0 END,
    'booked_roas', CASE WHEN spend > 0 THEN round(booked_revenue/spend,2) ELSE 0 END,
    'cac', CASE WHEN delivered_orders > 0 THEN round(spend/delivered_orders,2) ELSE 0 END,
    'cpa', CASE WHEN orders > 0 THEN round(spend/orders,2) ELSE 0 END
  ) AS x FROM j
) s;
$function$;
