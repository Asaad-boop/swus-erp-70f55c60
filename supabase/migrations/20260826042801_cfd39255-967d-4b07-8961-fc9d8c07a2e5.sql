CREATE OR REPLACE FUNCTION public._imp_refresh_po_totals(_po uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prod numeric(18,4) := 0;
  v_ship numeric(18,4) := 0;
  v_rel_ship numeric(18,4) := 0;
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

  SELECT COALESCE(SUM(shipping_charge_bdt),0) INTO v_rel_ship
  FROM public.imp_po_releases
  WHERE po_id = _po;

  v_ship := v_ship + v_rel_ship;

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

-- Release shipping changes must recompute the full PO totals, not just shipping_total.
CREATE OR REPLACE FUNCTION public._imp_sync_po_actual_shipping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po uuid := COALESCE(NEW.po_id, OLD.po_id);
BEGIN
  IF v_po IS NOT NULL THEN
    PERFORM public._imp_refresh_po_totals(v_po);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

-- Recompute every PO with the corrected formula.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.imp_purchase_orders LOOP
    PERFORM public._imp_refresh_po_totals(r.id);
  END LOOP;
END $$;