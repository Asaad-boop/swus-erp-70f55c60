WITH latest AS (
  SELECT DISTINCT ON (cs.order_id) cs.order_id,
         lower(replace(replace(cs.status,' ','_'),'-','_')) AS raw
  FROM public.courier_shipments cs
  WHERE cs.provider ILIKE '%pathao%'
  ORDER BY cs.order_id, cs.created_at DESC
), targets AS (
  SELECT o.id, o.status AS old_status
  FROM public.orders o
  JOIN latest l ON l.order_id = o.id
  WHERE l.raw = 'partial_delivered'
    AND o.status IN ('returned','paid_return','unpaid_return','pending_return','return_in_transit','partial_return')
), upd AS (
  UPDATE public.orders o
  SET status = 'partial_delivered', updated_at = now()
  FROM targets t
  WHERE o.id = t.id
  RETURNING o.id, t.old_status
)
INSERT INTO public.order_status_history (order_id, from_status, to_status, reason, note)
SELECT id, old_status::order_status, 'partial_delivered'::order_status, 'partial_delivered_backfill', 'pathao raw: partial_delivered'
FROM upd;