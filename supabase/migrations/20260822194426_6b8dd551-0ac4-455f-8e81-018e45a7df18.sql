CREATE OR REPLACE FUNCTION public.trg_sync_product_stock_from_variants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid := COALESCE(NEW.product_id, OLD.product_id);
  s int;
  r int;
BEGIN
  SELECT COALESCE(SUM(stock),0), COALESCE(SUM(reserved_stock),0)
    INTO s, r
  FROM public.product_variants
  WHERE product_id = pid AND is_active;

  UPDATE public.products
     SET stock = s, reserved_stock = r
   WHERE id = pid
     AND (stock IS DISTINCT FROM s OR reserved_stock IS DISTINCT FROM r);

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_variants_sync_product_stock ON public.product_variants;
CREATE TRIGGER trg_variants_sync_product_stock
AFTER INSERT OR UPDATE OF stock, reserved_stock, is_active OR DELETE
ON public.product_variants
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_product_stock_from_variants();

UPDATE public.products p
   SET stock = v.s, reserved_stock = v.r
  FROM (
    SELECT product_id, COALESCE(SUM(stock),0) s, COALESCE(SUM(reserved_stock),0) r
    FROM public.product_variants WHERE is_active GROUP BY product_id
  ) v
 WHERE v.product_id = p.id
   AND (p.stock IS DISTINCT FROM v.s OR p.reserved_stock IS DISTINCT FROM v.r);