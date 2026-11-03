-- Phase 2: formula fixes for NEW postings/reports only. No historical rows are modified.

-- 1) partial_amount semantics marker. Old rows stay NULL = "uncollected part" (total - collected).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS partial_amount_semantics text;

-- 2) Settlement action: from now on partial_amount stores the COLLECTED amount, marked as such.
CREATE OR REPLACE FUNCTION public.apply_settlement_variance_action(_line_id uuid, _action text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_oid uuid; v_new_status order_status; v_new_pay payment_status;
  v_return_type text; v_partial numeric := NULL; v_total numeric; v_collected numeric; v_note text;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'operations') OR has_role(auth.uid(),'customer_service')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT matched_order_id, COALESCE(collected_amount, payout, 0) INTO v_oid, v_collected
    FROM erp_courier_settlement_lines WHERE id = _line_id;
  IF v_oid IS NULL THEN RAISE EXCEPTION 'line has no matched order'; END IF;
  SELECT total INTO v_total FROM orders WHERE id = v_oid;
  CASE _action
    WHEN 'partial_delivery' THEN v_new_status := 'partial_delivered'; v_new_pay := 'partial'; v_return_type := 'partial_return'; v_partial := COALESCE(v_collected,0);
    WHEN 'partial_return'   THEN v_new_status := 'partial_return';   v_new_pay := 'partial'; v_return_type := 'partial_return'; v_partial := COALESCE(v_collected,0);
    WHEN 'exchange'         THEN v_new_status := 'exchange';         v_new_pay := 'partial'; v_return_type := 'exchange';       v_partial := COALESCE(v_collected,0);
    WHEN 'internal_adjust'  THEN v_new_status := 'completed'; v_new_pay := 'paid'; v_note := 'Variance adjusted internally';
    ELSE RAISE EXCEPTION 'unknown action: %', _action;
  END CASE;
  UPDATE orders SET status = v_new_status, payment_status = v_new_pay, reconciliation_status = 'resolved',
         return_type = COALESCE(v_return_type, return_type),
         partial_amount = COALESCE(v_partial, partial_amount),
         partial_amount_semantics = CASE WHEN v_partial IS NOT NULL THEN 'collected' ELSE partial_amount_semantics END
   WHERE id = v_oid;
  UPDATE erp_courier_settlement_lines SET match_status = 'resolved' WHERE id = _line_id;
  RETURN jsonb_build_object('order_id', v_oid, 'status', v_new_status, 'note', v_note);
END;
$function$;

-- 3) Delivery posting: new formula for orders delivered on/after 2026-11-04 only.
--    Older orders keep the exact old formula, so historical rows never change.
CREATE OR REPLACE FUNCTION public.fn_post_order_delivery_to_finance()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_new_status text := NEW.status::text;
  v_old_status text := COALESCE(OLD.status::text, '');
  v_collected numeric; v_shipping numeric; v_refund numeric; v_advance numeric; v_net numeric;
  v_wallet uuid; v_existing uuid;
  v_v2_from constant date := DATE '2026-11-04';
  v_v2 boolean := COALESCE(NEW.delivered_at::date, CURRENT_DATE) >= v_v2_from;
