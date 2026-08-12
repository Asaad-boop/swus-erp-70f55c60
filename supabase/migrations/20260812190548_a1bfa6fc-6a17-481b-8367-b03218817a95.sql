-- 1) Visible, auditable courier cash adjustments -------------------------------
CREATE TABLE IF NOT EXISTS public.erp_recon_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  courier text NOT NULL DEFAULT 'pathao',
  adj_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  reason text NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_recon_adjustments TO authenticated;
GRANT ALL ON public.erp_recon_adjustments TO service_role;

ALTER TABLE public.erp_recon_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recon adj staff read" ON public.erp_recon_adjustments;
CREATE POLICY "recon adj staff read" ON public.erp_recon_adjustments
  FOR SELECT TO authenticated
  USING (brand_id = ANY (public.get_user_brand_ids(auth.uid())) OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "recon adj staff write" ON public.erp_recon_adjustments;
CREATE POLICY "recon adj staff write" ON public.erp_recon_adjustments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));

CREATE INDEX IF NOT EXISTS idx_recon_adj_brand_date ON public.erp_recon_adjustments (brand_id, adj_date);

DROP TRIGGER IF EXISTS trg_recon_adj_updated ON public.erp_recon_adjustments;
CREATE TRIGGER trg_recon_adj_updated BEFORE UPDATE ON public.erp_recon_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- migrate the previously hardcoded correction into real data
INSERT INTO public.erp_recon_adjustments (brand_id, courier, adj_date, amount, reason, note)
SELECT b.id, 'pathao', DATE '2026-08-10', -190.00,
       'Two Pathao return fees (2 x 95) charged in portal but missing from imported invoice rows',
       'Migrated from a hardcoded report correction on 2026-08-12'
FROM public.brands b
WHERE lower(b.name) = 'hobbyshop'
  AND NOT EXISTS (
    SELECT 1 FROM public.erp_recon_adjustments a
    WHERE a.brand_id = b.id AND a.adj_date = DATE '2026-08-10' AND a.amount = -190.00
  );

-- 2) Order ledger summary: no hidden corrections ------------------------------
CREATE OR REPLACE FUNCTION public.rpt_order_ledger_summary(
  _brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'delivered',
  _search text DEFAULT NULL, _status text DEFAULT NULL, _courier text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH r AS (
    SELECT * FROM public.rpt_order_ledger(_brand_ids,_from,_to,_basis,_search,_status,_courier,1000000,0)
  ),
  recon AS (
    SELECT COALESCE(SUM(x.payout),0)::numeric AS raw_received FROM (
      SELECT rr.payout
      FROM public.erp_reconciliation_rows rr
      WHERE rr.brand_id = ANY(_brand_ids)
        AND rr.invoice_date BETWEEN _from AND _to
        AND (rr.applied_income_txn_id IS NOT NULL OR rr.applied_expense_txn_id IS NOT NULL)
      GROUP BY COALESCE(rr.applied_income_txn_id, rr.applied_expense_txn_id), rr.payout
    ) x
  ),
  adj AS (
    SELECT COALESCE(SUM(a.amount),0)::numeric AS amount
    FROM public.erp_recon_adjustments a
    WHERE a.brand_id = ANY(_brand_ids)
      AND a.adj_date BETWEEN _from AND _to
      AND (COALESCE(_courier,'') = '' OR lower(_courier) IN ('all', lower(a.courier)))
  )
  SELECT jsonb_build_object(
    'orders', COALESCE(COUNT(*),0),
    'delivered_orders', COALESCE(SUM(CASE WHEN is_delivered THEN 1 ELSE 0 END),0),
    'returned_orders', COALESCE(SUM(CASE WHEN is_returned THEN 1 ELSE 0 END),0),
    'units', COALESCE(SUM(units),0),
    'order_value', COALESCE(SUM(order_total),0),
    'net_revenue', COALESCE(SUM(net_revenue),0),
    'advance_total', COALESCE(SUM(advance_amount),0),
    'cod_expected', COALESCE(SUM(cod_expected),0),
    'courier_collected', (SELECT raw_received FROM recon) + (SELECT amount FROM adj),
    'courier_collected_raw', (SELECT raw_received FROM recon),
    'courier_adjustments', (SELECT amount FROM adj),
    'courier_charge', COALESCE(SUM(courier_charge),0),
    'collection_diff', (SELECT raw_received FROM recon) + (SELECT amount FROM adj) - COALESCE(SUM(cod_expected),0),
    'cogs', COALESCE(SUM(cogs),0),
    'gross_profit', COALESCE(SUM(gross_profit),0),
    'net_profit', COALESCE(SUM(net_profit),0),
    'reconciled_orders', COALESCE(SUM(CASE WHEN courier_collected <> 0 THEN 1 ELSE 0 END),0),
    'cost_missing_units', COALESCE(SUM(cost_missing_units),0)
  ) FROM r
$function$;

-- 3) Marketing campaigns via the canonical profit source ----------------------
CREATE OR REPLACE FUNCTION public.rpt_marketing_campaigns(_brand_ids uuid[], _from date, _to date)
RETURNS TABLE(campaign_id uuid, campaign_name text, status text, spend numeric, impressions numeric,
              clicks numeric, ctr numeric, cpc numeric, orders numeric, delivered_orders numeric,
              revenue numeric, cogs numeric, gross_profit numeric, net_profit numeric, roas numeric, cac numeric)
