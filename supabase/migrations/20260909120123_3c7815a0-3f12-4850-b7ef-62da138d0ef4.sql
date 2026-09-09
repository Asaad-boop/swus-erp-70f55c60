CREATE OR REPLACE FUNCTION public.trg_webhook_purchase_received()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b uuid;
BEGIN
  IF COALESCE(NEW.delta, 0) > 0
     AND COALESCE(NEW.reason::text, '') IN ('purchase','purchase_receipt','import_receipt','receive','in','po_receipt','stock_in') THEN
    SELECT brand_id INTO b FROM public.products WHERE id = NEW.product_id;
    PERFORM public.enqueue_webhook_event('purchase.received', jsonb_build_object(
      'movement_id', NEW.id,
      'product_id', NEW.product_id,
      'variant_id', NEW.variant_id,
      'quantity', NEW.delta,
      'movement_type', NEW.reason,
      'reference', NEW.reference_id,
      'brand_id', b,
      'created_at', NEW.created_at
    ), b);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_webhook_purchase_received() FROM PUBLIC, anon, authenticated;