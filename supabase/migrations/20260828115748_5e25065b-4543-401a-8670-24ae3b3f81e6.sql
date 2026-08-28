
CREATE OR REPLACE FUNCTION public.erp_sync_return_cases_for_order(_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _o record;
  _status text;
  _stock boolean;
  _n integer := 0;
  _seq integer;
  _prefix text;
  _it record;
BEGIN
  SELECT id, brand_id, status::text AS status, return_received_at, created_at
    INTO _o FROM public.orders WHERE id = _order_id;
  IF _o.id IS NULL OR _o.brand_id IS NULL THEN RETURN 0; END IF;

  IF _o.status = 'pending_return' THEN
    _status := 'in_transit'; _stock := false;
  ELSIF _o.status = 'returned' THEN
    IF _o.return_received_at IS NOT NULL THEN
      _status := 'restocked'; _stock := true;
    ELSE
      _status := 'received'; _stock := false;
    END IF;
  ELSE
    RETURN 0;
  END IF;

  -- never duplicate: skip orders that already have a case
  IF EXISTS (SELECT 1 FROM public.erp_return_cases WHERE order_id = _order_id) THEN
    RETURN 0;
  END IF;

  _prefix := 'RET-' || to_char(now(), 'YYYYMM') || '-';
  SELECT COALESCE(MAX(NULLIF(regexp_replace(case_number, '^.*-', ''), '')::int), 0)
    INTO _seq FROM public.erp_return_cases WHERE case_number LIKE _prefix || '%';

  FOR _it IN
    SELECT id, product_id, variant_id, quantity, line_total
    FROM public.order_items WHERE order_id = _order_id
  LOOP
    _seq := _seq + 1;
    INSERT INTO public.erp_return_cases (
      brand_id, order_id, order_item_id, product_id, variant_id, qty,
      return_type, item_condition, refund_amount, return_status,
      stock_updated, stock_restored, stock_restored_at, case_number, note
    ) VALUES (
      _o.brand_id, _order_id, _it.id, _it.product_id, _it.variant_id,
      GREATEST(COALESCE(_it.quantity, 1), 1),
      'normal_return', 'sellable', COALESCE(_it.line_total, 0), _status,
      _stock, _stock, CASE WHEN _stock THEN COALESCE(_o.return_received_at, now()) ELSE NULL END,
      _prefix || lpad(_seq::text, 4, '0'),
      'Auto-created from courier return'
    );
    _n := _n + 1;
  END LOOP;

  RETURN _n;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_orders_autocreate_return_case()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status::text IN ('pending_return','returned')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.erp_sync_return_cases_for_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_autocreate_return_case ON public.orders;
CREATE TRIGGER orders_autocreate_return_case
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_orders_autocreate_return_case();

-- Backfill existing courier returns
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.orders
           WHERE status::text IN ('pending_return','returned')
           ORDER BY created_at
  LOOP
    PERFORM public.erp_sync_return_cases_for_order(r.id);
  END LOOP;
END $$;
