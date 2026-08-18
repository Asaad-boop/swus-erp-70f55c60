ALTER TABLE public.imp_po_release_items ADD COLUMN IF NOT EXISTS missing_qty integer NOT NULL DEFAULT 0;

ALTER TABLE public.imp_po_releases
  ADD COLUMN IF NOT EXISTS local_delivery_bdt numeric(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_note text,
  ADD COLUMN IF NOT EXISTS delivery_payment_id uuid;

ALTER TABLE public.imp_purchase_orders
  ADD COLUMN IF NOT EXISTS local_delivery_total_bdt numeric(18,4) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public._imp_refresh_po_totals(_po uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prod numeric(18,4) := 0;
  v_ship numeric(18,4) := 0;
  v_loc numeric(18,4) := 0;
  v_paid numeric(18,4) := 0;
  v_extras numeric(18,4) := 0;
  v_grand numeric(18,4) := 0;
BEGIN
  SELECT COALESCE(SUM(subtotal_bdt),0) INTO v_prod
  FROM public.imp_po_items
  WHERE po_id = _po;

  SELECT COALESCE(SUM(shipping_charge_bdt),0), COALESCE(SUM(local_courier_bdt),0)
    INTO v_ship, v_loc
  FROM public.imp_cartons
  WHERE po_id = _po AND status <> 'cancelled';

  SELECT COALESCE(SUM(amount_bdt),0) INTO v_paid
  FROM public.imp_payments
  WHERE po_id = _po AND COALESCE(is_reversed, false) = false;

  SELECT
    COALESCE(freight_cost_bdt,0)
    + COALESCE(customs_duty_bdt,0)
    + COALESCE(other_charges_bdt,0)
    + COALESCE(agent_commission_total_bdt,0)
    + COALESCE(local_delivery_total_bdt,0)
  INTO v_extras
  FROM public.imp_purchase_orders
  WHERE id = _po;

  v_grand := round(v_prod + v_ship + v_loc + COALESCE(v_extras,0), 4);

  UPDATE public.imp_purchase_orders SET
    product_subtotal_bdt = round(v_prod,4),
    shipping_total_bdt   = round(v_ship,4),
    local_courier_total_bdt = round(v_loc,4),
    grand_total_bdt = v_grand,
    paid_bdt = round(v_paid,4),
    due_bdt = GREATEST(round(v_grand - v_paid, 4), 0)
  WHERE id = _po;
END $$;