ALTER TABLE public.imp_po_releases
  ADD COLUMN IF NOT EXISTS shipping_weight_kg numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_rate_per_kg numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_charge_bdt numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_payment_id uuid REFERENCES public.imp_payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shipping_note text;

CREATE OR REPLACE FUNCTION public._imp_sync_po_actual_shipping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po uuid := COALESCE(NEW.po_id, OLD.po_id);
  v_sum numeric;
BEGIN
  SELECT COALESCE(SUM(shipping_charge_bdt), 0) INTO v_sum
  FROM public.imp_po_releases WHERE po_id = v_po;

  -- Jodi kono release e shipping deya na thake, purono PO-level shipping-i thakuk
  IF v_sum > 0 THEN
    UPDATE public.imp_purchase_orders
      SET shipping_total_bdt = v_sum
      WHERE id = v_po;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_imp_sync_po_actual_shipping ON public.imp_po_releases;
CREATE TRIGGER trg_imp_sync_po_actual_shipping
AFTER INSERT OR UPDATE OF shipping_charge_bdt OR DELETE ON public.imp_po_releases
FOR EACH ROW EXECUTE FUNCTION public._imp_sync_po_actual_shipping();