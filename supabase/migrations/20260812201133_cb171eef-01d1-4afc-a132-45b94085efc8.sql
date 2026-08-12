DROP FUNCTION IF EXISTS public.rpt_supplier_performance(uuid[], date, date);

CREATE OR REPLACE FUNCTION public.rpt_supplier_performance(
  _brand_ids uuid[], _from date, _to date
) RETURNS TABLE(
  supplier_id uuid, supplier text, country text, supplier_type text,
  pos bigint, units numeric, po_value numeric, paid numeric, due numeric,
  avg_lead_days numeric, on_time_pct numeric, completed_pos bigint, cancelled_pos bigint,
  avg_landed_cost numeric, last_order date
)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH imp AS (
    SELECT
      COALESCE(po.supplier_id, po.cargo_agent_id) AS party_id,
      COALESCE(s.name, a.name, 'Unassigned') AS party_name,
      COALESCE(s.country, 'CN') AS country,
      CASE WHEN po.supplier_id IS NOT NULL THEN COALESCE(s.supplier_type, 'supplier') ELSE 'cargo agent' END AS party_type,
      COALESCE(po.total_units, 0)::numeric AS units,
      COALESCE(po.grand_total_bdt, 0)::numeric AS total,
      COALESCE(po.paid_bdt, 0)::numeric AS paid,
      COALESCE(po.due_bdt, 0)::numeric AS due,
      COALESCE(po.landed_cost_per_unit_bdt, 0)::numeric AS landed,
      po.order_date::date AS order_date,
      CASE WHEN po.status = 'completed' THEN 1 ELSE 0 END AS completed,
      CASE WHEN po.status = 'cancelled' THEN 1 ELSE 0 END AS cancelled,
      CASE WHEN po.status = 'completed'
           THEN ((po.updated_at AT TIME ZONE 'Asia/Dhaka')::date - po.order_date::date) END AS lead_days,
      NULL::int AS on_time
    FROM public.imp_purchase_orders po
    LEFT JOIN public.erp_suppliers s ON s.id = po.supplier_id
    LEFT JOIN public.imp_cargo_agents a ON a.id = po.cargo_agent_id
    WHERE po.brand_id = ANY(_brand_ids)
      AND po.order_date::date BETWEEN _from AND _to
  ), loc AS (
    SELECT
      lp.supplier_id AS party_id,
      COALESCE(s.name, 'Unassigned') AS party_name,
      COALESCE(s.country, 'BD') AS country,
      COALESCE(s.supplier_type, 'local') AS party_type,
      COALESCE((SELECT SUM(li.ordered_qty) FROM public.local_po_items li WHERE li.po_id = lp.id), 0)::numeric AS units,
      COALESCE(lp.total, 0)::numeric AS total,
      COALESCE(lp.amount_paid, 0)::numeric AS paid,
      COALESCE(lp.balance_due, 0)::numeric AS due,
      0::numeric AS landed,
      lp.order_date::date AS order_date,
      CASE WHEN lp.received_date IS NOT NULL THEN 1 ELSE 0 END AS completed,
      CASE WHEN lp.status = 'cancelled' THEN 1 ELSE 0 END AS cancelled,
      CASE WHEN lp.received_date IS NOT NULL THEN (lp.received_date::date - lp.order_date::date) END AS lead_days,
      CASE WHEN lp.received_date IS NOT NULL AND lp.expected_date IS NOT NULL
           THEN CASE WHEN lp.received_date::date <= lp.expected_date::date THEN 1 ELSE 0 END END AS on_time
    FROM public.local_purchase_orders lp
    LEFT JOIN public.erp_suppliers s ON s.id = lp.supplier_id
    WHERE lp.brand_id = ANY(_brand_ids)
      AND lp.order_date::date BETWEEN _from AND _to
  ), all_po AS (SELECT * FROM imp UNION ALL SELECT * FROM loc)
  SELECT
    a.party_id AS supplier_id,
    a.party_name AS supplier,
    MAX(a.country) AS country,
    MAX(a.party_type) AS supplier_type,
    COUNT(*)::bigint AS pos,
    COALESCE(SUM(a.units), 0) AS units,
    ROUND(COALESCE(SUM(a.total), 0), 2) AS po_value,
    ROUND(COALESCE(SUM(a.paid), 0), 2) AS paid,
    ROUND(COALESCE(SUM(a.due), 0), 2) AS due,
    ROUND(COALESCE(AVG(a.lead_days), 0), 1) AS avg_lead_days,
    CASE WHEN COUNT(a.on_time) > 0 THEN ROUND(100.0 * SUM(a.on_time) / COUNT(a.on_time), 2) ELSE NULL END AS on_time_pct,
    COALESCE(SUM(a.completed), 0)::bigint AS completed_pos,
    COALESCE(SUM(a.cancelled), 0)::bigint AS cancelled_pos,
    ROUND(COALESCE(AVG(NULLIF(a.landed, 0)), 0), 2) AS avg_landed_cost,
    MAX(a.order_date) AS last_order
  FROM all_po a
  GROUP BY a.party_id, a.party_name
  ORDER BY 7 DESC;
$$;

GRANT EXECUTE ON FUNCTION public.rpt_supplier_performance(uuid[], date, date) TO authenticated;