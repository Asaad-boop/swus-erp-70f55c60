CREATE OR REPLACE FUNCTION public.map_courier_status_to_order(_raw text)
RETURNS order_status
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fn$
DECLARE k text;
BEGIN
  IF _raw IS NULL THEN RETURN NULL; END IF;
  k := lower(regexp_replace(trim(_raw), '[\s\-]+', '_', 'g'));
  IF k = '' THEN RETURN NULL; END IF;

  -- Booked / awaiting pickup
  IF k IN ('pending','in_review','pickup_requested','waiting_for_pickup','waiting_for_pick_up','assigned_for_pickup','pickup_rescheduled') THEN RETURN 'ready_to_ship'::order_status; END IF;

  -- Picked up by rider
  IF k IN ('picked','pickup','picked_up','collected') THEN RETURN 'shipped'::order_status; END IF;

  -- Moving through network
  IF k IN ('at_the_sorting_hub','at_sorting_hub','sorting_hub','in_transit','received_at_last_mile_hub','last_mile_hub','hub_received','at_delivery_hub','on_the_way_to_delivery_hub','forwarded','reached','rider_assigned','assigned_for_delivery','on_delivery','out_for_delivery') THEN RETURN 'in_transit'::order_status; END IF;

  -- Final delivery outcomes
  IF k IN ('delivered','delivery_success') THEN RETURN 'delivered'::order_status; END IF;
  IF k IN ('partial_delivery','partial_delivered') THEN RETURN 'partial_delivered'::order_status; END IF;

  -- Return outcomes
  IF k IN ('partial_delivered_return','partial_return') THEN RETURN 'partial_return'::order_status; END IF;
  IF k IN ('paid_return') THEN RETURN 'paid_return'::order_status; END IF;
  IF k IN ('unpaid_return') THEN RETURN 'unpaid_return'::order_status; END IF;
  IF k IN ('returned','return_completed') THEN RETURN 'returned'::order_status; END IF;
  IF k IN ('return','returning','return_processing','pending_return','return_in_transit','return_to_pickup','return_to_merchant','on_the_way_to_return','return_rescheduled') THEN RETURN 'return_in_transit'::order_status; END IF;

  -- Exchange
  IF k IN ('exchange','exchanged') THEN RETURN 'exchange'::order_status; END IF;

  -- Cancellation
  IF k IN ('cancelled','canceled','pickup_cancelled','cancelled_by_courier') THEN RETURN 'cancelled'::order_status; END IF;

  -- Problem / temporary states (incl. Steadfast *_approval_pending)
  IF k IN ('hold','on_hold','delivery_hold','delivery_failed','delivery_rescheduled','pickup_failed','lost','damaged','merchant_confirmed','customer_unreachable','unknown','unknown_approval','delivered_approval_pending','partial_delivered_approval_pending','cancelled_approval_pending','unknown_approval_pending','return_approval_pending','hold_approval_pending') THEN RETURN 'on_hold'::order_status; END IF;

  -- Payment/settlement events are NOT fulfillment: ignore
  RETURN NULL;
END;
$fn$;