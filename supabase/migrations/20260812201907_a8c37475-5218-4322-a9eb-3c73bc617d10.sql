CREATE OR REPLACE FUNCTION public.rpt_ar_ap(_brand_ids uuid[], _from date, _to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE
  ar_courier numeric := 0; ar_courier_orders bigint := 0;
  ar_delivered_unpaid numeric := 0; ar_delivered_orders bigint := 0;
  ap_supplier numeric := 0; ap_cargo numeric := 0; ap_bills numeric := 0; ap_bills_overdue numeric := 0;
BEGIN
  SELECT COALESCE(SUM(GREATEST(COALESCE(o.total, 0) - COALESCE(o.advance_amount, 0), 0)), 0), COUNT(*)
    INTO ar_courier, ar_courier_orders
  FROM public.orders o
  WHERE o.brand_id = ANY(_brand_ids)
    AND o.status IN ('shipped', 'in_transit', 'courier_entry', 'ready_to_ship')
    AND o.created_at < (_to + 1);

  SELECT COALESCE(SUM(GREATEST(COALESCE(o.total, 0) - COALESCE(o.advance_amount, 0), 0)), 0), COUNT(*)
    INTO ar_delivered_unpaid, ar_delivered_orders
  FROM public.orders o
  WHERE o.brand_id = ANY(_brand_ids)
    AND o.status IN ('delivered', 'partial_delivered')
    AND COALESCE(o.net_collected, 0) = 0
    AND (o.delivered_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to;

  SELECT COALESCE(SUM(COALESCE(po.due_bdt, 0)), 0) INTO ap_supplier
  FROM public.imp_purchase_orders po
  WHERE po.brand_id = ANY(_brand_ids) AND po.status <> 'cancelled';

  SELECT COALESCE(SUM(CASE WHEN l.direction = 'debit' THEN -l.amount ELSE l.amount END), 0) INTO ap_cargo
  FROM public.imp_cargo_ledger l WHERE l.brand_id = ANY(_brand_ids);

  SELECT COALESCE(SUM(GREATEST(COALESCE(b.amount, 0) - COALESCE(b.paid_amount, 0), 0)), 0),
         COALESCE(SUM(CASE WHEN b.due_date IS NOT NULL AND b.due_date < _to
                           THEN GREATEST(COALESCE(b.amount, 0) - COALESCE(b.paid_amount, 0), 0) ELSE 0 END), 0)
    INTO ap_bills, ap_bills_overdue
  FROM public.erp_bills b
  WHERE b.brand_id = ANY(_brand_ids) AND COALESCE(b.status, '') <> 'paid';

  RETURN jsonb_build_object(
    'ar_courier', ROUND(ar_courier, 2), 'ar_courier_orders', ar_courier_orders,
    'ar_delivered_unpaid', ROUND(ar_delivered_unpaid, 2), 'ar_delivered_orders', ar_delivered_orders,
    'ar_total', ROUND(ar_courier + ar_delivered_unpaid, 2),
    'ap_supplier', ROUND(ap_supplier, 2), 'ap_cargo', ROUND(GREATEST(ap_cargo, 0), 2),
    'ap_bills', ROUND(ap_bills, 2), 'ap_bills_overdue', ROUND(ap_bills_overdue, 2),
    'ap_total', ROUND(ap_supplier + GREATEST(ap_cargo, 0) + ap_bills, 2),
    'net_position', ROUND((ar_courier + ar_delivered_unpaid) - (ap_supplier + GREATEST(ap_cargo, 0) + ap_bills), 2)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpt_ar_ap(uuid[], date, date) TO authenticated;