LANGUAGE sql
STABLE
SET search_path TO 'public'
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
  perf AS (
    SELECT p.campaign_id,
           SUM(p.delivered_orders)::numeric AS delivered_orders,
           SUM(p.delivered_revenue)::numeric AS revenue,
           SUM(p.cogs)::numeric AS cogs,
           SUM(p.operating_cost)::numeric AS operating_cost
    FROM unnest(_brand_ids) AS b(id)
    CROSS JOIN LATERAL public.get_campaign_profit(b.id, _from, _to) p
    GROUP BY 1
  ),
  ids AS (SELECT campaign_id FROM ads UNION SELECT campaign_id FROM perf)
  SELECT ids.campaign_id,
         COALESCE(c.name, 'Unknown campaign'),
         COALESCE(c.effective_status, c.status, '-'),
         ROUND(COALESCE(a.spend,0),2),
         COALESCE(a.impressions,0),
         COALESCE(a.clicks,0),
         ROUND(100.0 * COALESCE(a.clicks,0) / NULLIF(a.impressions,0),2),
         ROUND(COALESCE(a.spend,0) / NULLIF(a.clicks,0),2),
         COALESCE(p.delivered_orders,0),
         COALESCE(p.delivered_orders,0),
         ROUND(COALESCE(p.revenue,0),2),
         ROUND(COALESCE(p.cogs,0),2),
         ROUND(COALESCE(p.revenue,0) - COALESCE(p.cogs,0) - COALESCE(p.operating_cost,0),2),
         ROUND(COALESCE(p.revenue,0) - COALESCE(p.cogs,0) - COALESCE(p.operating_cost,0) - COALESCE(a.spend,0),2),
         ROUND(COALESCE(p.revenue,0) / NULLIF(a.spend,0),2),
         ROUND(COALESCE(a.spend,0) / NULLIF(p.delivered_orders,0),2)
  FROM ids
  LEFT JOIN ads a ON a.campaign_id = ids.campaign_id
  LEFT JOIN perf p ON p.campaign_id = ids.campaign_id
  LEFT JOIN public.mkt_campaigns c ON c.id = ids.campaign_id
  ORDER BY COALESCE(a.spend,0) DESC;
$function$;

-- 4) Top customers: paging + total count --------------------------------------
DROP FUNCTION IF EXISTS public.rpt_customer_top(uuid[], date, date, text, integer);
CREATE OR REPLACE FUNCTION public.rpt_customer_top(
  _brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'delivered',
  _limit integer DEFAULT 200, _offset integer DEFAULT 0)