BEGIN
  IF v_new_status NOT IN ('delivered','partial_delivered') THEN
    IF v_old_status IN ('delivered','partial_delivered') THEN
      DELETE FROM public.erp_transactions WHERE reference_type = 'order_delivery' AND reference_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  -- Collected amount: partial rows marked 'collected' hold the collected amount;
  -- legacy rows (NULL semantics) hold total - collected.
  IF v_new_status = 'partial_delivered' THEN
    v_collected := CASE WHEN NEW.partial_amount_semantics = 'collected'
      THEN COALESCE(NEW.partial_amount, 0)
      ELSE GREATEST(COALESCE(NEW.total,0) - COALESCE(NEW.partial_amount,0), 0) END;
  ELSE
    v_collected := COALESCE(NEW.total, 0);
  END IF;

  v_shipping := COALESCE(NEW.actual_shipping_cost, NEW.shipping_fee, 0);
  v_refund := COALESCE(NEW.refund_amount, 0);
  v_advance := CASE WHEN v_v2 THEN COALESCE(NEW.advance_amount, 0) ELSE 0 END;
  v_net := v_collected - v_advance - v_shipping - v_refund;

  IF v_net <= 0 THEN
    DELETE FROM public.erp_transactions WHERE reference_type = 'order_delivery' AND reference_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT id INTO v_wallet FROM public.erp_accounts
   WHERE brand_id = NEW.brand_id AND name = 'COD Receivable' AND is_active = true LIMIT 1;
  IF v_wallet IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_existing FROM public.erp_transactions
   WHERE reference_type = 'order_delivery' AND reference_id = NEW.id LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.erp_transactions SET amount = v_net, account_id = v_wallet,
      transaction_date = COALESCE(NEW.delivered_at::date, CURRENT_DATE),
      description = format('COD receivable (net of courier ৳%s)', v_shipping)
    WHERE id = v_existing;
  ELSE
    INSERT INTO public.erp_transactions(brand_id, txn_type, account_id, amount, transaction_date, description, reference_type, reference_id)
    VALUES (NEW.brand_id, 'income', v_wallet, v_net, COALESCE(NEW.delivered_at::date, CURRENT_DATE),
      format('COD receivable (net of courier ৳%s)', v_shipping), 'order_delivery', NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

-- 4) Balance Sheet: filters moved onto the journal-lines join so draft/future/deleted
--    entries can no longer leak into totals.
CREATE OR REPLACE FUNCTION public.get_balance_sheet(_brand_id uuid, _as_of date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _assets jsonb; _liab jsonb; _equity jsonb; _ta numeric:=0; _tl numeric:=0; _te numeric:=0; _retained numeric:=0;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('code',code,'name',name,'amount',amount) ORDER BY code),'[]'::jsonb), COALESCE(SUM(amount),0)
  INTO _assets, _ta FROM (
    SELECT a.code, a.name, COALESCE(SUM(l.debit - l.credit),0) + a.opening_balance AS amount
    FROM erp_chart_accounts a
    LEFT JOIN erp_journal_lines l ON l.account_id=a.id AND EXISTS (
      SELECT 1 FROM erp_journal_entries e WHERE e.id=l.journal_entry_id AND e.status='posted' AND e.entry_date <= _as_of AND e.deleted_at IS NULL)
    WHERE a.brand_id=_brand_id AND a.account_type='asset' AND a.is_archived=false
    GROUP BY a.id, a.code, a.name, a.opening_balance
    HAVING COALESCE(SUM(l.debit - l.credit),0) + a.opening_balance <> 0) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('code',code,'name',name,'amount',amount) ORDER BY code),'[]'::jsonb), COALESCE(SUM(amount),0)
  INTO _liab, _tl FROM (
    SELECT a.code, a.name, COALESCE(SUM(l.credit - l.debit),0) + a.opening_balance AS amount
    FROM erp_chart_accounts a
    LEFT JOIN erp_journal_lines l ON l.account_id=a.id AND EXISTS (
      SELECT 1 FROM erp_journal_entries e WHERE e.id=l.journal_entry_id AND e.status='posted' AND e.entry_date <= _as_of AND e.deleted_at IS NULL)
    WHERE a.brand_id=_brand_id AND a.account_type='liability' AND a.is_archived=false
    GROUP BY a.id, a.code, a.name, a.opening_balance
    HAVING COALESCE(SUM(l.credit - l.debit),0) + a.opening_balance <> 0) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('code',code,'name',name,'amount',amount) ORDER BY code),'[]'::jsonb), COALESCE(SUM(amount),0)
  INTO _equity, _te FROM (
    SELECT a.code, a.name, COALESCE(SUM(CASE WHEN a.normal_balance='credit' THEN l.credit - l.debit ELSE l.debit - l.credit END),0) + a.opening_balance AS amount
    FROM erp_chart_accounts a
    LEFT JOIN erp_journal_lines l ON l.account_id=a.id AND EXISTS (
      SELECT 1 FROM erp_journal_entries e WHERE e.id=l.journal_entry_id AND e.status='posted' AND e.entry_date <= _as_of AND e.deleted_at IS NULL)
    WHERE a.brand_id=_brand_id AND a.account_type='equity' AND a.is_archived=false
    GROUP BY a.id, a.code, a.name, a.opening_balance, a.normal_balance
    HAVING COALESCE(SUM(CASE WHEN a.normal_balance='credit' THEN l.credit - l.debit ELSE l.debit - l.credit END),0) + a.opening_balance <> 0) s;

  SELECT COALESCE(SUM(CASE WHEN a.account_type='income' THEN l.credit - l.debit ELSE 0 END),0) -
         COALESCE(SUM(CASE WHEN a.account_type='expense' THEN l.debit - l.credit ELSE 0 END),0)
  INTO _retained
  FROM erp_chart_accounts a
  JOIN erp_journal_lines l ON l.account_id=a.id
  JOIN erp_journal_entries e ON e.id=l.journal_entry_id AND e.status='posted' AND e.entry_date <= _as_of AND e.deleted_at IS NULL
  WHERE a.brand_id=_brand_id AND a.account_type IN ('income','expense');

  _te := _te + _retained;
  RETURN jsonb_build_object('assets',_assets,'liabilities',_liab,'equity',_equity,'total_assets',_ta,
    'total_liabilities',_tl,'total_equity',_te,'retained_earnings',_retained,'balanced',round(_ta,2)=round(_tl+_te,2),
    'basis','Double-entry journals only (posted, not deleted, up to the as-of date) plus chart opening balances. Wallet balances are not used here.');
