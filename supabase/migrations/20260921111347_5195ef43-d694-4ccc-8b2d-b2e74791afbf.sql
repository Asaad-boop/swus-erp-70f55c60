CREATE OR REPLACE FUNCTION public.order_stock_is_reserved_status(p_status order_status)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT p_status IN (
    'packaging',
    'ready_to_pack',
    'packed',
    'ready_to_ship',
    'courier_entry'
  );
$function$;

-- Recalculate reservations for every product/variant under the new rule
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT v.product_id AS pid, v.id AS vid FROM public.product_variants v
    UNION ALL
    SELECT p.id AS pid, NULL::uuid AS vid FROM public.products p
  LOOP
    BEGIN
      PERFORM public.inv_recalc_reservation(r.pid, r.vid);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $do$;