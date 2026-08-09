-- 1) Sales summary: add shipping income
CREATE OR REPLACE FUNCTION public.rpt_sales_summary(_brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'delivered'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH l AS (SELECT * FROM public.rpt_lines(_brand_ids, _from, _to, _basis)),
  agg AS (
    SELECT
      COUNT(DISTINCT order_id) FILTER (WHERE is_delivered) AS delivered_orders,
      COALESCE(SUM(quantity) FILTER (WHERE is_delivered), 0) AS units_sold,
      COALESCE(SUM(gross_line) FILTER (WHERE is_delivered), 0) AS gross_sales,
      COALESCE(SUM(discount_alloc) FILTER (WHERE is_delivered), 0) AS discounts,
      COALESCE(SUM(net_revenue) FILTER (WHERE is_delivered), 0) AS net_revenue,
      COALESCE(SUM(line_cogs) FILTER (WHERE is_delivered), 0) AS cogs,
      COALESCE(SUM(courier_cost) FILTER (WHERE is_delivered), 0) AS courier_cost,
      COALESCE(SUM(packaging_cost) FILTER (WHERE is_delivered), 0) AS packaging_cost,
      COALESCE(SUM(refund_alloc) FILTER (WHERE is_delivered), 0) AS refunds,
      COALESCE(SUM(net_revenue) FILTER (WHERE is_returned), 0) AS returned_value,
      COALESCE(SUM(courier_cost) FILTER (WHERE is_returned), 0) AS return_courier_cost,
      COALESCE(SUM(quantity) FILTER (WHERE is_delivered AND cost_missing), 0) AS cost_missing_units
    FROM l
  ),
  ship AS (
    SELECT COALESCE(SUM(COALESCE(o.shipping_fee,0)),0)::numeric AS shipping_income
    FROM public.orders o
    WHERE o.id IN (SELECT DISTINCT order_id FROM l WHERE is_delivered)
  ),
  cohort AS (
    SELECT
      COUNT(*) AS placed,
      COUNT(*) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())) AS c_delivered,
      COUNT(*) FILTER (WHERE o.status::text = ANY(public.rpt_returned_statuses())) AS c_returned,
      COUNT(*) FILTER (WHERE o.status::text IN ('cancelled','fake')) AS c_cancelled,
      COUNT(*) FILTER (WHERE NOT (o.status::text = ANY(public.rpt_delivered_statuses()))
                        AND NOT (o.status::text = ANY(public.rpt_returned_statuses()))
                        AND o.status::text NOT IN ('cancelled','fake')) AS c_open
    FROM public.orders o
    WHERE o.brand_id = ANY(_brand_ids)
      AND o.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND o.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  )
  SELECT jsonb_build_object(
    'orders_placed', c.placed,
    'open_orders', c.c_open,
    'delivered_orders', a.delivered_orders,
    'returned_orders', c.c_returned,
    'cancelled_orders', c.c_cancelled,
    'units_sold', a.units_sold,
    'gross_sales', round(a.gross_sales, 2),
    'discounts', round(a.discounts, 2),
    'net_revenue', round(a.net_revenue, 2),
    'shipping_income', round(sh.shipping_income, 2),
    'total_revenue', round(a.net_revenue + sh.shipping_income, 2),
    'cogs', round(a.cogs, 2),
    'gross_profit', round(a.net_revenue - a.cogs, 2),
    'courier_cost', round(a.courier_cost, 2),
    'packaging_cost', round(a.packaging_cost, 2),
    'refunds', round(a.refunds, 2),
    'returned_value', round(a.returned_value, 2),
    'return_courier_cost', round(a.return_courier_cost, 2),
    'contribution_profit', round(a.net_revenue + sh.shipping_income - a.cogs - a.courier_cost - a.packaging_cost - a.refunds - a.return_courier_cost, 2),
    'aov', CASE WHEN a.delivered_orders > 0 THEN round(a.net_revenue / a.delivered_orders, 2) ELSE 0 END,
    'delivery_rate', CASE WHEN (c.c_delivered + c.c_returned + c.c_cancelled) > 0 THEN round(100.0 * c.c_delivered / (c.c_delivered + c.c_returned + c.c_cancelled), 2) ELSE 0 END,
    'return_rate', CASE WHEN (c.c_delivered + c.c_returned) > 0 THEN round(100.0 * c.c_returned / (c.c_delivered + c.c_returned), 2) ELSE 0 END,
    'cancel_rate', CASE WHEN c.placed > 0 THEN round(100.0 * c.c_cancelled / c.placed, 2) ELSE 0 END,
    'cost_missing_units', a.cost_missing_units
  ) FROM agg a CROSS JOIN cohort c CROSS JOIN ship sh;
