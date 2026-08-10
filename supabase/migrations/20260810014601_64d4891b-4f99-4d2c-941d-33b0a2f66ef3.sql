
CREATE OR REPLACE FUNCTION public.rpt_order_ledger(
  _brand_ids uuid[],
  _from date,
  _to date,
  _basis text DEFAULT 'delivered',
  _search text DEFAULT NULL,
  _status text DEFAULT NULL,
  _courier text DEFAULT NULL,
  _limit integer DEFAULT 200,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  order_id uuid, invoice_no text, day date, created_at timestamptz, status text,
  is_delivered boolean, is_returned boolean, is_cancelled boolean,
  customer_name text, customer_phone text, city text, source text, payment_method text,
  courier_name text, tracking_number text,
  units numeric, items jsonb,
  gross_sales numeric, discounts numeric, net_revenue numeric,
  shipping_fee numeric, order_total numeric, advance_amount numeric,
  cod_expected numeric, courier_collected numeric, courier_charge numeric,
  collection_diff numeric, reconciliation_status text,
  cogs numeric, gross_profit numeric, net_profit numeric, cost_missing_units numeric,
  total_count bigint
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH l AS (
    SELECT * FROM public.rpt_lines(_brand_ids, _from, _to, _basis)
  ),
  agg AS (
    SELECT
      l.order_id,
      SUM(l.quantity) AS units,
      SUM(l.gross_line) AS gross_sales,
      SUM(l.discount_alloc) AS discounts,
      SUM(l.net_revenue) AS net_revenue,
      SUM(l.line_cogs) AS cogs,
      SUM(CASE WHEN l.cost_missing THEN l.quantity ELSE 0 END) AS cost_missing_units,
      jsonb_agg(
        jsonb_build_object(
          'product_name', l.product_name,
          'variant_label', l.variant_label,
          'sku', l.sku,
          'quantity', l.quantity,
          'net_revenue', l.net_revenue,
          'unit_cost', l.unit_cost,
          'line_cogs', l.line_cogs,
          'line_profit', l.net_revenue - l.line_cogs
        ) ORDER BY l.net_revenue DESC
      ) AS items,
      MIN(l.day) AS day,
      MIN(l.status) AS status,
      bool_or(l.is_delivered) AS is_delivered,
      bool_or(l.is_returned) AS is_returned,
      bool_or(l.is_cancelled) AS is_cancelled,
      MIN(l.source) AS source,
      MIN(l.payment_method) AS payment_method,
      MIN(l.courier_name) AS courier_name,
      MIN(l.city) AS city,
      MIN(l.customer_phone) AS customer_phone
    FROM l
    GROUP BY l.order_id
  ),
  joined AS (
    SELECT
      a.order_id,
      o.invoice_no,
      a.day,
      o.created_at,
      a.status,
      a.is_delivered, a.is_returned, a.is_cancelled,
      COALESCE(NULLIF(o.shipping_name,''), o.guest_name, 'Guest')::text AS customer_name,
      a.customer_phone, a.city, a.source, a.payment_method,
      a.courier_name, o.tracking_number,
      a.units, a.items,
      a.gross_sales, a.discounts, a.net_revenue,
      COALESCE(o.shipping_fee,0)::numeric AS shipping_fee,
      COALESCE(o.total,0)::numeric AS order_total,
      COALESCE(o.advance_amount,0)::numeric AS advance_amount,
      GREATEST(COALESCE(o.total,0) - COALESCE(o.advance_amount,0), 0)::numeric AS cod_expected,
      COALESCE(o.net_collected,0)::numeric AS courier_collected,
      COALESCE(o.actual_shipping_cost,0)::numeric AS courier_charge,
      COALESCE(o.reconciliation_status,'unmatched')::text AS reconciliation_status,
      a.cogs, a.cost_missing_units
    FROM agg a
    JOIN public.orders o ON o.id = a.order_id
    WHERE (_status IS NULL OR _status = '' OR _status = 'all' OR a.status = _status)
      AND (_courier IS NULL OR _courier = '' OR _courier = 'all' OR a.courier_name = _courier)
      AND (
        _search IS NULL OR _search = '' OR
        o.invoice_no ILIKE '%'||_search||'%' OR
        o.shipping_name ILIKE '%'||_search||'%' OR
        o.guest_name ILIKE '%'||_search||'%' OR
        o.shipping_phone ILIKE '%'||_search||'%' OR
        o.guest_phone ILIKE '%'||_search||'%' OR
        o.tracking_number ILIKE '%'||_search||'%' OR
        a.items::text ILIKE '%'||_search||'%'
      )
  )
  SELECT
    j.order_id, j.invoice_no, j.day, j.created_at, j.status,
    j.is_delivered, j.is_returned, j.is_cancelled,
    j.customer_name, j.customer_phone, j.city, j.source, j.payment_method,
    j.courier_name, j.tracking_number,
    j.units, j.items,
    j.gross_sales, j.discounts, j.net_revenue,
    j.shipping_fee, j.order_total, j.advance_amount,
    j.cod_expected,
    j.courier_collected,
    j.courier_charge,
    (j.courier_collected - GREATEST(j.cod_expected - j.courier_charge, 0))::numeric AS collection_diff,
    j.reconciliation_status,
    j.cogs,
    (j.net_revenue - j.cogs)::numeric AS gross_profit,
    (j.net_revenue - j.cogs - j.courier_charge)::numeric AS net_profit,
    j.cost_missing_units,
    COUNT(*) OVER () AS total_count
  FROM joined j
  ORDER BY j.day DESC, j.created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 200), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0)
$function$;

CREATE OR REPLACE FUNCTION public.rpt_order_ledger_summary(
  _brand_ids uuid[],
  _from date,
  _to date,
  _basis text DEFAULT 'delivered',
  _search text DEFAULT NULL,
  _status text DEFAULT NULL,
  _courier text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH r AS (
    SELECT * FROM public.rpt_order_ledger(_brand_ids, _from, _to, _basis, _search, _status, _courier, 1000000, 0)
  )
  SELECT jsonb_build_object(
    'orders', COALESCE(COUNT(*),0),
    'delivered_orders', COALESCE(SUM(CASE WHEN is_delivered THEN 1 ELSE 0 END),0),
    'returned_orders', COALESCE(SUM(CASE WHEN is_returned THEN 1 ELSE 0 END),0),
    'units', COALESCE(SUM(units),0),
    'order_value', COALESCE(SUM(order_total),0),
    'net_revenue', COALESCE(SUM(net_revenue),0),
    'advance_total', COALESCE(SUM(advance_amount),0),
    'cod_expected', COALESCE(SUM(cod_expected),0),
    'courier_collected', COALESCE(SUM(courier_collected),0),
    'courier_charge', COALESCE(SUM(courier_charge),0),
    'collection_diff', COALESCE(SUM(collection_diff),0),
    'cogs', COALESCE(SUM(cogs),0),
    'gross_profit', COALESCE(SUM(gross_profit),0),
    'net_profit', COALESCE(SUM(net_profit),0),
    'reconciled_orders', COALESCE(SUM(CASE WHEN courier_collected <> 0 THEN 1 ELSE 0 END),0),
    'cost_missing_units', COALESCE(SUM(cost_missing_units),0)
  )
  FROM r
$function$;

REVOKE ALL ON FUNCTION public.rpt_order_ledger(uuid[], date, date, text, text, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpt_order_ledger_summary(uuid[], date, date, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpt_order_ledger(uuid[], date, date, text, text, text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_order_ledger_summary(uuid[], date, date, text, text, text, text) TO authenticated, service_role;
