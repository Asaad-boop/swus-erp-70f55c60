CREATE OR REPLACE FUNCTION public.imp_sync_product_cost(_product_id uuid, _landed numeric)
RETURNS numeric LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE _cost numeric;
BEGIN
  -- Atomic: cost_price always follows the latest weighted-average cost (set by adjust_stock_v2)
  UPDATE public.products
     SET weighted_avg_cost = CASE WHEN coalesce(weighted_avg_cost,0) > 0 THEN weighted_avg_cost ELSE _landed END,
         cost_price = round(CASE WHEN coalesce(weighted_avg_cost,0) > 0 THEN weighted_avg_cost ELSE _landed END, 2)
   WHERE id = _product_id
  RETURNING cost_price INTO _cost;
  RETURN _cost;
END $$;
REVOKE ALL ON FUNCTION public.imp_sync_product_cost(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.imp_sync_product_cost(uuid, numeric) TO authenticated, service_role;