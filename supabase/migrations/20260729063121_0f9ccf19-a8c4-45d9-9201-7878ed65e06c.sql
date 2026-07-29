CREATE OR REPLACE FUNCTION public.erp_order_status_counts(
  _brand_ids uuid[],
  _search text DEFAULT NULL,
  _source text DEFAULT NULL,
  _courier text DEFAULT NULL,
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _printed text DEFAULT 'all'
)
RETURNS TABLE(status text, cnt bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT o.status::text, count(*)::bigint
  FROM public.orders o
  WHERE o.brand_id = ANY(_brand_ids)
    AND o.status <> 'new'::order_status
    AND (
      o.status <> 'confirmed'::order_status
      OR o.source IS NULL
      OR o.source::text NOT IN ('website','pixel','utm')
      OR o.web_status::text = 'complete'
    )
    AND (_printed IS DISTINCT FROM 'printed' OR o.printed_at IS NOT NULL)
    AND (_printed IS DISTINCT FROM 'unprinted' OR o.printed_at IS NULL)
    AND (_source IS NULL OR o.source::text = _source)
    AND (_courier IS NULL OR o.courier_name = _courier)
    AND (_date_from IS NULL OR o.created_at >= _date_from)
    AND (_date_to IS NULL OR o.created_at <= _date_to)
    AND (
      _search IS NULL OR btrim(_search) = '' OR
      o.shipping_name ILIKE '%'||btrim(_search)||'%' OR
      o.shipping_phone ILIKE '%'||btrim(_search)||'%' OR
      o.guest_name ILIKE '%'||btrim(_search)||'%' OR
      o.guest_phone ILIKE '%'||btrim(_search)||'%' OR
      o.tracking_number ILIKE '%'||btrim(_search)||'%'
    )
  GROUP BY o.status;
$$;

GRANT EXECUTE ON FUNCTION public.erp_order_status_counts(uuid[], text, text, text, timestamptz, timestamptz, text) TO authenticated;