WITH activity_confirmers AS (
  SELECT DISTINCT ON (al.order_id)
    al.order_id,
    al.user_id
  FROM public.activity_logs al
  WHERE al.user_id IS NOT NULL
    AND al.action = 'status_changed'
    AND al.new_value ->> 'status' = 'confirmed'
  ORDER BY al.order_id, al.created_at DESC
)
UPDATE public.orders o
SET confirmed_by = a.user_id
FROM activity_confirmers a
WHERE o.id = a.order_id
  AND o.confirmed_by IS NULL;