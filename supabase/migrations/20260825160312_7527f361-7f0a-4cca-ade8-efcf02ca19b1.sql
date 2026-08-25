
-- 1. CASH FLOW ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpt_cash_flow(_brand_ids uuid[], _from date, _to date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  WITH acc AS (
    SELECT id, COALESCE(opening_balance,0) AS ob FROM public.erp_accounts WHERE brand_id = ANY(_brand_ids)
  ),
  before AS (
    SELECT COALESCE(SUM(CASE
             WHEN t.txn_type = 'income' THEN t.amount
             WHEN t.txn_type = 'expense' THEN -t.amount
             WHEN t.txn_type = 'adjustment' THEN t.amount
             ELSE 0 END), 0)::numeric AS net
    FROM public.erp_transactions t
    WHERE t.brand_id = ANY(_brand_ids) AND t.transaction_date < _from AND t.txn_type <> 'transfer'
  ),
  rows_in AS (
    SELECT COALESCE(c.name, NULLIF(t.reference_type, ''), 'Other income') AS label,
           SUM(t.amount)::numeric AS amount, COUNT(*)::bigint AS txns
    FROM public.erp_transactions t
    LEFT JOIN public.erp_expense_categories c ON c.id = t.category_id
    WHERE t.brand_id = ANY(_brand_ids) AND t.transaction_date BETWEEN _from AND _to
      AND (t.txn_type = 'income' OR (t.txn_type = 'adjustment' AND t.amount > 0))
    GROUP BY 1
  ),
  rows_out AS (
    SELECT COALESCE(c.name, NULLIF(t.reference_type, ''), 'Other expense') AS label,
           SUM(ABS(t.amount))::numeric AS amount, COUNT(*)::bigint AS txns
    FROM public.erp_transactions t
    LEFT JOIN public.erp_expense_categories c ON c.id = t.category_id
    WHERE t.brand_id = ANY(_brand_ids) AND t.transaction_date BETWEEN _from AND _to
      AND (t.txn_type = 'expense' OR (t.txn_type = 'adjustment' AND t.amount < 0))
    GROUP BY 1
  ),
  accs AS (
    SELECT a.id, a.name, COALESCE(a.account_type,'—') AS account_type,
           ROUND(COALESCE(a.current_balance,0),2) AS balance
    FROM public.erp_accounts a
    WHERE a.brand_id = ANY(_brand_ids) AND COALESCE(a.is_active,true)
  )
  SELECT jsonb_build_object(
    'opening', ROUND((SELECT COALESCE(SUM(ob),0) FROM acc) + (SELECT net FROM before), 2),
    'cash_in', ROUND(COALESCE((SELECT SUM(amount) FROM rows_in),0), 2),
    'cash_out', ROUND(COALESCE((SELECT SUM(amount) FROM rows_out),0), 2),
    'closing', ROUND((SELECT COALESCE(SUM(ob),0) FROM acc) + (SELECT net FROM before)
                     + COALESCE((SELECT SUM(amount) FROM rows_in),0)
                     - COALESCE((SELECT SUM(amount) FROM rows_out),0), 2),
    'in_rows', COALESCE((SELECT jsonb_agg(jsonb_build_object('label',label,'amount',ROUND(amount,2),'txns',txns) ORDER BY amount DESC) FROM rows_in), '[]'::jsonb),
    'out_rows', COALESCE((SELECT jsonb_agg(jsonb_build_object('label',label,'amount',ROUND(amount,2),'txns',txns) ORDER BY amount DESC) FROM rows_out), '[]'::jsonb),
    'accounts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'type',account_type,'balance',balance) ORDER BY balance DESC) FROM accs), '[]'::jsonb),
    'live_balance', ROUND(COALESCE((SELECT SUM(balance) FROM accs),0), 2)
  );
$function$;

-- 2. EXPENSE BREAKDOWN -------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpt_expense_breakdown(_brand_ids uuid[], _from date, _to date, _dim text DEFAULT 'category')
RETURNS TABLE(label text, amount numeric, txns bigint, budget numeric, variance numeric, in_pnl boolean)
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  WITH tx AS (
    SELECT t.*, c.name AS cat_name, COALESCE(c.excluded_from_pnl,false) AS excl,
           COALESCE(c.is_cogs_category,false) AS is_cogs
    FROM public.erp_transactions t
    LEFT JOIN public.erp_expense_categories c ON c.id = t.category_id
    WHERE t.brand_id = ANY(_brand_ids) AND t.txn_type = 'expense'
      AND t.transaction_date BETWEEN _from AND _to
  ),
  agg AS (
    SELECT CASE _dim
             WHEN 'brand' THEN COALESCE((SELECT b.name FROM public.brands b WHERE b.id = tx.brand_id), 'Unknown')
             WHEN 'month' THEN to_char(date_trunc('month', tx.transaction_date), 'YYYY-MM')
             WHEN 'account' THEN COALESCE((SELECT a.name FROM public.erp_accounts a WHERE a.id = tx.account_id), 'No account')
             WHEN 'source' THEN COALESCE(NULLIF(tx.reference_type,''), 'manual')
             ELSE COALESCE(tx.cat_name, 'Uncategorized')
           END AS label,
           SUM(tx.amount)::numeric AS amount,
           COUNT(*)::bigint AS txns,
           bool_or(tx.reference_type IS NULL AND NOT tx.excl AND NOT tx.is_cogs) AS in_pnl,
           MIN(tx.account_id::text) AS acc_id
    FROM tx GROUP BY 1
  )
  SELECT agg.label, ROUND(agg.amount,2), agg.txns,
         b.budget,
         CASE WHEN b.budget IS NULL THEN NULL ELSE ROUND(b.budget - agg.amount, 2) END,
         agg.in_pnl
  FROM agg
  LEFT JOIN LATERAL (
    SELECT SUM(bu.amount)::numeric AS budget FROM public.erp_budgets bu
    WHERE _dim = 'account' AND bu.brand_id = ANY(_brand_ids)
      AND bu.account_id::text = agg.acc_id
      AND bu.month BETWEEN date_trunc('month', _from)::date AND date_trunc('month', _to)::date
  ) b ON true
  ORDER BY 2 DESC;
$function$;

-- 3. BRAND-WISE P&L ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpt_pnl_by_brand(_brand_ids uuid[], _from date, _to date)
RETURNS TABLE(brand_id uuid, brand text, pnl jsonb)
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  SELECT b.id, b.name, public.rpt_pnl_v2(ARRAY[b.id]::uuid[], _from, _to)
  FROM public.brands b
  WHERE b.id = ANY(_brand_ids)
  ORDER BY b.name;
$function$;

-- 4. WAREHOUSE ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpt_warehouse_summary(_brand_ids uuid[], _from date, _to date)
RETURNS TABLE(warehouse_id uuid, warehouse text, code text, skus bigint, stock_qty numeric,
              stock_value numeric, qty_in numeric, qty_out numeric, damaged_qty numeric, adjust_qty numeric)
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  WITH mv AS (
    SELECT m.warehouse_id, m.product_id, m.delta, m.reason, m.created_at,
           COALESCE(NULLIF(m.unit_cost_bdt,0), p.weighted_avg_cost, p.cost_price, 0) AS unit_cost
    FROM public.stock_movements m
    LEFT JOIN public.products p ON p.id = m.product_id
    WHERE m.brand_id = ANY(_brand_ids) AND m.warehouse_id IS NOT NULL
  ),
  onhand AS (
    SELECT warehouse_id, product_id, SUM(delta)::numeric AS qty, MAX(unit_cost) AS unit_cost
    FROM mv GROUP BY 1,2
  ),
  period AS (
    SELECT warehouse_id,
           SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END)::numeric AS qin,
           SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END)::numeric AS qout,
           SUM(CASE WHEN reason ILIKE '%damage%' THEN ABS(delta) ELSE 0 END)::numeric AS dmg,
           SUM(CASE WHEN reason ILIKE '%adjust%' OR reason ILIKE '%stocktake%' THEN ABS(delta) ELSE 0 END)::numeric AS adj
    FROM mv
    WHERE (created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
    GROUP BY 1
  )
  SELECT w.id, w.name, COALESCE(w.code,''),
         COUNT(o.product_id) FILTER (WHERE o.qty <> 0)::bigint,
         ROUND(COALESCE(SUM(o.qty),0),2),
         ROUND(COALESCE(SUM(GREATEST(o.qty,0) * o.unit_cost),0),2),
         ROUND(COALESCE(MAX(pr.qin),0),2),
         ROUND(COALESCE(MAX(pr.qout),0),2),
         ROUND(COALESCE(MAX(pr.dmg),0),2),
         ROUND(COALESCE(MAX(pr.adj),0),2)
  FROM public.warehouses w
  LEFT JOIN onhand o ON o.warehouse_id = w.id
  LEFT JOIN period pr ON pr.warehouse_id = w.id
  WHERE w.brand_id = ANY(_brand_ids)
  GROUP BY w.id, w.name, w.code
  ORDER BY 6 DESC;
