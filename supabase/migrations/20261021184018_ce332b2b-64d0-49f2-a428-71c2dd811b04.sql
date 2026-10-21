CREATE OR REPLACE FUNCTION public.auto_convert_abandoned_cart()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_phone TEXT;
BEGIN
  v_phone := COALESCE(NEW.shipping_phone, NEW.guest_phone);
  IF v_phone IS NULL OR length(regexp_replace(v_phone, '\D', '', 'g')) < 10 THEN
    RETURN NEW;
  END IF;
  -- Phone match only: products are cross-listed between brand stores,
  -- so the cart's brand can differ from the order's brand.
  UPDATE public.abandoned_carts ac
  SET is_converted = true, converted_order_id = NEW.id, updated_at = now()
  WHERE ac.is_converted = false
    AND right(regexp_replace(COALESCE(ac.customer_phone,''), '\D', '', 'g'), 11)
        = right(regexp_replace(v_phone, '\D', '', 'g'), 11)
    AND ac.updated_at >= now() - INTERVAL '24 hours';
  RETURN NEW;
END;
$function$;

UPDATE public.abandoned_carts ac
SET is_converted = true, converted_order_id = m.order_id, updated_at = now()
FROM (
  SELECT c.id AS cart_id, (
    SELECT o.id FROM public.orders o
    WHERE right(regexp_replace(COALESCE(o.shipping_phone, o.guest_phone,''), '\D','','g'),11)
        = right(regexp_replace(COALESCE(c.customer_phone,''), '\D','','g'),11)
      AND o.created_at >= c.created_at
      AND o.created_at <= c.updated_at + INTERVAL '24 hours'
    ORDER BY o.created_at LIMIT 1
  ) AS order_id
  FROM public.abandoned_carts c
  WHERE c.is_converted = false
    AND length(regexp_replace(COALESCE(c.customer_phone,''), '\D','','g')) >= 10
    AND c.created_at >= now() - INTERVAL '30 days'
) m
WHERE ac.id = m.cart_id AND m.order_id IS NOT NULL;