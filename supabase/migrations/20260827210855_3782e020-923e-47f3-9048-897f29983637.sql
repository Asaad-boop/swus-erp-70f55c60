CREATE OR REPLACE FUNCTION public.sync_order_status_from_courier()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  mapped public.order_status;
  cur public.order_status;
  allowed text[];
  rank_of jsonb := '{"confirmed":1,"ready_to_pack":2,"packaging":2,"packed":3,"ready_to_ship":4,"shipped":5,"in_transit":6}'::jsonb;
  cur_rank int;
  new_rank int;
BEGIN
  IF NEW.status IS NULL THEN RETURN NEW; END IF;
  mapped := public.map_courier_status_to_order(NEW.status);
  IF mapped IS NULL THEN RETURN NEW; END IF;

  SELECT status INTO cur FROM public.orders WHERE id = NEW.order_id;
  IF cur IS NULL OR cur = mapped THEN RETURN NEW; END IF;

  cur_rank := (rank_of ->> cur::text)::int;
  new_rank := (rank_of ->> mapped::text)::int;
  IF cur_rank IS NOT NULL AND new_rank IS NOT NULL AND new_rank < cur_rank THEN
    RETURN NEW; -- courier feed may never move the pipeline backwards
  END IF;

  allowed := CASE cur::text
    WHEN 'delivered'          THEN ARRAY['paid','completed','partial_delivered']
    WHEN 'partial_delivered'  THEN ARRAY['completed','partial_return']
    WHEN 'returned'           THEN ARRAY['paid_return','unpaid_return','partial_return','completed']
    WHEN 'paid_return'        THEN ARRAY['completed']
    WHEN 'unpaid_return'      THEN ARRAY['paid_return','completed']
    WHEN 'partial_return'     THEN ARRAY['completed']
    WHEN 'exchange'           THEN ARRAY['exchanged','delivered','completed']
    WHEN 'exchanged'          THEN ARRAY['completed']
    WHEN 'paid'               THEN ARRAY[]::text[]
    WHEN 'completed'          THEN ARRAY[]::text[]
    WHEN 'cancelled'          THEN ARRAY[]::text[]
    ELSE NULL
  END;

  IF allowed IS NOT NULL AND NOT (mapped::text = ANY (allowed)) THEN
    RETURN NEW;
  END IF;

  UPDATE public.orders SET status = mapped, updated_at = now() WHERE id = NEW.order_id;
  RETURN NEW;
END;
$function$;

UPDATE public.orders SET status = 'shipped', updated_at = now()
WHERE id = '7b21521e-c223-4f48-b5cb-56f6c4b470f4' AND status = 'ready_to_ship';