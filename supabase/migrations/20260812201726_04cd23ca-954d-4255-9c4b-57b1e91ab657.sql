-- Daily cash movement (wallet-wise in/out), Asia/Dhaka basis
CREATE OR REPLACE FUNCTION public.rpt_cash_daily(_brand_ids uuid[], _from date, _to date)
RETURNS TABLE(d date, cash_in numeric, cash_out numeric, net numeric, txns bigint)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT t.transaction_date AS d,
         ROUND(COALESCE(SUM(CASE WHEN t.txn_type = 'income' THEN t.amount
                                 WHEN t.txn_type = 'adjustment' AND t.amount > 0 THEN t.amount ELSE 0 END), 0), 2) AS cash_in,
         ROUND(COALESCE(SUM(CASE WHEN t.txn_type = 'expense' THEN t.amount
                                 WHEN t.txn_type = 'adjustment' AND t.amount < 0 THEN -t.amount ELSE 0 END), 0), 2) AS cash_out,
         ROUND(COALESCE(SUM(CASE WHEN t.txn_type = 'income' THEN t.amount
                                 WHEN t.txn_type = 'expense' THEN -t.amount
                                 WHEN t.txn_type = 'adjustment' THEN t.amount ELSE 0 END), 0), 2) AS net,
         COUNT(*)::bigint AS txns
  FROM public.erp_transactions t
  WHERE t.brand_id = ANY(_brand_ids)
    AND t.transaction_date BETWEEN _from AND _to
    AND t.txn_type <> 'transfer'
  GROUP BY 1 ORDER BY 1;
$$;
GRANT EXECUTE ON FUNCTION public.rpt_cash_daily(uuid[], date, date) TO authenticated;

-- Account / wallet wise cash summary
CREATE OR REPLACE FUNCTION public.rpt_cash_accounts(_brand_ids uuid[], _from date, _to date)
RETURNS TABLE(account_id uuid, account text, account_type text, wallet_type text,
              cash_in numeric, cash_out numeric, transfer_in numeric, transfer_out numeric,
              net numeric, txns bigint, current_balance numeric)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH mv AS (
    SELECT t.account_id AS acc,
           CASE WHEN t.txn_type = 'income' THEN t.amount WHEN t.txn_type = 'adjustment' AND t.amount > 0 THEN t.amount ELSE 0 END AS cin,
           CASE WHEN t.txn_type = 'expense' THEN t.amount WHEN t.txn_type = 'adjustment' AND t.amount < 0 THEN -t.amount ELSE 0 END AS cout,
           0::numeric AS tin,
           CASE WHEN t.txn_type = 'transfer' THEN t.amount ELSE 0 END AS tout
    FROM public.erp_transactions t
    WHERE t.brand_id = ANY(_brand_ids) AND t.transaction_date BETWEEN _from AND _to
    UNION ALL
    SELECT t.to_account_id, 0, 0, t.amount, 0
    FROM public.erp_transactions t
    WHERE t.brand_id = ANY(_brand_ids) AND t.transaction_date BETWEEN _from AND _to
      AND t.txn_type = 'transfer' AND t.to_account_id IS NOT NULL
  )
  SELECT a.id, a.name, COALESCE(a.account_type, '—'), COALESCE(a.wallet_type, ''),
         ROUND(COALESCE(SUM(mv.cin), 0), 2),
         ROUND(COALESCE(SUM(mv.cout), 0), 2),
         ROUND(COALESCE(SUM(mv.tin), 0), 2),
         ROUND(COALESCE(SUM(mv.tout), 0), 2),
         ROUND(COALESCE(SUM(mv.cin + mv.tin - mv.cout - mv.tout), 0), 2),
         COUNT(mv.*)::bigint,
         ROUND(COALESCE(a.current_balance, 0), 2)
  FROM public.erp_accounts a
  LEFT JOIN mv ON mv.acc = a.id
  WHERE a.brand_id = ANY(_brand_ids)
  GROUP BY a.id, a.name, a.account_type, a.wallet_type, a.current_balance
  HAVING COUNT(mv.*) > 0 OR COALESCE(a.current_balance, 0) <> 0
  ORDER BY 11 DESC;
$$;
GRANT EXECUTE ON FUNCTION public.rpt_cash_accounts(uuid[], date, date) TO authenticated;

-- Receivables & payables snapshot (as of _to)
CREATE OR REPLACE FUNCTION public.rpt_ar_ap(_brand_ids uuid[], _from date, _to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE
  ar_courier numeric := 0; ar_courier_orders bigint := 0;
  ar_delivered_unpaid numeric := 0; ar_delivered_orders bigint := 0;
  ap_supplier numeric := 0; ap_cargo numeric := 0; ap_bills numeric := 0; ap_bills_overdue numeric := 0;
BEGIN
  -- COD sitting with courier: shipped/in-transit orders not yet reconciled
  SELECT COALESCE(SUM(GREATEST(COALESCE(o.total, 0) - COALESCE(o.advance_amount, 0), 0)), 0), COUNT(*)
    INTO ar_courier, ar_courier_orders
  FROM public.orders o
  WHERE o.brand_id = ANY(_brand_ids)
    AND o.status IN ('shipped', 'in_transit', 'courier_entry', 'ready_to_ship')
    AND COALESCE(o.is_deleted, false) = false
    AND o.created_at < (_to + 1);

  -- Delivered but courier payout not received yet
  SELECT COALESCE(SUM(GREATEST(COALESCE(o.total, 0) - COALESCE(o.advance_amount, 0), 0)), 0), COUNT(*)
    INTO ar_delivered_unpaid, ar_delivered_orders
  FROM public.orders o
  WHERE o.brand_id = ANY(_brand_ids)
    AND o.status IN ('delivered', 'partial_delivered')
    AND COALESCE(o.is_deleted, false) = false
    AND COALESCE(o.courier_amount_received, 0) = 0
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