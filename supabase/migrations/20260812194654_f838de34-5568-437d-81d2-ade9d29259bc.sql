-- =========================================================
-- Phase 0.1b — return / RTO / cancel taxonomy
-- =========================================================
CREATE OR REPLACE FUNCTION public.rpt_return_taxonomy(
  _brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'created'
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH f AS (
    SELECT o.*,
      (CASE _basis
         WHEN 'delivered' THEN COALESCE(o.delivered_at, o.created_at)
         WHEN 'confirmed' THEN COALESCE(o.confirmed_at, o.created_at)
         ELSE o.created_at END) AS basis_ts
    FROM public.orders o
    WHERE o.brand_id = ANY(_brand_ids)
  ), r AS (
    SELECT * FROM f
    WHERE basis_ts >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND basis_ts <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  ), a AS (
    SELECT
      COUNT(*) AS placed,
      COUNT(*) FILTER (WHERE status::text = ANY(public.rpt_delivered_statuses())) AS delivered,
      COUNT(*) FILTER (WHERE status::text IN ('returned','paid_return')) AS customer_return,
      COALESCE(SUM(total) FILTER (WHERE status::text IN ('returned','paid_return')),0) AS customer_return_value,
      COUNT(*) FILTER (WHERE status::text IN ('partial_return','partial_delivered')) AS partial_return,
      COALESCE(SUM(total) FILTER (WHERE status::text IN ('partial_return','partial_delivered')),0) AS partial_return_value,
      COUNT(*) FILTER (WHERE status::text IN ('unpaid_return','return_in_transit','pending_return')) AS rto,
      COALESCE(SUM(total) FILTER (WHERE status::text IN ('unpaid_return','return_in_transit','pending_return')),0) AS rto_value,
      COUNT(*) FILTER (WHERE shipped_at IS NOT NULL AND status::text IN ('on_hold','damaged')) AS failed_delivery,
      COUNT(*) FILTER (WHERE status::text IN ('cancelled','fake')) AS cancelled,
      COALESCE(SUM(total) FILTER (WHERE status::text IN ('cancelled','fake')),0) AS cancelled_value,
      COUNT(*) FILTER (WHERE status::text = ANY(public.rpt_delivered_statuses())
                         AND COALESCE(payment_status::text,'unpaid') <> 'paid') AS unpaid,
      COALESCE(SUM(GREATEST(COALESCE(total,0) - COALESCE(advance_amount,0), 0))
        FILTER (WHERE status::text = ANY(public.rpt_delivered_statuses())
                  AND COALESCE(payment_status::text,'unpaid') <> 'paid'),0) AS unpaid_value,
      COUNT(*) FILTER (WHERE shipped_at IS NOT NULL) AS shipped
    FROM r
  )
  SELECT jsonb_build_object(
    'placed', placed, 'shipped', shipped, 'delivered', delivered,
    'customer_return', customer_return, 'customer_return_value', round(customer_return_value,2),
    'partial_return', partial_return, 'partial_return_value', round(partial_return_value,2),
    'rto', rto, 'rto_value', round(rto_value,2),
    'failed_delivery', failed_delivery,
    'cancelled', cancelled, 'cancelled_value', round(cancelled_value,2),
    'unpaid', unpaid, 'unpaid_value', round(unpaid_value,2),
    'return_rate', CASE WHEN (delivered + customer_return) > 0 THEN round(100.0*customer_return/(delivered+customer_return),2) ELSE 0 END,
    'rto_rate', CASE WHEN shipped > 0 THEN round(100.0*rto/shipped,2) ELSE 0 END,
    'cancel_rate', CASE WHEN placed > 0 THEN round(100.0*cancelled/placed,2) ELSE 0 END,
    'failure_rate', CASE WHEN shipped > 0 THEN round(100.0*failed_delivery/shipped,2) ELSE 0 END
  ) FROM a;
$$;
GRANT EXECUTE ON FUNCTION public.rpt_return_taxonomy(uuid[], date, date, text) TO authenticated;

-- =========================================================
-- Phase 0.3 — reconciliation chain engine
-- =========================================================
CREATE OR REPLACE FUNCTION public.rpt_reconcile_chain(
  _brand_ids uuid[], _from date, _to date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s jsonb; p jsonb; cash jsonb; tax jsonb;
  placed_value numeric; cancelled_value numeric; delivered_value numeric;
  net_rev numeric; ship_inc numeric; total_rev numeric; fin_rev numeric;
  received numeric; outstanding numeric;
  checks jsonb := '[]'::jsonb; overall text := 'matched';
  d numeric;
  fn_status text;
BEGIN
  s    := public.rpt_sales_summary(_brand_ids, _from, _to, 'delivered');
  p    := public.rpt_pnl_v2(_brand_ids, _from, _to);
  tax  := public.rpt_return_taxonomy(_brand_ids, _from, _to, 'created');
  cash := public.rpt_order_ledger_summary(_brand_ids, _from, _to, 'delivered', NULL, 'all', 'all');

  placed_value    := COALESCE((tax->>'cancelled_value')::numeric,0);
  cancelled_value := placed_value;
  delivered_value := COALESCE((s->>'gross_sales')::numeric,0);
  net_rev         := COALESCE((s->>'net_revenue')::numeric,0);
  ship_inc        := COALESCE((s->>'shipping_income')::numeric,0);
  total_rev       := net_rev + ship_inc;
  fin_rev         := COALESCE((p->>'total_revenue')::numeric,0);
  received        := COALESCE((cash->>'courier_collected')::numeric,0) + COALESCE((cash->>'advance_total')::numeric,0);
  outstanding     := GREATEST(total_rev - received, 0);

  -- check 1: sales vs finance revenue
  d := round(total_rev - fin_rev, 2);
  fn_status := CASE WHEN abs(d) < 1 THEN 'matched' WHEN abs(d) <= 100 THEN 'warning' ELSE 'mismatch' END;
  checks := checks || jsonb_build_object(
    'key','revenue','label','Sales revenue vs Finance revenue',
    'left_label','Sales (delivered)','left', round(total_rev,2),
    'right_label','Finance P&L','right', round(fin_rev,2),
    'diff', d, 'status', fn_status,
    'reason', CASE WHEN abs(d) < 1 THEN 'Same canonical source'
                   ELSE 'Different date basis or non-canonical calculation' END);

  -- check 2: accrual revenue vs cash received
  d := round(total_rev - received, 2);
  fn_status := CASE WHEN abs(d) < 1 THEN 'matched'
                    WHEN outstanding > 0 THEN 'pending'
                    ELSE 'warning' END;
  checks := checks || jsonb_build_object(
    'key','cash','label','Revenue vs cash received',
    'left_label','Revenue (accrual)','left', round(total_rev,2),
    'right_label','Advance + courier payout','right', round(received,2),
    'diff', d, 'status', fn_status,
    'reason', CASE WHEN abs(d) < 1 THEN 'Fully collected'
                   ELSE 'Courier payout pending / not yet reconciled' END);

  -- check 3: cost coverage
  d := COALESCE((s->>'cost_missing_units')::numeric,0);
  fn_status := CASE WHEN d = 0 THEN 'matched' WHEN d <= 20 THEN 'warning' ELSE 'mismatch' END;
  checks := checks || jsonb_build_object(
    'key','cogs','label','COGS coverage',
    'left_label','Delivered units','left', COALESCE((s->>'units_sold')::numeric,0),
    'right_label','Units without cost','right', d,
    'diff', d, 'status', fn_status,
    'reason', CASE WHEN d = 0 THEN 'Every delivered unit has a cost' ELSE 'Some units have no cost snapshot or average cost' END);

  -- check 4: courier charge reconciled
  d := round(COALESCE((cash->>'cod_expected')::numeric,0) - COALESCE((cash->>'courier_collected')::numeric,0) - COALESCE((cash->>'courier_charge')::numeric,0), 2);
  fn_status := CASE WHEN abs(d) < 1 THEN 'matched' WHEN abs(d) <= 500 THEN 'warning' ELSE 'mismatch' END;
  checks := checks || jsonb_build_object(
    'key','courier','label','COD expected vs courier payout + charge',
    'left_label','COD expected','left', round(COALESCE((cash->>'cod_expected')::numeric,0),2),
    'right_label','Payout + charge','right', round(COALESCE((cash->>'courier_collected')::numeric,0) + COALESCE((cash->>'courier_charge')::numeric,0),2),
    'diff', d, 'status', fn_status,
    'reason', CASE WHEN abs(d) < 1 THEN 'Fully reconciled' ELSE 'Unreconciled consignments or missing invoice rows' END);

  SELECT CASE
    WHEN bool_or(c->>'status' = 'mismatch') THEN 'mismatch'
    WHEN bool_or(c->>'status' = 'warning') THEN 'warning'
    WHEN bool_or(c->>'status' = 'pending') THEN 'pending'
    ELSE 'matched' END INTO overall
  FROM jsonb_array_elements(checks) c;

  RETURN jsonb_build_object(
    'overall', overall,
    'waterfall', jsonb_build_array(
      jsonb_build_object('label','Delivered gross sales','value', round(delivered_value,2),'kind','base'),
      jsonb_build_object('label','Discounts','value', -round(COALESCE((s->>'discounts')::numeric,0),2),'kind','sub'),
      jsonb_build_object('label','Net revenue','value', round(net_rev,2),'kind','total'),
      jsonb_build_object('label','Delivery charge income','value', round(ship_inc,2),'kind','sub'),
      jsonb_build_object('label','Total revenue','value', round(total_rev,2),'kind','total'),
      jsonb_build_object('label','Cash received (advance + courier payout)','value', round(received,2),'kind','total'),
      jsonb_build_object('label','Outstanding (not yet received)','value', round(outstanding,2),'kind','sub')
    ),
    'context', jsonb_build_object(
      'cancelled_value', round(cancelled_value,2),
      'rto_value', COALESCE((tax->>'rto_value')::numeric,0),
      'return_value', COALESCE((tax->>'customer_return_value')::numeric,0)
    ),
    'checks', checks
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpt_reconcile_chain(uuid[], date, date) TO authenticated;

-- =========================================================
-- Phase 0.4 — period close
-- =========================================================
CREATE TABLE IF NOT EXISTS public.rpt_period_close (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  period_month date NOT NULL,
  status text NOT NULL DEFAULT 'closed',
  revenue numeric NOT NULL DEFAULT 0,
  cogs numeric NOT NULL DEFAULT 0,
  gross_profit numeric NOT NULL DEFAULT 0,
  expenses numeric NOT NULL DEFAULT 0,
  net_profit numeric NOT NULL DEFAULT 0,
  cash_received numeric NOT NULL DEFAULT 0,
  inventory_value numeric NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  definition_version text NOT NULL DEFAULT 'v1',
  notes text,
  closed_by uuid,
  closed_at timestamptz NOT NULL DEFAULT now(),
  reopened_by uuid,
  reopened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, period_month)
);

GRANT SELECT ON public.rpt_period_close TO authenticated;
GRANT ALL ON public.rpt_period_close TO service_role;
ALTER TABLE public.rpt_period_close ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "period_close_read" ON public.rpt_period_close;
CREATE POLICY "period_close_read" ON public.rpt_period_close
  FOR SELECT TO authenticated
  USING (brand_id = ANY (public.get_user_brand_ids()));

CREATE OR REPLACE FUNCTION public.rpt_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_rpt_period_close_touch ON public.rpt_period_close;
CREATE TRIGGER trg_rpt_period_close_touch BEFORE UPDATE ON public.rpt_period_close
  FOR EACH ROW EXECUTE FUNCTION public.rpt_touch_updated_at();

-- is a given brand+date inside a closed month?
CREATE OR REPLACE FUNCTION public.rpt_is_period_closed(_brand_id uuid, _d date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rpt_period_close pc
    WHERE pc.brand_id = _brand_id
      AND pc.status = 'closed'
      AND pc.period_month = date_trunc('month', _d)::date
  );
$$;
GRANT EXECUTE ON FUNCTION public.rpt_is_period_closed(uuid, date) TO authenticated;

-- hard block: no financial mutation inside a closed month
CREATE OR REPLACE FUNCTION public.rpt_guard_closed_period()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b uuid; d date;
BEGIN
  IF TG_OP = 'DELETE' THEN b := OLD.brand_id; d := OLD.transaction_date;
  ELSE b := NEW.brand_id; d := NEW.transaction_date;
  END IF;

  IF b IS NOT NULL AND d IS NOT NULL AND public.rpt_is_period_closed(b, d) THEN
    RAISE EXCEPTION 'Accounting period % is closed for this brand. Post a dated adjustment entry in an open period instead.',
      to_char(date_trunc('month', d), 'Mon YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.brand_id IS NOT NULL AND OLD.transaction_date IS NOT NULL
     AND public.rpt_is_period_closed(OLD.brand_id, OLD.transaction_date) THEN
    RAISE EXCEPTION 'This entry belongs to a closed accounting period and cannot be changed.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END; $$;

DROP TRIGGER IF EXISTS trg_erp_transactions_period_guard ON public.erp_transactions;
CREATE TRIGGER trg_erp_transactions_period_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.erp_transactions
  FOR EACH ROW EXECUTE FUNCTION public.rpt_guard_closed_period();

-- preview / close / reopen
CREATE OR REPLACE FUNCTION public.rpt_period_snapshot(_brand_ids uuid[], _month date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m_from date := date_trunc('month', _month)::date;
        m_to date := (date_trunc('month', _month) + interval '1 month - 1 day')::date;
        p jsonb; cash jsonb; inv jsonb;
BEGIN
  p    := public.rpt_pnl_v2(_brand_ids, m_from, m_to);
  cash := public.rpt_order_ledger_summary(_brand_ids, m_from, m_to, 'delivered', NULL, 'all', 'all');
  inv  := public.rpt_inventory_summary(_brand_ids, m_from, m_to);
  RETURN jsonb_build_object(
    'period_month', m_from, 'from', m_from, 'to', m_to,
    'revenue', COALESCE((p->>'total_revenue')::numeric,0),
    'cogs', COALESCE((p->>'cogs')::numeric,0),
    'gross_profit', COALESCE((p->>'gross_profit')::numeric,0),
    'expenses', COALESCE((p->>'opex_total')::numeric,0) + COALESCE((p->>'ad_spend')::numeric,0)
                + COALESCE((p->>'courier_cost')::numeric,0) + COALESCE((p->>'packaging_cost')::numeric,0)
                + COALESCE((p->>'return_loss')::numeric,0),
    'net_profit', COALESCE((p->>'net_profit')::numeric,0),
    'cash_received', COALESCE((cash->>'courier_collected')::numeric,0) + COALESCE((cash->>'advance_total')::numeric,0),
    'inventory_value', COALESCE((inv->>'stock_value')::numeric, 0),
    'pnl', p, 'cash', cash
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.rpt_period_snapshot(uuid[], date) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpt_close_period(_brand_id uuid, _month date, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE snap jsonb; m date := date_trunc('month', _month)::date; row_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant')) THEN
    RAISE EXCEPTION 'Only admin or accountant can close an accounting period';
  END IF;
  IF m >= date_trunc('month', (now() AT TIME ZONE 'Asia/Dhaka'))::date THEN
    RAISE EXCEPTION 'Cannot close the current or a future month';
  END IF;

  snap := public.rpt_period_snapshot(ARRAY[_brand_id], m);

  INSERT INTO public.rpt_period_close AS pc (
    brand_id, period_month, status, revenue, cogs, gross_profit, expenses,
    net_profit, cash_received, inventory_value, snapshot, notes, closed_by, closed_at
  ) VALUES (
    _brand_id, m, 'closed',
    (snap->>'revenue')::numeric, (snap->>'cogs')::numeric, (snap->>'gross_profit')::numeric,
    (snap->>'expenses')::numeric, (snap->>'net_profit')::numeric,
    (snap->>'cash_received')::numeric, (snap->>'inventory_value')::numeric,
    snap, _notes, auth.uid(), now()
  )
  ON CONFLICT (brand_id, period_month) DO UPDATE SET
    status = 'closed', revenue = EXCLUDED.revenue, cogs = EXCLUDED.cogs,
    gross_profit = EXCLUDED.gross_profit, expenses = EXCLUDED.expenses,
    net_profit = EXCLUDED.net_profit, cash_received = EXCLUDED.cash_received,
    inventory_value = EXCLUDED.inventory_value, snapshot = EXCLUDED.snapshot,
    notes = COALESCE(EXCLUDED.notes, pc.notes), closed_by = EXCLUDED.closed_by,
    closed_at = now(), reopened_at = NULL, reopened_by = NULL
  RETURNING id INTO row_id;

  INSERT INTO public.admin_audit_log (user_id, action, table_name, record_id, new_values)
  VALUES (auth.uid(), 'period_close', 'rpt_period_close', row_id,
          jsonb_build_object('brand_id', _brand_id, 'month', m, 'snapshot', snap));

  RETURN snap;
END; $$;
GRANT EXECUTE ON FUNCTION public.rpt_close_period(uuid, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpt_reopen_period(_brand_id uuid, _month date, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m date := date_trunc('month', _month)::date; row_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admin can reopen a closed accounting period';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason is required to reopen a closed period';
  END IF;

  UPDATE public.rpt_period_close
     SET status = 'open', reopened_by = auth.uid(), reopened_at = now(),
         notes = COALESCE(notes || E'\n', '') || 'Reopened: ' || _reason
   WHERE brand_id = _brand_id AND period_month = m
   RETURNING id INTO row_id;

  IF row_id IS NULL THEN RAISE EXCEPTION 'That period is not closed'; END IF;

  INSERT INTO public.admin_audit_log (user_id, action, table_name, record_id, new_values)
  VALUES (auth.uid(), 'period_reopen', 'rpt_period_close', row_id,
          jsonb_build_object('brand_id', _brand_id, 'month', m, 'reason', _reason));
END; $$;
GRANT EXECUTE ON FUNCTION public.rpt_reopen_period(uuid, date, text) TO authenticated;

-- =========================================================
-- Phase 0.1c — freeze unit cost when an order becomes delivered
-- =========================================================
CREATE OR REPLACE FUNCTION public.rpt_freeze_cost_on_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.status::text = ANY(public.rpt_delivered_statuses()))
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.order_items oi
       SET unit_cost_snapshot = COALESCE(
             NULLIF(pv.weighted_avg_cost, 0),
             NULLIF(p.weighted_avg_cost, 0),
             NULLIF(p.cost_price, 0)
           )
      FROM public.order_items oi2
      LEFT JOIN public.product_variants pv ON pv.id = oi2.variant_id
      LEFT JOIN public.products p ON p.id = oi2.product_id
     WHERE oi.id = oi2.id
       AND oi.order_id = NEW.id
       AND COALESCE(oi.unit_cost_snapshot, 0) = 0
       AND COALESCE(NULLIF(pv.weighted_avg_cost,0), NULLIF(p.weighted_avg_cost,0), NULLIF(p.cost_price,0)) IS NOT NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_orders_freeze_cost ON public.orders;
CREATE TRIGGER trg_orders_freeze_cost
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.rpt_freeze_cost_on_delivery();