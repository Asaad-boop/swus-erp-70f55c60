-- Only confirmed-and-later orders should reserve stock.
-- New/on_hold orders (including awaiting-confirmation manual/web entries) must NOT reserve.

CREATE OR REPLACE FUNCTION public.order_stock_is_reserved_status(p_status public.order_status)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT p_status IN (
    'confirmed',
    'packaging',
    'ready_to_pack',
    'packed',
    'ready_to_ship',
    'courier_entry'
  );
$$;

-- Controlled resync: release reservations held by new/on_hold orders.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.product_variants WHERE is_active LOOP
    PERFORM public.inv_recalc_reservation(NULL, r.id);
  END LOOP;
  FOR r IN SELECT id FROM public.products WHERE COALESCE(is_combo, false) = false LOOP
    PERFORM public.inv_recalc_reservation(r.id, NULL);
  END LOOP;
END $$;