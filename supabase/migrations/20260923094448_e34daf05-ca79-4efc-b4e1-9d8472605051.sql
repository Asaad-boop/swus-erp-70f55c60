CREATE OR REPLACE FUNCTION public.capture_order_confirmer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.status::text = 'confirmed'
     AND OLD.status::text IS DISTINCT FROM 'confirmed'
     AND NEW.confirmed_by IS NULL
     AND auth.uid() IS NOT NULL THEN
    NEW.confirmed_by := auth.uid();
    NEW.confirmed_at := coalesce(NEW.confirmed_at, now());
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_capture_order_confirmer ON public.orders;
CREATE TRIGGER trg_capture_order_confirmer
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.capture_order_confirmer();

WITH known_confirmers AS (
  SELECT DISTINCT ON (h.order_id)
    h.order_id,
    h.changed_by
  FROM public.order_status_history h
  WHERE h.to_status::text = 'confirmed'
    AND h.changed_by IS NOT NULL
  ORDER BY h.order_id, h.created_at DESC
)
UPDATE public.orders o
SET confirmed_by = k.changed_by
FROM known_confirmers k
WHERE o.id = k.order_id
  AND o.confirmed_by IS NULL;