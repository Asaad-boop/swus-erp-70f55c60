CREATE OR REPLACE FUNCTION public.auto_flag_preorder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag boolean := false;
  v_expected date;
BEGIN
  -- Shudhu product-level pre-order flag-i pre-order banabe.
  -- Stock 0 / minus thakle order neya jabe, kintu seta pre-order NA.
  SELECT bool_or(p.is_preorder), max(p.preorder_expected_date)
    INTO v_flag, v_expected
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
   WHERE oi.order_id = NEW.order_id;

  IF v_flag IS TRUE THEN
    UPDATE public.orders
       SET is_preorder = true,
           preorder_expected_date = coalesce(preorder_expected_date, v_expected)
     WHERE id = NEW.order_id
       AND preorder_converted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;