CREATE INDEX IF NOT EXISTS idx_orders_brand_status_created ON public.orders (brand_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_confirmed_by ON public.orders (confirmed_by) WHERE confirmed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders (payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_invoice_no_trgm ON public.orders USING gin (invoice_no gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_phone_trgm ON public.orders USING gin (shipping_phone gin_trgm_ops);

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
prod AS (SELECT oi.name, sum(oi.quantity)::int AS qty, coalesce(sum(oi.line_total),0)::numeric AS value
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

CREATE OR REPLACE FUNCTION public.erp_order_dashboard_rows(
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
  p_city text DEFAULT NULL,
  p_sort text DEFAULT 'created_at',
  p_dir text DEFAULT 'desc',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
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
page AS (
  SELECT * FROM f
  ORDER BY
    CASE WHEN p_sort = 'created_at' AND p_dir = 'desc' THEN created_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'created_at' AND p_dir = 'asc' THEN created_at END ASC NULLS LAST,
    CASE WHEN p_sort = 'total' AND p_dir = 'desc' THEN total END DESC NULLS LAST,
    CASE WHEN p_sort = 'total' AND p_dir = 'asc' THEN total END ASC NULLS LAST,
    CASE WHEN p_sort = 'updated_at' AND p_dir = 'desc' THEN updated_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'updated_at' AND p_dir = 'asc' THEN updated_at END ASC NULLS LAST,
    CASE WHEN p_sort = 'delivered_at' AND p_dir = 'desc' THEN delivered_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'delivered_at' AND p_dir = 'asc' THEN delivered_at END ASC NULLS LAST,
    created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit,50), 500)) OFFSET greatest(coalesce(p_offset,0),0)
)
SELECT jsonb_build_object(
  'total', (SELECT count(*)::int FROM f),
  'sum_total', (SELECT coalesce(sum(total),0)::numeric FROM f),
  'rows', coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', pg.id,
        'invoice_no', pg.invoice_no,
        'created_at', pg.created_at,
        'updated_at', pg.updated_at,
        'status', pg.status::text,
        'payment_status', pg.payment_status::text,
        'confirmation_status', pg.confirmation_status::text,
        'web_status', pg.web_status::text,
        'source', pg.source::text,
        'brand_id', pg.brand_id,
        'brand_name', b.name,
        'customer_name', coalesce(pg.shipping_name, pg.guest_name),
        'phone', coalesce(pg.shipping_phone, pg.guest_phone),
        'address', pg.shipping_address,
        'city', coalesce(nullif(pg.pathao_city_name,''), pg.shipping_city),
        'zone', coalesce(nullif(pg.pathao_zone_name,''), pg.shipping_thana)
      ) || jsonb_build_object(
        'total', pg.total,
        'subtotal', pg.subtotal,
        'discount_amount', pg.discount_amount,
        'shipping_fee', pg.shipping_fee,
        'advance_amount', pg.advance_amount,
        'advance_source', pg.advance_source,
        'advance_txn_id', pg.advance_txn_id,
        'cod_due', greatest(coalesce(pg.total,0) - coalesce(pg.advance_amount,0), 0),
        'courier_name', pg.courier_name,
        'tracking_number', pg.tracking_number,
        'courier_status', cs.status,
        'actual_shipping_cost', pg.actual_shipping_cost,
        'net_collected', pg.net_collected,
        'reconciliation_status', pg.reconciliation_status,
        'tags', coalesce(pg.tags, '{}'::text[]),
        'is_preorder', pg.is_preorder,
        'printed_at', pg.printed_at
      ) || jsonb_build_object(
        'confirmed_at', pg.confirmed_at,
        'confirmed_by', pg.confirmed_by,
        'confirmed_by_name', cp.display_name,
        'packaged_at', pg.packaged_at,
        'packaged_by_name', pp.display_name,
        'shipped_at', pg.shipped_at,
        'delivered_at', pg.delivered_at,
        'cancelled_at', pg.cancelled_at,
        'cancel_reason', coalesce(pg.cancel_reason, pg.cancellation_reason),
        'paid_at', pg.paid_at,
        'assigned_to_name', ap.display_name,
        'utm_source', pg.utm_source,
        'utm_campaign', pg.utm_campaign,
        'external_platform', pg.external_platform,
        'customer_note', pg.customer_note,
        'admin_notes', pg.admin_notes
      ) || jsonb_build_object(
        'note_count', (SELECT count(*)::int FROM public.order_notes n WHERE n.order_id = pg.id),
        'item_count', coalesce(it.item_count, 0),
        'total_qty', coalesce(it.total_qty, 0),
        'items', coalesce(it.items, '[]'::jsonb)
      )
      ORDER BY pg.created_at DESC)
    FROM page pg
    LEFT JOIN public.brands b ON b.id = pg.brand_id
    LEFT JOIN public.profiles cp ON cp.id = pg.confirmed_by
    LEFT JOIN public.profiles pp ON pp.id = pg.packaged_by
    LEFT JOIN public.profiles ap ON ap.id = pg.assigned_to
    LEFT JOIN LATERAL (
      SELECT s.status FROM public.courier_shipments s
      WHERE s.order_id = pg.id ORDER BY s.created_at DESC LIMIT 1
    ) cs ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS item_count, coalesce(sum(oi.quantity),0)::int AS total_qty,
             jsonb_agg(jsonb_build_object(
               'id', oi.id, 'name', oi.name, 'image', oi.image,
               'quantity', oi.quantity, 'variant_label', oi.variant_label,
               'line_total', oi.line_total
             )) AS items
      FROM public.order_items oi WHERE oi.order_id = pg.id
    ) it ON true
  ), '[]'::jsonb)
);
$fn$;

GRANT EXECUTE ON FUNCTION public.erp_order_dashboard_rows(uuid[],timestamptz,timestamptz,text[],text,text,text,uuid,text,text[],numeric,numeric,text,text,text,int,int) TO authenticated, service_role;