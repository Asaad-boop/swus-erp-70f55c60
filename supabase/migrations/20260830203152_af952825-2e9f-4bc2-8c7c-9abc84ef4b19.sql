-- P3: canonical low-stock definition = available_stock <= effective threshold
-- effective threshold = reorder_point if > 0, else low_stock_threshold, else 5

-- 1) Canonical view
CREATE OR REPLACE VIEW public.inv_low_stock
WITH (security_invoker = true) AS
SELECT
  p.id AS product_id,
  NULL::uuid AS variant_id,
  p.title AS product_name,
  p.sku,
  NULL::text AS variant_name,
  p.brand_id,
  p.stock,
  p.reserved_stock,
  p.available_stock,
  CASE
    WHEN COALESCE(p.reorder_point, 0) > 0 THEN p.reorder_point
    WHEN COALESCE(p.low_stock_threshold, 0) > 0 THEN p.low_stock_threshold
    ELSE 5
  END AS effective_threshold
FROM public.products p
WHERE p.is_active
  AND NOT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id AND v.is_active)
  AND p.available_stock <= CASE
    WHEN COALESCE(p.reorder_point, 0) > 0 THEN p.reorder_point
    WHEN COALESCE(p.low_stock_threshold, 0) > 0 THEN p.low_stock_threshold
    ELSE 5
  END
UNION ALL
SELECT
  p.id AS product_id,
  v.id AS variant_id,
  p.title AS product_name,
  v.sku,
  COALESCE(v.color_name, v.sku) AS variant_name,
  p.brand_id,
  v.stock,
  v.reserved_stock,
  v.available_stock,
  CASE
    WHEN COALESCE(v.reorder_point, 0) > 0 THEN v.reorder_point
    WHEN COALESCE(p.reorder_point, 0) > 0 THEN p.reorder_point
    WHEN COALESCE(p.low_stock_threshold, 0) > 0 THEN p.low_stock_threshold
    ELSE 5
  END AS effective_threshold
FROM public.product_variants v
JOIN public.products p ON p.id = v.product_id
WHERE p.is_active AND v.is_active
  AND v.available_stock <= CASE
    WHEN COALESCE(v.reorder_point, 0) > 0 THEN v.reorder_point
    WHEN COALESCE(p.reorder_point, 0) > 0 THEN p.reorder_point
    WHEN COALESCE(p.low_stock_threshold, 0) > 0 THEN p.low_stock_threshold
    ELSE 5
  END;

GRANT SELECT ON public.inv_low_stock TO authenticated;

-- 2) Unified alert trigger (product level): available_stock based
CREATE OR REPLACE FUNCTION public.check_and_create_low_stock_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _threshold integer;
BEGIN
  SELECT CASE
    WHEN COALESCE(reorder_point, 0) > 0 THEN reorder_point
    WHEN COALESCE(low_stock_threshold, 0) > 0 THEN low_stock_threshold
    ELSE 5
  END INTO _threshold
  FROM public.products WHERE id = NEW.id;

  IF COALESCE(NEW.available_stock, NEW.stock) <= _threshold THEN
    INSERT INTO public.low_stock_alerts (product_id, current_stock, threshold)
    SELECT NEW.id, COALESCE(NEW.available_stock, NEW.stock), _threshold
    WHERE NOT EXISTS (
      SELECT 1 FROM public.low_stock_alerts
      WHERE product_id = NEW.id AND variant_id IS NULL AND is_resolved = false
    );
  ELSE
    UPDATE public.low_stock_alerts
       SET is_resolved = true, resolved_at = now()
     WHERE product_id = NEW.id AND variant_id IS NULL AND is_resolved = false;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3) Variant-level alert function + trigger (was missing)
CREATE OR REPLACE FUNCTION public.check_variant_low_stock_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _threshold integer;
BEGIN
  SELECT CASE
    WHEN COALESCE(v.reorder_point, 0) > 0 THEN v.reorder_point
    WHEN COALESCE(p.reorder_point, 0) > 0 THEN p.reorder_point
    WHEN COALESCE(p.low_stock_threshold, 0) > 0 THEN p.low_stock_threshold
    ELSE 5
  END INTO _threshold
  FROM public.product_variants v
  JOIN public.products p ON p.id = v.product_id
  WHERE v.id = NEW.id;

  IF COALESCE(NEW.available_stock, NEW.stock) <= _threshold THEN
    INSERT INTO public.low_stock_alerts (product_id, variant_id, current_stock, threshold)
    SELECT NEW.product_id, NEW.id, COALESCE(NEW.available_stock, NEW.stock), _threshold
    WHERE NOT EXISTS (
      SELECT 1 FROM public.low_stock_alerts
      WHERE variant_id = NEW.id AND is_resolved = false
    );
  ELSE
    UPDATE public.low_stock_alerts
       SET is_resolved = true, resolved_at = now()
     WHERE variant_id = NEW.id AND is_resolved = false;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_variant_low_stock_alert ON public.product_variants;
CREATE TRIGGER trg_variant_low_stock_alert
  AFTER UPDATE OF stock, available_stock, reserved_stock ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.check_variant_low_stock_alert();

REVOKE ALL ON FUNCTION public.check_variant_low_stock_alert() FROM PUBLIC, anon, authenticated;