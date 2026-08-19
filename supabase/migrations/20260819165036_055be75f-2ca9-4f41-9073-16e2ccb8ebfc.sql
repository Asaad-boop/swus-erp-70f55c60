CREATE OR REPLACE FUNCTION public.erp_order_dashboard_summary(
  p_brand_ids uuid[] DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_statuses text[] DEFAULT NULL,
  p_payment_status text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_courier text DEFAULT NULL,
  p_confirmed_by uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_tags text[] DEFAULT NULL,
  p_min_amount numeric DEFAULT NULL,
  p_max_amount numeric DEFAULT NULL,
  p_city text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
WITH f AS (
  SELECT o.*
  FROM public.orders o
  WHERE (p_brand_ids IS NULL OR o.brand_id = ANY(p_brand_ids))
    AND (p_from IS NULL OR o.created_at >= p_from)
    AND (p_to IS NULL OR o.created_at <= p_to)
    AND (p_statuses IS NULL OR array_length(p_statuses,1) IS NULL OR o.status::text = ANY(p_statuses))
    AND (p_payment_status IS NULL OR o.payment_status::text = p_payment_status)
    AND (p_source IS NULL OR o.source::text = p_source)
    AND (p_courier IS NULL OR o.courier_name = p_courier)
    AND (p_confirmed_by IS NULL OR o.confirmed_by = p_confirmed_by)
    AND (p_tags IS NULL OR array_length(p_tags,1) IS NULL OR o.tags && p_tags)
    AND (p_min_amount IS NULL OR o.total >= p_min_amount)
    AND (p_max_amount IS NULL OR o.total <= p_max_amount)
    AND (p_city IS NULL OR coalesce(o.pathao_city_name, o.shipping_city, '') ILIKE '%'||p_city||'%')
    AND (
      p_search IS NULL OR p_search = '' OR
      o.invoice_no ILIKE '%'||p_search||'%' OR
      o.shipping_name ILIKE '%'||p_search||'%' OR
      o.shipping_phone ILIKE '%'||p_search||'%' OR
      o.guest_name ILIKE '%'||p_search||'%' OR
      o.guest_phone ILIKE '%'||p_search||'%' OR
      o.tracking_number ILIKE '%'||p_search||'%'
    )
),
k AS (
  SELECT
    count(*)::int AS total_orders,
    coalesce(sum(total),0)::numeric AS total_value,
    count(*) FILTER (WHERE status::text IN ('delivered','partial_delivered','completed'))::int AS delivered_orders,
    coalesce(sum(total) FILTER (WHERE status::text IN ('delivered','partial_delivered','completed')),0)::numeric AS delivered_value,
    count(*) FILTER (WHERE status::text IN ('returned','partial_return','pending_return','return_in_transit'))::int AS returned_orders,
    coalesce(sum(total) FILTER (WHERE status::text IN ('returned','partial_return','pending_return','return_in_transit')),0)::numeric AS returned_value,
    count(*) FILTER (WHERE status::text = 'cancelled')::int AS cancelled_orders,
    count(*) FILTER (WHERE status::text IN ('shipped','in_transit'))::int AS in_transit_orders,
    coalesce(sum(advance_amount),0)::numeric AS advance_collected,
    coalesce(sum(greatest(total - coalesce(advance_amount,0),0)) FILTER (WHERE status::text NOT IN ('delivered','partial_delivered','completed','cancelled','returned','partial_return')),0)::numeric AS cod_outstanding,
    count(*) FILTER (WHERE payment_status::text = 'paid')::int AS paid_orders,
    coalesce(avg(total),0)::numeric AS avg_order_value,
    coalesce(avg(EXTRACT(EPOCH FROM (delivered_at - confirmed_at))/3600) FILTER (WHERE delivered_at IS NOT NULL AND confirmed_at IS NOT NULL),0)::numeric AS avg_confirm_to_delivery_hours
  FROM f
),
st AS (SELECT status::text AS status, count(*)::int AS orders, coalesce(sum(total),0)::numeric AS value FROM f GROUP BY 1),
pay AS (SELECT coalesce(payment_status::text,'unknown') AS payment_status, count(*)::int AS orders, coalesce(sum(total),0)::numeric AS value FROM f GROUP BY 1),
daily AS (SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS d, count(*)::int AS orders, coalesce(sum(total),0)::numeric AS value,
                 count(*) FILTER (WHERE status::text IN ('delivered','partial_delivered','completed'))::int AS delivered
          FROM f GROUP BY 1 ORDER BY 1),
src AS (SELECT coalesce(source::text,'unknown') AS source, count(*)::int AS orders, coalesce(sum(total),0)::numeric AS value FROM f GROUP BY 1 ORDER BY 2 DESC),
br AS (SELECT f.brand_id, b.name, count(*)::int AS orders, coalesce(sum(f.total),0)::numeric AS value
       FROM f LEFT JOIN public.brands b ON b.id = f.brand_id GROUP BY 1,2 ORDER BY 3 DESC),
prod AS (SELECT oi.name,
                sum(oi.quantity)::int AS qty,
                coalesce(sum(oi.line_total),0)::numeric AS value,
                count(DISTINCT oi.order_id)::int AS orders,
                coalesce(sum(oi.quantity) FILTER (WHERE f.status::text IN ('delivered','partial_delivered','completed')),0)::int AS delivered_qty,
                (array_agg(oi.image ORDER BY oi.created_at DESC) FILTER (WHERE oi.image IS NOT NULL AND oi.image <> ''))[1] AS image
         FROM public.order_items oi JOIN f ON f.id = oi.order_id GROUP BY 1 ORDER BY 2 DESC LIMIT 15),
city AS (SELECT coalesce(nullif(pathao_city_name,''), nullif(shipping_city,''), 'Unknown') AS city, count(*)::int AS orders,
                coalesce(sum(total),0)::numeric AS value,
                count(*) FILTER (WHERE status::text IN ('delivered','partial_delivered','completed'))::int AS delivered
         FROM f GROUP BY 1 ORDER BY 2 DESC LIMIT 15),
conf AS (SELECT f.confirmed_by AS user_id, coalesce(p.display_name, 'Unknown') AS name, count(*)::int AS orders,
                coalesce(sum(f.total),0)::numeric AS value
         FROM f LEFT JOIN public.profiles p ON p.id = f.confirmed_by
         WHERE f.confirmed_by IS NOT NULL GROUP BY 1,2 ORDER BY 3 DESC LIMIT 20),
cour AS (SELECT coalesce(nullif(courier_name,''),'none') AS courier, count(*)::int AS orders,
                count(*) FILTER (WHERE status::text IN ('delivered','partial_delivered','completed'))::int AS delivered,
                count(*) FILTER (WHERE status::text IN ('returned','partial_return'))::int AS returned
         FROM f GROUP BY 1 ORDER BY 2 DESC)
SELECT jsonb_build_object(
  'kpis', (SELECT to_jsonb(k) FROM k),
  'statuses', coalesce((SELECT jsonb_agg(to_jsonb(st)) FROM st), '[]'::jsonb),
  'payments', coalesce((SELECT jsonb_agg(to_jsonb(pay)) FROM pay), '[]'::jsonb),
  'daily', coalesce((SELECT jsonb_agg(to_jsonb(daily)) FROM daily), '[]'::jsonb),
  'sources', coalesce((SELECT jsonb_agg(to_jsonb(src)) FROM src), '[]'::jsonb),
  'brands', coalesce((SELECT jsonb_agg(to_jsonb(br)) FROM br), '[]'::jsonb),
  'products', coalesce((SELECT jsonb_agg(to_jsonb(prod)) FROM prod), '[]'::jsonb),
  'cities', coalesce((SELECT jsonb_agg(to_jsonb(city)) FROM city), '[]'::jsonb),
  'confirmers', coalesce((SELECT jsonb_agg(to_jsonb(conf)) FROM conf), '[]'::jsonb),
  'couriers', coalesce((SELECT jsonb_agg(to_jsonb(cour)) FROM cour), '[]'::jsonb)
);
$fn$;

GRANT EXECUTE ON FUNCTION public.erp_order_dashboard_summary(uuid[],timestamptz,timestamptz,text[],text,text,text,uuid,text,text[],numeric,numeric,text) TO authenticated, service_role;