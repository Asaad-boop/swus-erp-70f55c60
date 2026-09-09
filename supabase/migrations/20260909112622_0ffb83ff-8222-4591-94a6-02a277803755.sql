-- ============ API clients ============
CREATE TABLE public.api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['orders:create','catalog:read'],
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX api_clients_key_hash_idx ON public.api_clients(key_hash);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_clients TO authenticated;
GRANT ALL ON public.api_clients TO service_role;
ALTER TABLE public.api_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_clients admin manage" ON public.api_clients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

-- ============ Webhook endpoints ============
CREATE TABLE public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  last_status text,
  last_delivered_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_endpoints_enabled_idx ON public.webhook_endpoints(is_enabled);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints TO service_role;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_endpoints admin manage" ON public.webhook_endpoints
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

-- ============ Webhook deliveries ============
CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_status_code integer,
  last_response text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_deliveries_pending_idx ON public.webhook_deliveries(status, next_attempt_at);
CREATE INDEX webhook_deliveries_endpoint_idx ON public.webhook_deliveries(endpoint_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_deliveries admin manage" ON public.webhook_deliveries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

-- updated_at triggers
CREATE TRIGGER api_clients_touch BEFORE UPDATE ON public.api_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER webhook_endpoints_touch BEFORE UPDATE ON public.webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Event queue helper ============
CREATE OR REPLACE FUNCTION public.enqueue_webhook_event(_event text, _payload jsonb, _brand_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.webhook_deliveries (endpoint_id, event, payload)
  SELECT e.id, _event, _payload
  FROM public.webhook_endpoints e
  WHERE e.is_enabled
    AND _event = ANY(e.events)
    AND (e.brand_id IS NULL OR _brand_id IS NULL OR e.brand_id = _brand_id);
END;
$$;

-- ============ Order events ============
CREATE OR REPLACE FUNCTION public.trg_webhook_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base jsonb;
BEGIN
  base := jsonb_build_object(
    'order_id', NEW.id,
    'invoice_no', NEW.invoice_no,
    'brand_id', NEW.brand_id,
    'status', NEW.status,
    'payment_status', NEW.payment_status,
    'total', NEW.total,
    'customer_name', COALESCE(NEW.shipping_name, NEW.guest_name),
    'customer_phone', COALESCE(NEW.shipping_phone, NEW.guest_phone),
    'city', NEW.shipping_city,
    'source', NEW.source,
    'created_at', NEW.created_at
  );

  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_webhook_event('order.created', base, NEW.brand_id);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.enqueue_webhook_event(
      'order.status_changed',
      base || jsonb_build_object('previous_status', OLD.status), NEW.brand_id);
    IF NEW.status::text IN ('cancelled','fake') THEN
      PERFORM public.enqueue_webhook_event('order.cancelled', base, NEW.brand_id);
    END IF;
    IF NEW.status::text IN ('shipped','in_transit','delivered','returned','partial_delivered') THEN
      PERFORM public.enqueue_webhook_event('order.delivery_status_changed', base, NEW.brand_id);
    END IF;
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    PERFORM public.enqueue_webhook_event(
      'order.payment_status_changed',
      base || jsonb_build_object('previous_payment_status', OLD.payment_status), NEW.brand_id);
    IF NEW.payment_status::text = 'refunded' THEN
      PERFORM public.enqueue_webhook_event('order.refunded', base, NEW.brand_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER webhook_orders_aiu
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_orders();

-- ============ Product / inventory events ============
CREATE OR REPLACE FUNCTION public.trg_webhook_products()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base jsonb;
BEGIN
  base := jsonb_build_object(
    'product_id', NEW.id,
    'title', NEW.title,
    'slug', NEW.slug,
    'sku', NEW.sku,
    'barcode', NEW.barcode,
    'brand_id', NEW.brand_id,
    'price', NEW.price,
    'old_price', NEW.old_price,
    'stock', NEW.stock,
    'available_stock', NEW.available_stock,
    'is_active', NEW.is_active
  );

  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_webhook_event('product.created', base, NEW.brand_id);
    RETURN NEW;
  END IF;

  IF NEW.price IS DISTINCT FROM OLD.price OR NEW.old_price IS DISTINCT FROM OLD.old_price THEN
    PERFORM public.enqueue_webhook_event(
      'product.price_changed',
      base || jsonb_build_object('previous_price', OLD.price), NEW.brand_id);
  END IF;

  IF NEW.stock IS DISTINCT FROM OLD.stock OR NEW.available_stock IS DISTINCT FROM OLD.available_stock THEN
    PERFORM public.enqueue_webhook_event(
      'inventory.stock_changed',
      base || jsonb_build_object('previous_stock', OLD.stock), NEW.brand_id);
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.sku IS DISTINCT FROM OLD.sku
     OR NEW.image IS DISTINCT FROM OLD.image
     OR NEW.description IS DISTINCT FROM OLD.description THEN
    PERFORM public.enqueue_webhook_event('product.updated', base, NEW.brand_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER webhook_products_aiu
AFTER INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_products();

CREATE OR REPLACE FUNCTION public.trg_webhook_variant_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b uuid;
BEGIN
  IF NEW.stock IS DISTINCT FROM OLD.stock OR NEW.available_stock IS DISTINCT FROM OLD.available_stock THEN
    SELECT brand_id INTO b FROM public.products WHERE id = NEW.product_id;
    PERFORM public.enqueue_webhook_event('inventory.stock_changed', jsonb_build_object(
      'product_id', NEW.product_id,
      'variant_id', NEW.id,
      'sku', NEW.sku,
      'color_name', NEW.color_name,
      'stock', NEW.stock,
      'available_stock', NEW.available_stock,
      'previous_stock', OLD.stock,
      'brand_id', b
    ), b);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER webhook_variant_stock_au
AFTER UPDATE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_variant_stock();

-- ============ Purchase received events ============
CREATE OR REPLACE FUNCTION public.trg_webhook_purchase_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b uuid;
BEGIN
  IF COALESCE(NEW.quantity, 0) > 0
     AND COALESCE(NEW.movement_type::text, '') IN ('purchase','purchase_receipt','import_receipt','receive','in') THEN
    SELECT brand_id INTO b FROM public.products WHERE id = NEW.product_id;
    PERFORM public.enqueue_webhook_event('purchase.received', jsonb_build_object(
      'movement_id', NEW.id,
      'product_id', NEW.product_id,
      'variant_id', NEW.variant_id,
      'quantity', NEW.quantity,
      'movement_type', NEW.movement_type,
      'reference', NEW.reference_id,
      'brand_id', b,
      'created_at', NEW.created_at
    ), b);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER webhook_purchase_received_ai
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_purchase_received();