$function$;

-- 5. TEAM PERFORMANCE --------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpt_team_performance(_brand_ids uuid[], _from date, _to date)
RETURNS TABLE(user_id uuid, person text, confirmed bigint, packed bigint, shipped bigint,
              cancelled bigint, delivered bigint, total_actions bigint, avg_pack_minutes numeric)
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  WITH h AS (
    SELECT sh.changed_by, sh.to_status, sh.order_id, sh.created_at
    FROM public.order_status_history sh
    JOIN public.orders o ON o.id = sh.order_id
    WHERE o.brand_id = ANY(_brand_ids)
      AND sh.changed_by IS NOT NULL
      AND (sh.created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
  ),
  pack AS (
    SELECT sh.order_id, sh.changed_by,
           EXTRACT(EPOCH FROM (sh.created_at - o.created_at))/60 AS mins
    FROM public.order_status_history sh
    JOIN public.orders o ON o.id = sh.order_id
    WHERE o.brand_id = ANY(_brand_ids) AND sh.to_status = 'packed'
      AND sh.changed_by IS NOT NULL
      AND (sh.created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
  )
  SELECT h.changed_by,
         COALESCE(e.full_name, pr.display_name, pr.username, 'Unknown user'),
         COUNT(*) FILTER (WHERE h.to_status = 'confirmed')::bigint,
         COUNT(*) FILTER (WHERE h.to_status IN ('packed','ready_to_ship'))::bigint,
         COUNT(*) FILTER (WHERE h.to_status IN ('shipped','in_transit'))::bigint,
         COUNT(*) FILTER (WHERE h.to_status IN ('cancelled','fake'))::bigint,
         COUNT(*) FILTER (WHERE h.to_status = 'delivered')::bigint,
         COUNT(*)::bigint,
         ROUND(COALESCE((SELECT AVG(mins) FROM pack WHERE pack.changed_by = h.changed_by), 0)::numeric, 1)
  FROM h
  LEFT JOIN public.hr_employees e ON e.user_id = h.changed_by
  LEFT JOIN public.profiles pr ON pr.id = h.changed_by
  GROUP BY h.changed_by, e.full_name, pr.display_name, pr.username
  ORDER BY 8 DESC;
$function$;

-- 6. PRODUCT COST HISTORY ---------------------------------------------
CREATE OR REPLACE FUNCTION public.rpt_product_cost_history(_brand_ids uuid[], _product_id uuid DEFAULT NULL)
RETURNS TABLE(d date, product_id uuid, product_name text, sku text, supplier text,
              source text, reference text, qty numeric, unit_cost numeric, landed_cost numeric)
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  SELECT po.order_date, i.product_id,
         COALESCE(p.title, i.name_snapshot, '—'), COALESCE(p.sku, i.sku_snapshot),
         COALESCE(s.name, 'China supplier'), 'import', po.po_number,
         i.quantity::numeric, ROUND(COALESCE(i.unit_cost_bdt,0),2),
         ROUND(COALESCE(NULLIF(i.landed_cost_bdt,0), i.unit_cost_bdt + COALESCE(po.landed_cost_per_unit_bdt,0)),2)
  FROM public.imp_po_items i
  JOIN public.imp_purchase_orders po ON po.id = i.po_id
  LEFT JOIN public.products p ON p.id = i.product_id
  LEFT JOIN public.erp_suppliers s ON s.id = po.supplier_id
  WHERE po.brand_id = ANY(_brand_ids)
    AND (_product_id IS NULL OR i.product_id = _product_id)
    AND po.status <> 'cancelled'
  UNION ALL
  SELECT lpo.order_date, li.product_id,
         COALESCE(p.title, li.description, '—'), p.sku,
         COALESCE(s.name, 'Local supplier'), 'local', lpo.po_number,
         li.ordered_qty::numeric, ROUND(COALESCE(li.unit_cost,0),2), ROUND(COALESCE(li.unit_cost,0),2)
  FROM public.local_po_items li
  JOIN public.local_purchase_orders lpo ON lpo.id = li.po_id
  LEFT JOIN public.products p ON p.id = li.product_id
  LEFT JOIN public.erp_suppliers s ON s.id = lpo.supplier_id
  WHERE lpo.brand_id = ANY(_brand_ids)
    AND (_product_id IS NULL OR li.product_id = _product_id)
    AND lpo.status <> 'cancelled'
  ORDER BY 1 DESC;
$function$;

REVOKE ALL ON FUNCTION public.rpt_cash_flow(uuid[], date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpt_expense_breakdown(uuid[], date, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpt_pnl_by_brand(uuid[], date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpt_warehouse_summary(uuid[], date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpt_team_performance(uuid[], date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpt_product_cost_history(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpt_cash_flow(uuid[], date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_expense_breakdown(uuid[], date, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_pnl_by_brand(uuid[], date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_warehouse_summary(uuid[], date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_team_performance(uuid[], date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_product_cost_history(uuid[], uuid) TO authenticated, service_role;