END;
$$;

-- 5) General Ledger: opening balance now includes all movements before the start date.
CREATE OR REPLACE FUNCTION public.get_general_ledger(_brand_id uuid, _account_id uuid, _from date, _to date)
RETURNS TABLE(entry_date date, entry_no text, description text, debit numeric, credit numeric, running_balance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _normal text; _opening numeric; _prior numeric;
BEGIN
  SELECT normal_balance, opening_balance INTO _normal, _opening FROM erp_chart_accounts WHERE id=_account_id AND brand_id=_brand_id;
  IF _normal IS NULL THEN RAISE EXCEPTION 'Account not found'; END IF;
  SELECT COALESCE(SUM(CASE WHEN _normal='debit' THEN l.debit - l.credit ELSE l.credit - l.debit END),0) INTO _prior
  FROM erp_journal_lines l JOIN erp_journal_entries e ON e.id=l.journal_entry_id
  WHERE l.account_id=_account_id AND e.status='posted' AND e.deleted_at IS NULL AND e.entry_date < _from;
  RETURN QUERY
  WITH ordered AS (
    SELECT e.entry_date, e.entry_no, COALESCE(l.description, e.description) AS description, l.debit, l.credit,
           ROW_NUMBER() OVER (ORDER BY e.entry_date, e.created_at, l.line_order) AS rn
    FROM erp_journal_lines l JOIN erp_journal_entries e ON e.id=l.journal_entry_id
    WHERE l.account_id=_account_id AND e.status='posted' AND e.deleted_at IS NULL AND e.entry_date BETWEEN _from AND _to)
  SELECT o.entry_date, o.entry_no, o.description, o.debit, o.credit,
    _opening + _prior + SUM(CASE WHEN _normal='debit' THEN o.debit - o.credit ELSE o.credit - o.debit END) OVER (ORDER BY o.rn) AS running_balance
  FROM ordered o;
END;
$$;

-- 6) Finance dashboard: dropped erp_bills removed (AP now 0 until Phase 6 supplier ledger);
--    order-linked income no longer counted as "other income".
CREATE OR REPLACE FUNCTION public.get_finance_dashboard(_brand_id uuid, _from date, _to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'Asia/Dhaka')::date;
  _today_sales numeric; _today_orders int; _range_sales numeric; _range_orders int;
  _cash numeric; _bank numeric; _mfs numeric; _courier_cod numeric; _ap_due numeric; _ar_due numeric;
  _expense numeric; _other_income numeric; _refund_loss numeric; _expense_by jsonb;
