CREATE OR REPLACE FUNCTION public.imp_adjust_reserved(_product_id uuid, _variant_id uuid, _delta integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _delta = 0 THEN RETURN; END IF;
  IF _variant_id IS NOT NULL THEN
    UPDATE public.product_variants
       SET reserved_stock = GREATEST(0, COALESCE(reserved_stock,0) + _delta)
     WHERE id = _variant_id;
  END IF;
  IF _product_id IS NOT NULL THEN
    UPDATE public.products
       SET reserved_stock = GREATEST(0, COALESCE(reserved_stock,0) + _delta)
     WHERE id = _product_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.imp_adjust_reserved(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.imp_adjust_reserved(uuid, uuid, integer) TO authenticated, service_role;