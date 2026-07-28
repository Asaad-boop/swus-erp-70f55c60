CREATE OR REPLACE FUNCTION public.tg_orders_stock_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  items jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_id', oi.product_id,
    'variant_id', oi.variant_id,
    'qty', oi.quantity
  )), '[]'::jsonb)
  INTO items
  FROM public.order_items oi
  WHERE oi.order_id = NEW.id;

  IF TG_OP = 'INSERT' THEN
    IF public.order_stock_is_reserved_status(NEW.status) THEN
      PERFORM public.reserve_stock(NEW.id, items);
    END IF;
    -- On initial order insert there are usually no line items yet; line-item insert trigger intentionally skips
    -- the first few seconds to avoid double-deducting. Confirmed manual creations are covered when status changes.
    RETURN NEW;
  END IF;

  IF public.order_stock_is_reserved_status(NEW.status) AND NOT public.order_stock_is_reserved_status(OLD.status) THEN
    PERFORM public.reserve_stock(NEW.id, items);
  ELSIF NOT public.order_stock_is_reserved_status(NEW.status) AND public.order_stock_is_reserved_status(OLD.status) THEN
    PERFORM public.release_stock_reservation(NEW.id);
  END IF;

  PERFORM public.apply_order_stock_ledger(NEW.id, OLD.status, NEW.status);

  RETURN NEW;
END;
$$;