RETURNS TABLE(customer_phone text, customer_name text, orders bigint, delivered_orders bigint,
              returned_orders bigint, units numeric, net_revenue numeric, gross_profit numeric,
              contribution_profit numeric, aov numeric, first_order date, last_order date,
              return_rate numeric, is_new boolean, total_count bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH lines AS (
    SELECT * FROM public.rpt_lines(_brand_ids, _from, _to, _basis)
    WHERE customer_phone IS NOT NULL AND customer_phone <> ''
  ),
  ord AS (
    SELECT order_id, customer_phone, MAX(day) AS day,
           bool_or(is_delivered) AS is_delivered,
           bool_or(is_returned) AS is_returned,
           SUM(CASE WHEN is_delivered THEN quantity ELSE 0 END) AS units,
           SUM(CASE WHEN is_delivered THEN net_revenue ELSE 0 END) AS revenue,
           SUM(CASE WHEN is_delivered THEN net_revenue - line_cogs ELSE 0 END) AS gross_profit,
           SUM(CASE WHEN is_delivered THEN net_revenue - line_cogs - courier_cost - packaging_cost - refund_alloc ELSE 0 END) AS contribution
    FROM lines GROUP BY order_id, customer_phone
  ),
  names AS (
    SELECT COALESCE(NULLIF(o.shipping_phone,''), o.guest_phone) AS phone,
           MIN((o.created_at AT TIME ZONE 'Asia/Dhaka')::date) AS first_day,
           (array_agg(COALESCE(NULLIF(o.shipping_name,''), o.guest_name) ORDER BY o.created_at DESC))[1] AS name
    FROM public.orders o
    WHERE o.brand_id = ANY(_brand_ids)
      AND COALESCE(NULLIF(o.shipping_phone,''), o.guest_phone) IS NOT NULL
    GROUP BY 1
  ),
  agg AS (
    SELECT
      c.customer_phone,
      n.name AS customer_name,
      COUNT(*)::bigint AS orders,
      COUNT(*) FILTER (WHERE c.is_delivered)::bigint AS delivered_orders,
      COUNT(*) FILTER (WHERE c.is_returned)::bigint AS returned_orders,
      COALESCE(SUM(c.units),0)::numeric AS units,
      ROUND(COALESCE(SUM(c.revenue),0)::numeric, 2) AS net_revenue,
      ROUND(COALESCE(SUM(c.gross_profit),0)::numeric, 2) AS gross_profit,
      ROUND(COALESCE(SUM(c.contribution),0)::numeric, 2) AS contribution_profit,
      ROUND(COALESCE(SUM(c.revenue),0)::numeric / NULLIF(COUNT(*) FILTER (WHERE c.is_delivered),0), 2) AS aov,
      n.first_day AS first_order,
      MAX(c.day) AS last_order,
      ROUND(100.0 * COUNT(*) FILTER (WHERE c.is_returned) / NULLIF(COUNT(*),0), 2) AS return_rate,
      (n.first_day >= _from) AS is_new
    FROM ord c
    LEFT JOIN names n ON n.phone = c.customer_phone
    GROUP BY c.customer_phone, n.name, n.first_day
  )
  SELECT a.*, COUNT(*) OVER ()::bigint AS total_count
  FROM agg a
  ORDER BY a.net_revenue DESC
  LIMIT GREATEST(_limit, 1) OFFSET GREATEST(COALESCE(_offset,0), 0);
$function$;

-- 5) One-call overview --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpt_overview(_brand_ids uuid[], _from date, _to date, _basis text DEFAULT 'delivered')
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'summary', to_jsonb(public.rpt_sales_summary(_brand_ids,_from,_to,_basis)),
    'health',  to_jsonb(public.rpt_data_health(_brand_ids,_from,_to,_basis)),
    'series',  COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.rpt_sales_timeseries(_brand_ids,_from,_to,_basis) t), '[]'::jsonb)
  );
$function$;

GRANT EXECUTE ON FUNCTION public.rpt_overview(uuid[], date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpt_customer_top(uuid[], date, date, text, integer, integer) TO authenticated;