CREATE OR REPLACE FUNCTION public.courier_bucket_of(_raw text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE x text;
BEGIN
  IF _raw IS NULL THEN RETURN NULL; END IF;
  x := regexp_replace(lower(trim(_raw)), '[\s-]+', '_', 'g');
  IF x = '' THEN RETURN NULL; END IF;
  IF x ~ '(^delivered$|delivered$|partial.?deliver|delivery.?success)' THEN RETURN 'delivered'; END IF;
  IF x ~ 'out.?for.?deliver|on.?the.?way|on_delivery|assigned_for_delivery' THEN RETURN 'out_for_delivery'; END IF;
  IF x ~ 'cancel' THEN RETURN 'cancelled'; END IF;
  IF x ~ 'return' THEN RETURN 'returned'; END IF;
  IF x ~ '^hold$|on_hold|lost|damag|fail|unsuccess|reject' THEN RETURN 'on_hold'; END IF;
  IF x ~ 'transit|forwarded|reached|sorting_hub|last_mile_hub|received_at' THEN RETURN 'in_transit'; END IF;
  IF x ~ 'picked|pick_up|collected' THEN RETURN 'picked_up'; END IF;
  RETURN 'pending';
END $$;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_bucket text;
CREATE INDEX IF NOT EXISTS idx_orders_courier_bucket ON public.orders (courier_bucket) WHERE courier_bucket IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_order_courier_bucket()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _oid uuid := coalesce(NEW.order_id, OLD.order_id); _b text;
BEGIN
  IF _oid IS NULL THEN RETURN NULL; END IF;
  SELECT public.courier_bucket_of(status) INTO _b FROM public.courier_shipments
   WHERE order_id = _oid ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  UPDATE public.orders SET courier_bucket = _b WHERE id = _oid AND courier_bucket IS DISTINCT FROM _b;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.sync_order_courier_bucket() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_order_courier_bucket ON public.courier_shipments;
CREATE TRIGGER trg_sync_order_courier_bucket
AFTER INSERT OR UPDATE OF status, updated_at, order_id OR DELETE ON public.courier_shipments
FOR EACH ROW EXECUTE FUNCTION public.sync_order_courier_bucket();

UPDATE public.orders o SET courier_bucket = s.b
FROM (SELECT DISTINCT ON (order_id) order_id, public.courier_bucket_of(status) b
      FROM public.courier_shipments WHERE order_id IS NOT NULL
      ORDER BY order_id, updated_at DESC NULLS LAST) s
WHERE o.id = s.order_id AND o.courier_bucket IS DISTINCT FROM s.b;