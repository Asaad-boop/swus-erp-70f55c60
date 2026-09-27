CREATE OR REPLACE FUNCTION public.orders_recompute_total_on_billing()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.shipping_fee IS DISTINCT FROM OLD.shipping_fee
     OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount THEN
    IF coalesce(NEW.shipping_fee,0) < 0 OR coalesce(NEW.discount_amount,0) < 0 THEN
      RAISE EXCEPTION 'Shipping/discount negative hote parbe na';
    END IF;
    -- Server decides the total: shift by the delta so any other components stay intact
    NEW.total := greatest(0, coalesce(OLD.total,0)
      + (coalesce(NEW.shipping_fee,0) - coalesce(OLD.shipping_fee,0))
      - (coalesce(NEW.discount_amount,0) - coalesce(OLD.discount_amount,0)));
  END IF;
  IF coalesce(NEW.advance_amount,0) < 0 THEN
    RAISE EXCEPTION 'Advance negative hote parbe na';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_recompute_total_on_billing ON public.orders;
CREATE TRIGGER trg_orders_recompute_total_on_billing
BEFORE UPDATE OF shipping_fee, discount_amount, advance_amount, total ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_recompute_total_on_billing();