$function$;

-- 2) P&L: shipping income line
CREATE OR REPLACE FUNCTION public.rpt_pnl_v2(_brand_ids uuid[], _from date, _to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH s AS (
    SELECT public.rpt_sales_summary(_brand_ids, _from, _to, 'delivered') AS j
  ),
  m AS (
    SELECT public.rpt_marketing_summary(_brand_ids, _from, _to) AS j
  ),
  opex AS (
    SELECT COALESCE(c.name, 'Uncategorized') AS name, SUM(t.amount)::numeric AS total
    FROM public.erp_transactions t
    LEFT JOIN public.erp_expense_categories c ON c.id = t.category_id
    WHERE t.brand_id = ANY(_brand_ids)
      AND t.txn_type = 'expense'
      AND t.transaction_date BETWEEN _from AND _to
      AND t.reference_type IS NULL
      AND COALESCE(c.excluded_from_pnl, false) = false
      AND COALESCE(c.is_cogs_category, false) = false
    GROUP BY 1
  ),
  other_income AS (
    SELECT COALESCE(SUM(t.amount), 0)::numeric AS total
    FROM public.erp_transactions t
    LEFT JOIN public.erp_expense_categories c ON c.id = t.category_id
    WHERE t.brand_id = ANY(_brand_ids)
      AND t.txn_type = 'income'
      AND t.transaction_date BETWEEN _from AND _to
      AND t.reference_type IS NULL
      AND COALESCE(c.excluded_from_pnl, false) = false
  ),
  v AS (
    SELECT
      (SELECT (j->>'net_revenue')::numeric FROM s)          AS net_revenue,
      (SELECT (j->>'shipping_income')::numeric FROM s)      AS shipping_income,
      (SELECT (j->>'gross_sales')::numeric FROM s)          AS gross_sales,
      (SELECT (j->>'discounts')::numeric FROM s)            AS discounts,
      (SELECT (j->>'cogs')::numeric FROM s)                 AS cogs,
      (SELECT (j->>'courier_cost')::numeric FROM s)         AS courier_cost,
      (SELECT (j->>'packaging_cost')::numeric FROM s)       AS packaging_cost,
      (SELECT (j->>'refunds')::numeric FROM s)              AS refunds,
      (SELECT (j->>'return_courier_cost')::numeric FROM s)  AS return_courier_cost,
      (SELECT (j->>'delivered_orders')::numeric FROM s)     AS delivered_orders,
      (SELECT (j->>'units_sold')::numeric FROM s)           AS units_sold,
      (SELECT (j->>'cost_missing_units')::numeric FROM s)   AS cost_missing_units,
      COALESCE((SELECT (j->>'total_spend')::numeric FROM m), 0) AS ad_spend,
      COALESCE((SELECT SUM(total) FROM opex), 0)            AS opex_total,
      (SELECT total FROM other_income)                      AS other_income
  ),
  calc AS (
    SELECT v.*,
      (v.net_revenue + v.shipping_income) AS total_revenue,
      (v.net_revenue - v.cogs) AS gross_profit,
      (v.net_revenue + v.shipping_income - v.cogs - v.courier_cost - v.packaging_cost - v.refunds - v.return_courier_cost) AS contribution_profit
    FROM v
  )
  SELECT jsonb_build_object(
    'gross_sales', round(c.gross_sales, 2),
    'discounts', round(c.discounts, 2),
    'net_revenue', round(c.net_revenue, 2),
    'shipping_income', round(c.shipping_income, 2),
    'total_revenue', round(c.total_revenue, 2),
    'cogs', round(c.cogs, 2),
    'gross_profit', round(c.gross_profit, 2),
    'gross_margin_pct', CASE WHEN c.net_revenue > 0 THEN round(100.0 * c.gross_profit / c.net_revenue, 2) ELSE 0 END,
    'courier_cost', round(c.courier_cost, 2),
    'packaging_cost', round(c.packaging_cost, 2),
    'return_loss', round(c.refunds + c.return_courier_cost, 2),
    'refunds', round(c.refunds, 2),
    'return_courier_cost', round(c.return_courier_cost, 2),
    'contribution_profit', round(c.contribution_profit, 2),
    'ad_spend', round(c.ad_spend, 2),
    'opex_total', round(c.opex_total, 2),
    'opex_by_category', COALESCE((SELECT jsonb_object_agg(name, round(total, 2)) FROM opex), '{}'::jsonb),
    'other_income', round(c.other_income, 2),
    'net_profit', round(c.contribution_profit - c.ad_spend - c.opex_total + c.other_income, 2),
    'net_margin_pct', CASE WHEN c.total_revenue > 0 THEN round(100.0 * (c.contribution_profit - c.ad_spend - c.opex_total + c.other_income) / c.total_revenue, 2) ELSE 0 END,
    'delivered_orders', c.delivered_orders,
    'units_sold', c.units_sold,
    'cost_missing_units', c.cost_missing_units
  ) FROM calc c;
$function$;

-- 3) Returns summary: cohort-consistent rate + actual loss fallback
CREATE OR REPLACE FUNCTION public.rpt_returns_summary(_brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'delivered'::text)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH l AS (SELECT * FROM public.rpt_lines(_brand_ids, _from, _to, _basis)),
  o AS (
    SELECT order_id,
           bool_or(is_delivered) AS is_delivered,
           bool_or(is_returned) AS is_returned,
           SUM(net_revenue) AS net_revenue,
           SUM(line_cogs) AS cogs,
           MAX(courier_cost) AS courier_cost
    FROM l GROUP BY order_id
  ),
  cohort AS (
    SELECT
      COUNT(*) FILTER (WHERE o2.status::text = ANY(public.rpt_delivered_statuses())) AS c_delivered,
      COUNT(*) FILTER (WHERE o2.status::text = ANY(public.rpt_returned_statuses())) AS c_returned
    FROM public.orders o2
    WHERE o2.brand_id = ANY(_brand_ids)
      AND o2.created_at >= (_from::timestamp AT TIME ZONE 'Asia/Dhaka')
      AND o2.created_at <  ((_to::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')
  ),
  rc AS (
    SELECT * FROM public.erp_return_cases r
    WHERE r.brand_id = ANY(_brand_ids)
      AND (r.created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
  ),
  ec AS (
    SELECT * FROM public.erp_exchange_cases e
    WHERE e.brand_id = ANY(_brand_ids)
      AND (e.created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
  ),
  case_loss AS (
    SELECT COALESCE(SUM(COALESCE(refund_amount,0)+COALESCE(product_cost_loss,0)+COALESCE(packaging_loss,0)
                        +COALESCE(outbound_delivery_cost,0)+COALESCE(return_delivery_cost,0)
                        -COALESCE(customer_paid_delivery,0)),0)::numeric AS total
    FROM rc
  ),
  est_loss AS (
    SELECT COALESCE((SELECT SUM(cogs) FROM o WHERE is_returned),0)
         + COALESCE((SELECT SUM(courier_cost) FROM o WHERE is_returned),0)
         + COALESCE((SELECT SUM(refund_amount) FROM rc),0) AS total
  )
  SELECT json_build_object(
    'delivered_orders', (SELECT COUNT(*) FROM o WHERE is_delivered),
    'returned_orders', (SELECT COUNT(*) FROM o WHERE is_returned),
    'return_rate', COALESCE(ROUND(100.0 * (SELECT c_returned FROM cohort)::numeric
                         / NULLIF((SELECT c_delivered + c_returned FROM cohort),0),2),0),
    'return_rate_basis', 'created-cohort (same as Sales tab)',
    'returned_value', ROUND(COALESCE((SELECT SUM(net_revenue) FROM o WHERE is_returned),0),2),
    'returned_cogs', ROUND(COALESCE((SELECT SUM(cogs) FROM o WHERE is_returned),0),2),
    'return_courier_cost', ROUND(COALESCE((SELECT SUM(courier_cost) FROM o WHERE is_returned),0),2),
    'cases', (SELECT COUNT(*) FROM rc),
    'case_units', COALESCE((SELECT SUM(qty) FROM rc),0),
    'refunds', ROUND(COALESCE((SELECT SUM(refund_amount) FROM rc),0),2),
    'product_cost_loss', ROUND(COALESCE((SELECT SUM(product_cost_loss) FROM rc),0),2),
    'packaging_loss', ROUND(COALESCE((SELECT SUM(packaging_loss) FROM rc),0),2),
    'case_delivery_loss', ROUND(COALESCE((SELECT SUM(COALESCE(outbound_delivery_cost,0)+COALESCE(return_delivery_cost,0)) FROM rc),0),2),
    'case_total_loss', ROUND((SELECT total FROM case_loss),2),
    'estimated_loss', ROUND((SELECT total FROM est_loss),2),
    'total_loss', ROUND(GREATEST((SELECT total FROM case_loss), (SELECT total FROM est_loss)),2),
    'loss_source', CASE WHEN (SELECT total FROM case_loss) >= (SELECT total FROM est_loss) THEN 'return cases' ELSE 'actual COGS + courier' END,
    'restocked_units', COALESCE((SELECT SUM(qty) FROM rc WHERE COALESCE(stock_restored,false)),0),
    'pending_cases', (SELECT COUNT(*) FROM rc WHERE COALESCE(status,'open') NOT IN ('resolved','closed','completed')),
    'exchanges', (SELECT COUNT(*) FROM ec),
    'exchange_charges', ROUND(COALESCE((SELECT SUM(exchange_charge_collected) FROM ec),0),2),
    'exchange_loss', ROUND(COALESCE((SELECT SUM(COALESCE(replacement_delivery_cost,0)+COALESCE(return_delivery_cost,0)+COALESCE(product_cost_loss,0)+COALESCE(refund_amount,0)-COALESCE(exchange_charge_collected,0)) FROM ec),0),2)
  );
$function$;

-- 4) Marketing daily: delivered-only revenue/profit
CREATE OR REPLACE FUNCTION public.rpt_marketing_daily(_brand_ids uuid[], _from date, _to date)
 RETURNS TABLE(day date, spend numeric, manual_spend numeric, total_spend numeric, impressions numeric, clicks numeric, orders numeric, delivered_orders numeric, revenue numeric, gross_profit numeric, roas numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH days AS (
    SELECT generate_series(_from, _to, interval '1 day')::date AS day
  ),
  ads AS (
    SELECT i.date AS day,
           SUM(CASE WHEN COALESCE(i.spend_bdt_fifo,0) > 0 THEN i.spend_bdt_fifo
                    ELSE COALESCE(i.spend,0) * public.rpt_usd_bdt_rate() END)::numeric AS spend,
           SUM(COALESCE(i.impressions,0))::numeric AS impressions,
           SUM(COALESCE(i.clicks,0))::numeric AS clicks
    FROM public.mkt_insights_daily i
    WHERE i.brand_id = ANY(_brand_ids) AND i.date BETWEEN _from AND _to
    GROUP BY 1
  ),
  manual AS (
    SELECT m.date AS day, SUM(COALESCE(m.amount,0))::numeric AS manual_spend
    FROM public.mkt_manual_expenses m
    WHERE m.brand_id = ANY(_brand_ids) AND m.date BETWEEN _from AND _to
    GROUP BY 1
  ),
  lines AS (
    SELECT l.day, l.order_id, l.net_revenue, l.line_cogs, l.courier_cost, l.is_delivered
    FROM public.rpt_lines(_brand_ids, _from, _to, 'delivered') l
  ),
  sales AS (
    SELECT day,
           COUNT(DISTINCT order_id)::numeric AS orders,
           COUNT(DISTINCT order_id) FILTER (WHERE is_delivered)::numeric AS delivered_orders,
           COALESCE(SUM(net_revenue) FILTER (WHERE is_delivered),0)::numeric AS revenue,
           COALESCE(SUM(net_revenue - line_cogs) FILTER (WHERE is_delivered),0)::numeric AS gross_profit
    FROM lines GROUP BY 1
  )
  SELECT d.day,
         COALESCE(a.spend,0),
         COALESCE(mn.manual_spend,0),
         COALESCE(a.spend,0) + COALESCE(mn.manual_spend,0),
         COALESCE(a.impressions,0),
         COALESCE(a.clicks,0),
         COALESCE(s.orders,0),
         COALESCE(s.delivered_orders,0),
         ROUND(COALESCE(s.revenue,0),2),
         ROUND(COALESCE(s.gross_profit,0),2),
         ROUND(COALESCE(s.revenue,0) / NULLIF(COALESCE(a.spend,0)+COALESCE(mn.manual_spend,0),0),2)
  FROM days d
  LEFT JOIN ads a ON a.day = d.day
  LEFT JOIN manual mn ON mn.day = d.day
  LEFT JOIN sales s ON s.day = d.day
  ORDER BY d.day;
$function$;

-- 5) Customer segments: revenue excludes delivery charge
CREATE OR REPLACE FUNCTION public.rpt_customer_segments(_brand_ids uuid[], _to date DEFAULT CURRENT_DATE)
 RETURNS TABLE(segment text, customers bigint, orders bigint, revenue numeric, avg_recency_days numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT COALESCE(NULLIF(o.shipping_phone,''), o.guest_phone) AS phone,
           COUNT(*) FILTER (WHERE o.status::text = ANY(public.rpt_delivered_statuses())) AS delivered_orders,
           COUNT(*) AS orders,
           SUM(CASE WHEN o.status::text = ANY(public.rpt_delivered_statuses())
                    THEN GREATEST(COALESCE(o.total,0) - COALESCE(o.shipping_fee,0), 0) ELSE 0 END)::numeric AS revenue,
           MAX((COALESCE(o.delivered_at, o.created_at) AT TIME ZONE 'Asia/Dhaka')::date) AS last_day
    FROM public.orders o
    WHERE o.brand_id = ANY(_brand_ids)
      AND COALESCE(NULLIF(o.shipping_phone,''), o.guest_phone) IS NOT NULL
      AND (o.created_at AT TIME ZONE 'Asia/Dhaka')::date <= _to
    GROUP BY 1
  ),
  seg AS (
    SELECT phone, orders, delivered_orders, revenue,
           (_to - last_day) AS recency,
           CASE
             WHEN (_to - last_day) <= 30 AND delivered_orders >= 3 THEN 'Champions'
             WHEN (_to - last_day) <= 60 AND delivered_orders >= 2 THEN 'Loyal'
             WHEN (_to - last_day) <= 30 AND delivered_orders <= 1 THEN 'New'
             WHEN (_to - last_day) <= 120 THEN 'At risk'
             ELSE 'Lost'
           END AS segment
    FROM base
  )
  SELECT segment, COUNT(*)::bigint, SUM(orders)::bigint, ROUND(SUM(revenue),2), ROUND(AVG(recency)::numeric,1)
  FROM seg GROUP BY segment ORDER BY 4 DESC;
$function$;

-- 6) Supply rows: include still-open POs outside the range
DROP FUNCTION IF EXISTS public.rpt_supply_rows(uuid[], date, date);
CREATE OR REPLACE FUNCTION public.rpt_supply_rows(_brand_ids uuid[], _from date, _to date)
 RETURNS TABLE(kind text, po_id uuid, po_number text, supplier text, order_date date, status text, units numeric, total numeric, paid numeric, due numeric, landed_per_unit numeric, cartons numeric, cartons_received numeric, in_range boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT 'import'::text,
         po.id, po.po_number,
         COALESCE(s.name, '—'),
         po.order_date,
         po.status::text,
         COALESCE(po.total_units, (SELECT SUM(i.quantity) FROM public.imp_po_items i WHERE i.po_id = po.id), 0)::numeric,
         ROUND(COALESCE(po.grand_total_bdt,0),2),
         ROUND(COALESCE(po.paid_bdt,0),2),
         ROUND(COALESCE(po.due_bdt, COALESCE(po.grand_total_bdt,0)-COALESCE(po.paid_bdt,0)),2),
         ROUND(COALESCE(po.landed_cost_per_unit_bdt,0),2),
         (SELECT COUNT(*) FROM public.imp_cartons c WHERE c.po_id = po.id)::numeric,
         (SELECT COUNT(*) FROM public.imp_cartons c WHERE c.po_id = po.id AND c.status IN ('arrived_bd','released','in_stock'))::numeric,
         (po.order_date BETWEEN _from AND _to)
  FROM public.imp_purchase_orders po
  LEFT JOIN public.erp_suppliers s ON s.id = po.supplier_id
  WHERE po.brand_id = ANY(_brand_ids)
    AND (
      (po.order_date BETWEEN _from AND _to)
      OR (po.status::text NOT IN ('completed','cancelled')
          AND COALESCE(po.order_date, CURRENT_DATE) <= _to)
    )
  UNION ALL
  SELECT 'local'::text,
         lp.id, lp.po_number,
         COALESCE(s.name, '—'),
         lp.order_date,
         lp.status,
         COALESCE((SELECT SUM(li.ordered_qty) FROM public.local_po_items li WHERE li.po_id = lp.id),0)::numeric,
         ROUND(COALESCE(lp.total,0),2),
         ROUND(COALESCE(lp.amount_paid,0),2),
         ROUND(COALESCE(lp.balance_due, COALESCE(lp.total,0)-COALESCE(lp.amount_paid,0)),2),
         0::numeric, 0::numeric, 0::numeric,
         (lp.order_date BETWEEN _from AND _to)
  FROM public.local_purchase_orders lp
  LEFT JOIN public.erp_suppliers s ON s.id = lp.supplier_id
  WHERE lp.brand_id = ANY(_brand_ids)
    AND (
      (lp.order_date BETWEEN _from AND _to)
      OR (COALESCE(lp.status,'') NOT IN ('completed','cancelled','received')
          AND COALESCE(lp.order_date, CURRENT_DATE) <= _to)
    )
  ORDER BY 5 DESC NULLS LAST;
$function$;

-- 7) Supply summary: carton stats follow the same PO set
CREATE OR REPLACE FUNCTION public.rpt_supply_summary(_brand_ids uuid[], _from date, _to date)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH r AS (SELECT * FROM public.rpt_supply_rows(_brand_ids, _from, _to)),
  pay AS (
    SELECT COALESCE(SUM(COALESCE(p.amount_bdt,0)),0) AS paid
    FROM public.imp_payments p
    WHERE p.brand_id = ANY(_brand_ids)
      AND COALESCE(p.is_reversed,false) = false
      AND p.payment_date BETWEEN _from AND _to
  ),
  ct AS (
    SELECT COUNT(*) FILTER (WHERE c.status IN ('ordered','at_china_warehouse','in_transit')) AS in_transit,
           COALESCE(SUM(c.total_landed_bdt) FILTER (WHERE c.status IN ('ordered','at_china_warehouse','in_transit')),0) AS in_transit_value,
           COUNT(*) FILTER (WHERE c.status IN ('released','in_stock')) AS received
    FROM public.imp_cartons c
    WHERE c.po_id IN (SELECT po_id FROM r WHERE kind = 'import')
  )
  SELECT json_build_object(
    'pos', (SELECT COUNT(*) FROM r),
    'import_pos', (SELECT COUNT(*) FROM r WHERE kind = 'import'),
    'local_pos', (SELECT COUNT(*) FROM r WHERE kind = 'local'),
    'units_ordered', COALESCE((SELECT SUM(units) FROM r),0),
    'po_value', ROUND(COALESCE((SELECT SUM(total) FROM r),0),2),
    'paid', ROUND(COALESCE((SELECT SUM(paid) FROM r),0),2),
    'due', ROUND(COALESCE((SELECT SUM(due) FROM r),0),2),
    'payments_in_range', ROUND(COALESCE((SELECT paid FROM pay),0),2),
    'avg_landed_cost', ROUND(COALESCE((SELECT AVG(landed_per_unit) FROM r WHERE landed_per_unit > 0),0),2),
    'cartons_in_transit', COALESCE((SELECT in_transit FROM ct),0),
    'in_transit_value', ROUND(COALESCE((SELECT in_transit_value FROM ct),0),2),
    'cartons_received', COALESCE((SELECT received FROM ct),0)
  );
$function$;

-- 8) Grants
GRANT EXECUTE ON FUNCTION public.rpt_sales_summary(uuid[], date, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_pnl_v2(uuid[], date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_returns_summary(uuid[], date, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_marketing_daily(uuid[], date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_marketing_summary(uuid[], date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_customer_segments(uuid[], date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_supply_rows(uuid[], date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_supply_summary(uuid[], date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpt_lines(uuid[], date, date, text) TO authenticated, service_role;