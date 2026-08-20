-- 1) Align the DB-side courier status mapper with the app mapper
CREATE OR REPLACE FUNCTION public.map_courier_status_to_order(_raw text)
RETURNS public.order_status
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE k text;
BEGIN
  IF _raw IS NULL THEN RETURN NULL; END IF;
  k := lower(regexp_replace(trim(_raw), '[\s\-]+', '_', 'g'));
  IF k = '' THEN RETURN NULL; END IF;

  IF k IN ('delivered') THEN RETURN 'delivered'::order_status; END IF;
  IF k IN ('partial_delivery','partial_delivered') THEN RETURN 'partial_delivered'::order_status; END IF;
  IF k IN ('partial_delivered_return','partial_return') THEN RETURN 'partial_return'::order_status; END IF;
  IF k IN ('paid_return') THEN RETURN 'paid_return'::order_status; END IF;
  IF k IN ('unpaid_return') THEN RETURN 'unpaid_return'::order_status; END IF;
  IF k IN ('returned') THEN RETURN 'returned'::order_status; END IF;
  -- single canonical "return on the way" status (was split pending_return / return_in_transit)
  IF k IN ('return','returning','return_processing','pending_return','return_in_transit','return_to_pickup','return_to_merchant') THEN RETURN 'return_in_transit'::order_status; END IF;
  IF k IN ('exchange','exchanged') THEN RETURN 'exchange'::order_status; END IF;
  IF k IN ('cancelled','canceled','pickup_cancelled','cancelled_by_courier') THEN RETURN 'cancelled'::order_status; END IF;
  IF k IN ('hold','on_hold','delivery_hold','delivery_failed','lost','damaged','delivery_rescheduled','return_rescheduled','pickup_rescheduled','merchant_confirmed') THEN RETURN 'on_hold'::order_status; END IF;
  IF k IN ('picked','pickup','picked_up','collected','at_the_sorting_hub','at_sorting_hub','in_transit','received_at_last_mile_hub','assigned_for_delivery','on_delivery','out_for_delivery','hub_received','rider_assigned','forwarded','reached','sorting_hub','last_mile_hub','at_delivery_hub','on_the_way_to_delivery_hub') THEN RETURN 'in_transit'::order_status; END IF;
  IF k IN ('pickup_requested','assigned_for_pickup','pickup_failed','pending') THEN RETURN 'ready_to_ship'::order_status; END IF;
  RETURN NULL;
END;
$$;

-- 2) Guard the trigger: a courier ping must never downgrade a resolved outcome
CREATE OR REPLACE FUNCTION public.sync_order_status_from_courier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mapped public.order_status;
  cur public.order_status;
  allowed text[];
BEGIN
  IF NEW.status IS NULL THEN RETURN NEW; END IF;
  mapped := public.map_courier_status_to_order(NEW.status);
  IF mapped IS NULL THEN RETURN NEW; END IF;

  SELECT status INTO cur FROM public.orders WHERE id = NEW.order_id;
  IF cur IS NULL OR cur = mapped THEN RETURN NEW; END IF;

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
    RETURN NEW; -- illegal downgrade from an already resolved state
  END IF;

  UPDATE public.orders SET status = mapped, updated_at = now() WHERE id = NEW.order_id;
  RETURN NEW;
END;
$$;

-- 3) Collapse the duplicate "return on the way" status
UPDATE public.orders SET status = 'return_in_transit', updated_at = now()
WHERE status = 'pending_return';

-- 4) Returns that the courier invoice already settled (return fee charged,
--    nothing collected) are finished returns, not in-transit ones.
UPDATE public.orders o
SET status = 'returned', updated_at = now()
FROM erp_reconciliation_rows r
WHERE r.matched_order_id = o.id
  AND o.status = 'return_in_transit'
  AND coalesce(r.return_fee,0) > 0
  AND coalesce(r.collected,0) = 0;

-- 5) Stale delivered_at on returned parcels pollutes delivery reports
UPDATE public.orders SET delivered_at = NULL
WHERE status IN ('returned','return_in_transit','partial_return','paid_return','unpaid_return')
  AND delivered_at IS NOT NULL;