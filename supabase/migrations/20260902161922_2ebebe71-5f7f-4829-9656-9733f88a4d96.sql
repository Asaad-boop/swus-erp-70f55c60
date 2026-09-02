CREATE OR REPLACE FUNCTION public.growth_day_pulse(_brand_ids uuid[], _from date, _to date)
RETURNS TABLE(
  orders_created bigint, booked_revenue numeric,
  orders_confirmed bigint, confirmed_value numeric,
  orders_cancelled bigint,
  dispatched_orders bigint,
  delivered_orders bigint, delivered_revenue numeric,
  cogs numeric, courier_cost numeric, packaging_cost numeric,
  returned_orders bigint, returned_value numeric,
  ad_spend_bdt numeric, net_profit numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH fx AS (
    SELECT COALESCE(
      (SELECT CASE WHEN SUM(usd_amount) > 0 THEN SUM(total_bdt)/SUM(usd_amount) END
         FROM public.meta_dollar_purchases WHERE status='confirmed'),
      (SELECT rate FROM public.erp_fx_rates WHERE from_ccy='USD' AND to_ccy='BDT' ORDER BY rate_date DESC LIMIT 1),
      0) AS rate
  ),
  created AS (
    SELECT COUNT(*)::bigint n, COALESCE(SUM(o.total),0)::numeric v
    FROM public.orders o
    WHERE o.brand_id = ANY(_brand_ids)
      AND o.status::text <> 'incomplete'
      AND (o.created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
  ),
  conf AS (
    SELECT COUNT(*)::bigint n, COALESCE(SUM(o.total),0)::numeric v
    FROM public.orders o
    WHERE o.brand_id = ANY(_brand_ids)
      AND (o.confirmed_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
  ),
  canc AS (
    SELECT COUNT(DISTINCT h.order_id)::bigint n
    FROM public.order_status_history h JOIN public.orders o ON o.id = h.order_id
    WHERE o.brand_id = ANY(_brand_ids)
      AND h.to_status::text IN ('cancelled','fake')
      AND (h.created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
  ),
  disp AS (
    SELECT COUNT(DISTINCT o.id)::bigint n
    FROM public.orders o
    WHERE o.brand_id = ANY(_brand_ids)
      AND (COALESCE(o.shipped_at, o.courier_assigned_at) AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
  ),
  dlv AS (
    SELECT o.id, COALESCE(o.total,0)::numeric AS total,
           COALESCE(NULLIF(o.actual_shipping_cost,0), o.courier_fee, 0)::numeric AS courier
    FROM public.orders o
    WHERE o.brand_id = ANY(_brand_ids)
      AND (o.delivered_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
  ),
  dlv_cost AS (
    SELECT
      COALESCE(SUM(COALESCE(NULLIF(oi.unit_cost_snapshot,0), NULLIF(pv.weighted_avg_cost,0),
                            NULLIF(p.weighted_avg_cost,0), NULLIF(p.cost_price,0), 0) * COALESCE(oi.quantity,0)),0)::numeric AS cogs,
      COALESCE(SUM(COALESCE(oi.packaging_cost_allocated,0)),0)::numeric AS packaging
    FROM public.order_items oi
    JOIN dlv d ON d.id = oi.order_id
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    LEFT JOIN public.products p ON p.id = oi.product_id
  ),
  ret AS (
    SELECT COUNT(DISTINCT h.order_id)::bigint n,
           COALESCE(SUM(DISTINCT o.total),0)::numeric v
    FROM public.order_status_history h JOIN public.orders o ON o.id = h.order_id
    WHERE o.brand_id = ANY(_brand_ids)
      AND h.to_status::text IN ('returned','unpaid_return','paid_return','partial_return')
      AND (h.created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
  ),
  ads AS (
    SELECT COALESCE(SUM(CASE WHEN i.spend_bdt_fifo IS NOT NULL AND i.spend_bdt_fifo > 0
                             THEN i.spend_bdt_fifo ELSE COALESCE(i.spend,0) * (SELECT rate FROM fx) END),0)::numeric AS spend
    FROM public.mkt_insights_daily i
    WHERE i.brand_id = ANY(_brand_ids) AND i.date BETWEEN _from AND _to
  )
  SELECT
    created.n, created.v,
    conf.n, conf.v,
    canc.n,
    disp.n,
    (SELECT COUNT(*)::bigint FROM dlv),
    (SELECT COALESCE(SUM(total),0)::numeric FROM dlv),
    dlv_cost.cogs,
    (SELECT COALESCE(SUM(courier),0)::numeric FROM dlv),
    dlv_cost.packaging,
    ret.n, ret.v,
    ads.spend,
    ((SELECT COALESCE(SUM(total),0)::numeric FROM dlv)
      - dlv_cost.cogs
      - (SELECT COALESCE(SUM(courier),0)::numeric FROM dlv)
      - dlv_cost.packaging
      - ads.spend)::numeric
  FROM created, conf, canc, disp, dlv_cost, ret, ads;
$function$;

GRANT EXECUTE ON FUNCTION public.growth_day_pulse(uuid[], date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.growth_team_scoreboard(_brand_ids uuid[], _from date, _to date)
RETURNS TABLE(user_id uuid, name text, confirmed_orders bigint, confirmed_value numeric, delivered_orders bigint, delivered_value numeric, calls bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  with ev as (
    select distinct on (h.order_id) h.order_id, h.changed_by as uid
    from public.order_status_history h
    join public.orders o on o.id = h.order_id
    where h.to_status::text = 'confirmed'
      and h.changed_by is not null
      and (_brand_ids is null or o.brand_id = any(_brand_ids))
      and (h.created_at at time zone 'Asia/Dhaka')::date between _from and _to
    order by h.order_id, h.created_at desc
  ),
  legacy as (
    select o.id as order_id, o.confirmed_by as uid
    from public.orders o
    where o.confirmed_by is not null
      and (_brand_ids is null or o.brand_id = any(_brand_ids))
      and (o.confirmed_at at time zone 'Asia/Dhaka')::date between _from and _to
      and not exists (select 1 from ev where ev.order_id = o.id)
  ),
  allc as (select * from ev union all select * from legacy),
  conf as (
    select a.uid,
           count(*)::bigint as confirmed_orders,
           coalesce(sum(o.total),0)::numeric as confirmed_value,
           count(*) filter (where o.status::text in ('delivered','completed','paid'))::bigint as delivered_orders,
           coalesce(sum(o.total) filter (where o.status::text in ('delivered','completed','paid')),0)::numeric as delivered_value
    from allc a join public.orders o on o.id = a.order_id
    group by a.uid
  ),
  calls as (
    select o.last_called_by as uid, count(*)::bigint as calls
    from public.orders o
    where o.last_called_by is not null
      and (_brand_ids is null or o.brand_id = any(_brand_ids))
      and (o.last_call_at at time zone 'Asia/Dhaka')::date between _from and _to
    group by o.last_called_by
  ),
  ids as (select uid from conf union select uid from calls)
  select i.uid,
         coalesce(nullif(p.display_name,''), p.username, p.email, 'Unknown') as name,
         coalesce(c.confirmed_orders,0),
         coalesce(c.confirmed_value,0),
         coalesce(c.delivered_orders,0),
         coalesce(c.delivered_value,0),
         coalesce(cl.calls,0)
  from ids i
  left join conf c on c.uid = i.uid
  left join calls cl on cl.uid = i.uid
  left join public.profiles p on p.id = i.uid
  order by 3 desc, 7 desc;
$function$;