
-- =========================================================
-- PHASE 4 REPORTS: Marketing / Returns / Supply chain
-- =========================================================

-- ---------- MARKETING ----------
CREATE OR REPLACE FUNCTION public.rpt_usd_bdt_rate()
RETURNS numeric
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT CASE WHEN SUM(usd_amount) > 0 THEN SUM(total_bdt)/SUM(usd_amount) END
       FROM public.meta_dollar_purchases WHERE status='confirmed'),
    (SELECT rate FROM public.erp_fx_rates WHERE from_ccy='USD' AND to_ccy='BDT'
       ORDER BY rate_date DESC LIMIT 1),
    0
  )::numeric;
$function$;

CREATE OR REPLACE FUNCTION public.rpt_marketing_daily(_brand_ids uuid[], _from date, _to date)
RETURNS TABLE(day date, spend numeric, manual_spend numeric, total_spend numeric,
              impressions numeric, clicks numeric, orders numeric, delivered_orders numeric,
              revenue numeric, gross_profit numeric, roas numeric)
LANGUAGE sql STABLE SET search_path TO 'public'
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
           SUM(net_revenue)::numeric AS revenue,
           SUM(net_revenue - line_cogs)::numeric AS gross_profit
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

CREATE OR REPLACE FUNCTION public.rpt_marketing_summary(_brand_ids uuid[], _from date, _to date)
RETURNS json
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH d AS (SELECT * FROM public.rpt_marketing_daily(_brand_ids, _from, _to)),
  agg AS (
    SELECT SUM(spend) spend, SUM(manual_spend) manual_spend, SUM(total_spend) total_spend,
           SUM(impressions) impressions, SUM(clicks) clicks,
           SUM(orders) orders, SUM(delivered_orders) delivered_orders,
           SUM(revenue) revenue, SUM(gross_profit) gross_profit
    FROM d
  ),
  attr AS (
    SELECT COUNT(DISTINCT a.order_id)::numeric AS attributed_orders
    FROM public.mkt_order_attributions a
    JOIN public.orders o ON o.id = a.order_id
    WHERE a.brand_id = ANY(_brand_ids)
      AND (o.created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
  )
  SELECT json_build_object(
    'ad_spend', ROUND(COALESCE(agg.spend,0),2),
    'manual_spend', ROUND(COALESCE(agg.manual_spend,0),2),
    'total_spend', ROUND(COALESCE(agg.total_spend,0),2),
    'impressions', COALESCE(agg.impressions,0),
    'clicks', COALESCE(agg.clicks,0),
    'ctr', ROUND(100.0 * COALESCE(agg.clicks,0) / NULLIF(agg.impressions,0),2),
    'cpc', ROUND(COALESCE(agg.spend,0) / NULLIF(agg.clicks,0),2),
    'cpm', ROUND(1000.0 * COALESCE(agg.spend,0) / NULLIF(agg.impressions,0),2),
    'orders', COALESCE(agg.orders,0),
    'delivered_orders', COALESCE(agg.delivered_orders,0),
    'attributed_orders', COALESCE((SELECT attributed_orders FROM attr),0),
    'revenue', ROUND(COALESCE(agg.revenue,0),2),
    'gross_profit', ROUND(COALESCE(agg.gross_profit,0),2),
    'net_profit', ROUND(COALESCE(agg.gross_profit,0) - COALESCE(agg.total_spend,0),2),
    'roas', ROUND(COALESCE(agg.revenue,0) / NULLIF(agg.total_spend,0),2),
    'cac', ROUND(COALESCE(agg.total_spend,0) / NULLIF(agg.delivered_orders,0),2),
    'spend_pct_revenue', ROUND(100.0 * COALESCE(agg.total_spend,0) / NULLIF(agg.revenue,0),2)
  ) FROM agg;
$function$;

CREATE OR REPLACE FUNCTION public.rpt_marketing_campaigns(_brand_ids uuid[], _from date, _to date)
RETURNS TABLE(campaign_id uuid, campaign_name text, status text, spend numeric,
              impressions numeric, clicks numeric, ctr numeric, cpc numeric,
              orders numeric, delivered_orders numeric, revenue numeric, cogs numeric,
              gross_profit numeric, net_profit numeric, roas numeric, cac numeric)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH ads AS (
    SELECT i.campaign_id,
           SUM(CASE WHEN COALESCE(i.spend_bdt_fifo,0) > 0 THEN i.spend_bdt_fifo
                    ELSE COALESCE(i.spend,0) * public.rpt_usd_bdt_rate() END)::numeric AS spend,
           SUM(COALESCE(i.impressions,0))::numeric AS impressions,
           SUM(COALESCE(i.clicks,0))::numeric AS clicks
    FROM public.mkt_insights_daily i
    WHERE i.brand_id = ANY(_brand_ids) AND i.date BETWEEN _from AND _to
      AND i.campaign_id IS NOT NULL
    GROUP BY 1
  ),
  lines AS (
    SELECT l.order_id, l.net_revenue, l.line_cogs, l.is_delivered
    FROM public.rpt_lines(_brand_ids, _from, _to, 'delivered') l
  ),
  attr AS (
    SELECT DISTINCT ON (a.order_id) a.order_id, a.campaign_id
    FROM public.mkt_order_attributions a
    WHERE a.brand_id = ANY(_brand_ids) AND a.campaign_id IS NOT NULL
    ORDER BY a.order_id, a.confidence DESC NULLS LAST, a.created_at DESC
  ),
  perf AS (
    SELECT at.campaign_id,
           COUNT(DISTINCT l.order_id)::numeric AS orders,
           COUNT(DISTINCT l.order_id) FILTER (WHERE l.is_delivered)::numeric AS delivered_orders,
           SUM(l.net_revenue)::numeric AS revenue,
           SUM(l.line_cogs)::numeric AS cogs
    FROM lines l JOIN attr at ON at.order_id = l.order_id
    GROUP BY 1
  ),
  ids AS (
    SELECT campaign_id FROM ads UNION SELECT campaign_id FROM perf
  )
  SELECT ids.campaign_id,
         COALESCE(c.name, 'Unknown campaign'),
         COALESCE(c.effective_status, c.status, '-'),
         ROUND(COALESCE(a.spend,0),2),
         COALESCE(a.impressions,0),
         COALESCE(a.clicks,0),
         ROUND(100.0 * COALESCE(a.clicks,0) / NULLIF(a.impressions,0),2),
         ROUND(COALESCE(a.spend,0) / NULLIF(a.clicks,0),2),
         COALESCE(p.orders,0),
         COALESCE(p.delivered_orders,0),
         ROUND(COALESCE(p.revenue,0),2),
         ROUND(COALESCE(p.cogs,0),2),
         ROUND(COALESCE(p.revenue,0) - COALESCE(p.cogs,0),2),
         ROUND(COALESCE(p.revenue,0) - COALESCE(p.cogs,0) - COALESCE(a.spend,0),2),
         ROUND(COALESCE(p.revenue,0) / NULLIF(a.spend,0),2),
         ROUND(COALESCE(a.spend,0) / NULLIF(p.delivered_orders,0),2)
  FROM ids
  LEFT JOIN ads a ON a.campaign_id = ids.campaign_id
  LEFT JOIN perf p ON p.campaign_id = ids.campaign_id
  LEFT JOIN public.mkt_campaigns c ON c.id = ids.campaign_id
  ORDER BY COALESCE(a.spend,0) DESC;
$function$;

-- ---------- RETURNS ----------
CREATE OR REPLACE FUNCTION public.rpt_returns_summary(_brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'delivered')
RETURNS json
LANGUAGE sql STABLE SET search_path TO 'public'
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
  rc AS (
    SELECT * FROM public.erp_return_cases r
    WHERE r.brand_id = ANY(_brand_ids)
      AND (r.created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
  ),
  ec AS (
    SELECT * FROM public.erp_exchange_cases e
    WHERE e.brand_id = ANY(_brand_ids)
      AND (e.created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
  )
  SELECT json_build_object(
    'delivered_orders', (SELECT COUNT(*) FROM o WHERE is_delivered),
    'returned_orders', (SELECT COUNT(*) FROM o WHERE is_returned),
    'return_rate', ROUND(100.0 * (SELECT COUNT(*) FROM o WHERE is_returned)::numeric
                         / NULLIF((SELECT COUNT(*) FROM o),0),2),
    'returned_value', ROUND(COALESCE((SELECT SUM(net_revenue) FROM o WHERE is_returned),0),2),
    'returned_cogs', ROUND(COALESCE((SELECT SUM(cogs) FROM o WHERE is_returned),0),2),
    'return_courier_cost', ROUND(COALESCE((SELECT SUM(courier_cost) FROM o WHERE is_returned),0),2),
    'cases', (SELECT COUNT(*) FROM rc),
    'case_units', COALESCE((SELECT SUM(qty) FROM rc),0),
    'refunds', ROUND(COALESCE((SELECT SUM(refund_amount) FROM rc),0),2),
    'product_cost_loss', ROUND(COALESCE((SELECT SUM(product_cost_loss) FROM rc),0),2),
    'packaging_loss', ROUND(COALESCE((SELECT SUM(packaging_loss) FROM rc),0),2),
    'case_delivery_loss', ROUND(COALESCE((SELECT SUM(COALESCE(outbound_delivery_cost,0)+COALESCE(return_delivery_cost,0)) FROM rc),0),2),
    'total_loss', ROUND(COALESCE((SELECT SUM(COALESCE(refund_amount,0)+COALESCE(product_cost_loss,0)+COALESCE(packaging_loss,0)
                                            +COALESCE(outbound_delivery_cost,0)+COALESCE(return_delivery_cost,0)
                                            -COALESCE(customer_paid_delivery,0)) FROM rc),0),2),
    'restocked_units', COALESCE((SELECT SUM(qty) FROM rc WHERE COALESCE(stock_restored,false)),0),
    'pending_cases', (SELECT COUNT(*) FROM rc WHERE COALESCE(status,'open') NOT IN ('resolved','closed','completed')),
    'exchanges', (SELECT COUNT(*) FROM ec),
    'exchange_charges', ROUND(COALESCE((SELECT SUM(exchange_charge_collected) FROM ec),0),2),
    'exchange_loss', ROUND(COALESCE((SELECT SUM(COALESCE(replacement_delivery_cost,0)+COALESCE(return_delivery_cost,0)+COALESCE(product_cost_loss,0)+COALESCE(refund_amount,0)-COALESCE(exchange_charge_collected,0)) FROM ec),0),2)
  );
$function$;

CREATE OR REPLACE FUNCTION public.rpt_returns_products(_brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'delivered')
RETURNS TABLE(product_id uuid, product_name text, sku text, units_sold numeric, returned_units numeric,
              return_rate numeric, returned_value numeric, cost_loss numeric, orders numeric)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH l AS (SELECT * FROM public.rpt_lines(_brand_ids, _from, _to, _basis))
  SELECT l.product_id,
         MAX(l.product_name),
         MAX(l.sku),
         SUM(l.quantity) FILTER (WHERE l.is_delivered),
         SUM(l.quantity) FILTER (WHERE l.is_returned),
         ROUND(100.0 * COALESCE(SUM(l.quantity) FILTER (WHERE l.is_returned),0)
               / NULLIF(SUM(l.quantity) FILTER (WHERE l.is_delivered OR l.is_returned),0),2),
         ROUND(COALESCE(SUM(l.net_revenue) FILTER (WHERE l.is_returned),0),2),
         ROUND(COALESCE(SUM(l.line_cogs) FILTER (WHERE l.is_returned),0),2),
         COUNT(DISTINCT l.order_id) FILTER (WHERE l.is_returned)
  FROM l
  WHERE l.product_id IS NOT NULL
  GROUP BY l.product_id
  HAVING COALESCE(SUM(l.quantity) FILTER (WHERE l.is_returned),0) > 0
  ORDER BY 5 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.rpt_returns_reasons(_brand_ids uuid[], _from date, _to date)
RETURNS TABLE(dimension text, label text, cases numeric, units numeric, loss numeric)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH rc AS (
    SELECT * FROM public.erp_return_cases r
    WHERE r.brand_id = ANY(_brand_ids)
      AND (r.created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN _from AND _to
  ), calc AS (
    SELECT COALESCE(NULLIF(return_type,''),'unspecified') AS rtype,
           COALESCE(NULLIF(item_condition,''), NULLIF(qc_condition,''),'unknown') AS cond,
           COALESCE(NULLIF(courier_name,''),'unassigned') AS courier,
           COALESCE(qty,0) AS qty,
           (COALESCE(refund_amount,0)+COALESCE(product_cost_loss,0)+COALESCE(packaging_loss,0)
            +COALESCE(outbound_delivery_cost,0)+COALESCE(return_delivery_cost,0)
            -COALESCE(customer_paid_delivery,0)) AS loss
    FROM rc
  )
  SELECT 'type'::text, rtype, COUNT(*)::numeric, SUM(qty)::numeric, ROUND(SUM(loss),2) FROM calc GROUP BY rtype
  UNION ALL
  SELECT 'condition'::text, cond, COUNT(*)::numeric, SUM(qty)::numeric, ROUND(SUM(loss),2) FROM calc GROUP BY cond
  UNION ALL
  SELECT 'courier'::text, courier, COUNT(*)::numeric, SUM(qty)::numeric, ROUND(SUM(loss),2) FROM calc GROUP BY courier
  ORDER BY 1, 3 DESC;
$function$;

-- ---------- SUPPLY CHAIN ----------
CREATE OR REPLACE FUNCTION public.rpt_supply_rows(_brand_ids uuid[], _from date, _to date)
RETURNS TABLE(kind text, po_id uuid, po_number text, supplier text, order_date date, status text,
              units numeric, total numeric, paid numeric, due numeric,
              landed_per_unit numeric, cartons numeric, cartons_received numeric)
LANGUAGE sql STABLE SET search_path TO 'public'
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
         (SELECT COUNT(*) FROM public.imp_cartons c WHERE c.po_id = po.id AND c.status IN ('arrived_bd','released','in_stock'))::numeric
  FROM public.imp_purchase_orders po
  LEFT JOIN public.erp_suppliers s ON s.id = po.supplier_id
  WHERE po.brand_id = ANY(_brand_ids) AND po.order_date BETWEEN _from AND _to
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
         0::numeric, 0::numeric, 0::numeric
  FROM public.local_purchase_orders lp
  LEFT JOIN public.erp_suppliers s ON s.id = lp.supplier_id
  WHERE lp.brand_id = ANY(_brand_ids) AND lp.order_date BETWEEN _from AND _to
  ORDER BY 5 DESC NULLS LAST;
$function$;

CREATE OR REPLACE FUNCTION public.rpt_supply_summary(_brand_ids uuid[], _from date, _to date)
RETURNS json
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH r AS (SELECT * FROM public.rpt_supply_rows(_brand_ids, _from, _to)),
  pay AS (
    SELECT SUM(COALESCE(p.amount_bdt,0)) AS paid
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
    JOIN public.imp_purchase_orders po ON po.id = c.po_id
    WHERE po.brand_id = ANY(_brand_ids) AND po.order_date BETWEEN _from AND _to
  )
  SELECT json_build_object(
    'pos', (SELECT COUNT(*) FROM r),
    'import_pos', (SELECT COUNT(*) FROM r WHERE kind='import'),
    'local_pos', (SELECT COUNT(*) FROM r WHERE kind='local'),
    'units_ordered', COALESCE((SELECT SUM(units) FROM r),0),
    'po_value', ROUND(COALESCE((SELECT SUM(total) FROM r),0),2),
    'paid', ROUND(COALESCE((SELECT SUM(paid) FROM r),0),2),
    'due', ROUND(COALESCE((SELECT SUM(due) FROM r),0),2),
    'payments_in_range', ROUND(COALESCE((SELECT paid FROM pay),0),2),
    'avg_landed_cost', ROUND(COALESCE((SELECT SUM(total) FROM r),0) / NULLIF((SELECT SUM(units) FROM r),0),2),
    'cartons_in_transit', COALESCE((SELECT in_transit FROM ct),0),
    'in_transit_value', ROUND(COALESCE((SELECT in_transit_value FROM ct),0),2),
    'cartons_received', COALESCE((SELECT received FROM ct),0)
  );
$function$;

GRANT EXECUTE ON FUNCTION public.rpt_marketing_daily(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_usd_bdt_rate() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_marketing_summary(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_marketing_campaigns(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_returns_summary(uuid[], date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_returns_products(uuid[], date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_returns_reasons(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_supply_rows(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_supply_summary(uuid[], date, date) TO authenticated;