BEGIN
  SELECT COALESCE(SUM(total),0), COUNT(*) INTO _today_sales, _today_orders FROM public.orders
  WHERE (_brand_id IS NULL OR brand_id = _brand_id)
    AND status IN ('delivered'::order_status,'partial_delivered'::order_status,'confirmed'::order_status,'paid'::order_status)
    AND created_at::date = _today;
  SELECT COALESCE(SUM(total),0), COUNT(*) INTO _range_sales, _range_orders FROM public.orders
  WHERE (_brand_id IS NULL OR brand_id = _brand_id)
    AND status IN ('delivered'::order_status,'partial_delivered'::order_status,'paid'::order_status)
    AND created_at::date BETWEEN _from AND _to;
  SELECT COALESCE(SUM(CASE WHEN account_type='cash' THEN current_balance ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN account_type='bank' THEN current_balance ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN account_type='mfs' THEN current_balance ELSE 0 END),0)
  INTO _cash, _bank, _mfs FROM public.erp_accounts WHERE (_brand_id IS NULL OR brand_id=_brand_id) AND is_active=true;
  SELECT COALESCE(SUM(o.total),0) INTO _courier_cod FROM public.orders o
  JOIN public.courier_shipments cs ON cs.order_id=o.id
  WHERE (_brand_id IS NULL OR o.brand_id=_brand_id)
    AND o.status IN ('shipped'::order_status,'delivered'::order_status,'partial_delivered'::order_status)
    AND COALESCE(o.payment_method,'cod') ILIKE '%cod%';
  _ap_due := 0; -- erp_bills was dropped; supplier payable ledger arrives in a later phase
  _ar_due := _courier_cod;
  SELECT COALESCE(SUM(CASE WHEN txn_type='expense' THEN amount ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN txn_type='income' AND reference_type IS NULL THEN amount ELSE 0 END),0)
  INTO _expense, _other_income FROM public.erp_transactions
  WHERE (_brand_id IS NULL OR brand_id=_brand_id) AND transaction_date BETWEEN _from AND _to;
  SELECT COALESCE(SUM(total),0) INTO _refund_loss FROM public.orders
  WHERE (_brand_id IS NULL OR brand_id=_brand_id) AND status IN ('returned'::order_status) AND created_at::date BETWEEN _from AND _to;
  SELECT COALESCE(jsonb_object_agg(name,total),'{}'::jsonb) INTO _expense_by FROM (
    SELECT COALESCE(c.name,'Uncategorized') AS name, SUM(t.amount) AS total
    FROM public.erp_transactions t LEFT JOIN public.erp_expense_categories c ON c.id=t.category_id
    WHERE (_brand_id IS NULL OR t.brand_id=_brand_id) AND t.txn_type='expense' AND t.transaction_date BETWEEN _from AND _to
    GROUP BY 1) s;
  RETURN jsonb_build_object(
    'today_sales',_today_sales,'today_orders',_today_orders,'range_sales',_range_sales,'range_orders',_range_orders,
    'cash',_cash,'bank',_bank,'mfs',_mfs,'courier_cod',_courier_cod,'ap_due',_ap_due,'ar_due',_ar_due,
    'expense',_expense,'other_income',_other_income,'refund_loss',_refund_loss,'expense_by_category',_expense_by,
    'basis','Sales from order totals; cash/bank/MFS from stored wallet balances; other income and expense from manual transactions only (order-linked postings excluded).');
END;
$$;

