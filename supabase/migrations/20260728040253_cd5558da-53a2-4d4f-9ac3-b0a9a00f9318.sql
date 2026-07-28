CREATE OR REPLACE FUNCTION public.order_stock_net_multiplier(p_status public.order_status)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN public.order_stock_is_deducted_status(p_status) THEN -1 ELSE 0
  END + CASE
    WHEN public.order_stock_restore_multiplier(p_status) > 0 THEN 1 ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.tg_order_items_recompute_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected_order_id uuid;
  order_status public.order_status;
  net_mult integer := 0;
  old_product_id uuid;
  old_variant_id uuid;
  new_product_id uuid;
  new_variant_id uuid;
  old_qty integer := 0;
  new_qty integer := 0;
  old_combo boolean := false;
  new_combo boolean := false;
  idem text;
BEGIN
  affected_order_id := COALESCE(NEW.order_id, OLD.order_id);

  SELECT status INTO order_status FROM public.orders WHERE id = affected_order_id;
  net_mult := public.order_stock_net_multiplier(order_status);

  IF TG_OP IN ('UPDATE','DELETE') THEN
    old_product_id := OLD.product_id;
    old_variant_id := OLD.variant_id;
    old_qty := COALESCE(OLD.quantity, 0)::integer;
    SELECT COALESCE(is_combo, false) INTO old_combo FROM public.products WHERE id = old_product_id;
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') THEN
    new_product_id := NEW.product_id;
    new_variant_id := NEW.variant_id;
    new_qty := COALESCE(NEW.quantity, 0)::integer;
    SELECT COALESCE(is_combo, false) INTO new_combo FROM public.products WHERE id = new_product_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF net_mult <> 0 AND old_product_id IS NOT NULL AND old_qty > 0 AND NOT old_combo THEN
      idem := 'order-stock:item-delete:' || affected_order_id::text || ':' || OLD.id::text;
      PERFORM public.post_order_stock_movement(affected_order_id, old_product_id, old_variant_id, -(net_mult * old_qty), 'order_item_delete', 'Auto stock correction after order item delete', idem);
    END IF;
    PERFORM public.recompute_reserved_stock(old_product_id, old_variant_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF net_mult <> 0 AND new_product_id IS NOT NULL AND new_qty > 0 AND NOT new_combo THEN
      idem := 'order-stock:item-insert:' || affected_order_id::text || ':' || NEW.id::text;
      PERFORM public.post_order_stock_movement(affected_order_id, new_product_id, new_variant_id, net_mult * new_qty, 'order_item_insert', 'Auto stock correction after order item insert', idem);
    END IF;
    PERFORM public.recompute_reserved_stock(new_product_id, new_variant_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF net_mult <> 0 THEN
      IF old_product_id IS NOT NULL AND old_qty > 0 AND NOT old_combo THEN
        idem := 'order-stock:item-update-old:' || affected_order_id::text || ':' || OLD.id::text || ':' || txid_current()::text;
        PERFORM public.post_order_stock_movement(affected_order_id, old_product_id, old_variant_id, -(net_mult * old_qty), 'order_item_update_reversal', 'Auto stock correction before order item update', idem);
      END IF;
      IF new_product_id IS NOT NULL AND new_qty > 0 AND NOT new_combo THEN
        idem := 'order-stock:item-update-new:' || affected_order_id::text || ':' || NEW.id::text || ':' || txid_current()::text;
        PERFORM public.post_order_stock_movement(affected_order_id, new_product_id, new_variant_id, net_mult * new_qty, 'order_item_update', 'Auto stock correction after order item update', idem);
      END IF;
    END IF;

    PERFORM public.recompute_reserved_stock(old_product_id, old_variant_id);
    PERFORM public.recompute_reserved_stock(new_product_id, new_variant_id);
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_recompute_stock ON public.order_items;
CREATE TRIGGER trg_order_items_recompute_stock
AFTER INSERT OR UPDATE OF product_id, variant_id, quantity, order_id OR DELETE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.tg_order_items_recompute_stock();