-- 7) P&L: "other income" now manual-only, so order revenue is never counted twice.
CREATE OR REPLACE FUNCTION public.erp_profit_loss(_brand_id uuid, _from date, _to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _user uuid := auth.uid(); _revenue numeric := 0; _delivered_count integer := 0; _cogs numeric := 0;
  _items_missing_cost integer := 0; _expense numeric := 0; _income_other numeric := 0; _expense_by jsonb;
  _delivered_statuses order_status[] := ARRAY['delivered','completed','partial_delivered','partial_return','exchange','paid_return']::order_status[];
BEGIN
  IF NOT (public.has_role(_user,'admin'::public.app_role) OR public.has_role(_user,'operations'::public.app_role) OR public.has_role(_user,'customer_service'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT COALESCE(SUM(CASE
        WHEN return_type='full_return' THEN 0
        WHEN return_type IN ('partial_return','exchange') THEN GREATEST(COALESCE(total,0)-COALESCE(partial_amount,0),0)
        ELSE COALESCE(total,0) END),0), COUNT(*)
  INTO _revenue, _delivered_count FROM public.orders
  WHERE brand_id=_brand_id AND status=ANY(_delivered_statuses) AND COALESCE(delivered_at::date,created_at::date) BETWEEN _from AND _to;
  SELECT COALESCE(SUM(oi.quantity*COALESCE(p.cost_price,0)),0),
         COALESCE(SUM(CASE WHEN p.cost_price IS NULL OR p.cost_price=0 THEN 1 ELSE 0 END),0)
  INTO _cogs, _items_missing_cost
  FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id LEFT JOIN public.products p ON p.id=oi.product_id
  WHERE o.brand_id=_brand_id AND o.status=ANY(_delivered_statuses) AND COALESCE(o.delivered_at::date,o.created_at::date) BETWEEN _from AND _to;
  SELECT COALESCE(SUM(t.amount),0) INTO _expense FROM public.erp_transactions t
  LEFT JOIN public.erp_expense_categories c ON c.id=t.category_id
  WHERE t.brand_id=_brand_id AND t.txn_type='expense' AND t.transaction_date BETWEEN _from AND _to AND COALESCE(c.excluded_from_pnl,false)=false;
  SELECT COALESCE(SUM(amount),0) INTO _income_other FROM public.erp_transactions
  WHERE brand_id=_brand_id AND txn_type='income' AND reference_type IS NULL AND transaction_date BETWEEN _from AND _to;
  SELECT COALESCE(jsonb_object_agg(name,total),'{}'::jsonb) INTO _expense_by FROM (
    SELECT COALESCE(c.name,'Uncategorized') AS name, SUM(t.amount) AS total
    FROM public.erp_transactions t LEFT JOIN public.erp_expense_categories c ON c.id=t.category_id
    WHERE t.brand_id=_brand_id AND t.txn_type='expense' AND t.transaction_date BETWEEN _from AND _to AND COALESCE(c.excluded_from_pnl,false)=false
    GROUP BY 1) s;
  RETURN jsonb_build_object(
    'revenue',_revenue,'delivered_orders',_delivered_count,'cogs',_cogs,'items_missing_cost_data',_items_missing_cost,
    'gross_profit',(_revenue-_cogs),'other_income',_income_other,'expense_total',_expense,'opex_total',_expense,
    'expense_by_category',_expense_by,'profit',(_revenue-_cogs+_income_other-_expense),'net_profit',(_revenue-_cogs+_income_other-_expense),
    'basis','Revenue: order totals of delivered-family orders (full returns 0, partial/exchange use total minus the uncollected part). COGS: quantity x current product cost price. Other income: manual income only (order advance/delivery/settlement postings excluded). Expense: all non-excluded expense transactions.');
END;
$function$;

-- 8) Third brand: SynQ With Us (empty; the existing trigger creates its default warehouse).
INSERT INTO public.brands (name, slug, is_active, settings)
SELECT 'SynQ With Us', 'synq-with-us', true, '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.brands WHERE slug = 'synq-with-us');

-- 9) Approval threshold setting (stored, not enforced until Phase 3).
INSERT INTO public.app_settings (key, value)
VALUES ('finance_approval_threshold_bdt', '20000')
ON CONFLICT (key) DO NOTHING;