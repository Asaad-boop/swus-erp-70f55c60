-- Phase 5: Growth Hub monthly planning

CREATE TABLE public.hub_month_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  month date NOT NULL,
  target_revenue numeric NOT NULL DEFAULT 0,
  target_profit numeric NOT NULL DEFAULT 0,
  target_new_products integer NOT NULL DEFAULT 0,
  target_order_qty integer NOT NULL DEFAULT 0,
  target_order_value numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX hub_month_plans_uniq ON public.hub_month_plans (COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_month_plans TO authenticated;
GRANT ALL ON public.hub_month_plans TO service_role;
ALTER TABLE public.hub_month_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub_month_plans_rw" ON public.hub_month_plans FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (public.get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (public.get_user_brand_ids()));

CREATE TABLE public.hub_plan_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  month date NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  planned_units numeric,
  planned_price numeric,
  planned_unit_cost numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX hub_plan_products_uniq ON public.hub_plan_products (COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), month, product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_plan_products TO authenticated;
GRANT ALL ON public.hub_plan_products TO service_role;
ALTER TABLE public.hub_plan_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub_plan_products_rw" ON public.hub_plan_products FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (public.get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (public.get_user_brand_ids()));

CREATE TRIGGER hub_month_plans_updated_at BEFORE UPDATE ON public.hub_month_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER hub_plan_products_updated_at BEFORE UPDATE ON public.hub_plan_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Projection RPC
CREATE OR REPLACE FUNCTION public.hub_month_projection(_brand_ids uuid[], _month date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m_start date := date_trunc('month', _month)::date;
  m_end date := (date_trunc('month', _month) + interval '1 month - 1 day')::date;
  hist_start date := (date_trunc('month', _month) - interval '3 months')::date;
  hist_end date := (date_trunc('month', _month) - interval '1 day')::date;
  today date := CURRENT_DATE;
  days_total int := EXTRACT(day FROM m_end)::int;
  days_done int;
  result jsonb;
BEGIN
  days_done := GREATEST(1, LEAST(days_total,
    CASE WHEN today > m_end THEN days_total WHEN today < m_start THEN 0 ELSE EXTRACT(day FROM today)::int END));

  WITH delivered AS (
    SELECT oi.product_id,
           o.created_at::date AS d,
           oi.quantity::numeric AS qty,
           COALESCE(oi.line_total, oi.price * oi.quantity) AS rev,
           COALESCE(oi.unit_cost_snapshot, p.weighted_avg_cost, p.cost_price, 0) * oi.quantity
             + COALESCE(oi.courier_cost_allocated,0) + COALESCE(oi.packaging_cost_allocated,0)
             + COALESCE(oi.delivery_charge_allocated,0) AS cost
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE o.brand_id = ANY (_brand_ids)
      AND o.status IN ('delivered','completed','partial_delivered')
      AND o.created_at::date BETWEEN hist_start AND m_end
  ),
  hist AS (
    SELECT product_id, SUM(qty) units, SUM(rev) rev, SUM(rev - cost) profit
    FROM delivered WHERE d BETWEEN hist_start AND hist_end GROUP BY product_id
  ),
  mtd AS (
    SELECT product_id, SUM(qty) units, SUM(rev) rev, SUM(rev - cost) profit
    FROM delivered WHERE d BETWEEN m_start AND m_end GROUP BY product_id
  ),
  base AS (
    SELECT p.id, p.title, p.sku, p.image, p.price, p.stock, p.available_stock,
           COALESCE(p.weighted_avg_cost, p.cost_price, 0) AS unit_cost,
           COALESCE(h.units,0) AS hist_units, COALESCE(h.rev,0) AS hist_rev, COALESCE(h.profit,0) AS hist_profit,
           COALESCE(m.units,0) AS mtd_units, COALESCE(m.rev,0) AS mtd_rev, COALESCE(m.profit,0) AS mtd_profit,
           ov.planned_units, ov.planned_price, ov.planned_unit_cost, ov.note
    FROM products p
    LEFT JOIN hist h ON h.product_id = p.id
    LEFT JOIN mtd m ON m.product_id = p.id
    LEFT JOIN hub_plan_products ov ON ov.product_id = p.id AND ov.month = m_start
      AND (ov.brand_id IS NULL OR ov.brand_id = p.brand_id)
    WHERE p.brand_id = ANY (_brand_ids)
      AND (COALESCE(h.units,0) > 0 OR COALESCE(m.units,0) > 0 OR ov.id IS NOT NULL)
  ),
  calc AS (
    SELECT b.*,
      (b.hist_units / 3.0) AS run_rate_units,
      GREATEST(
        COALESCE(b.planned_units,
          GREATEST(b.hist_units / 3.0, b.mtd_units * days_total::numeric / days_done)), 0) AS proj_units,
      COALESCE(b.planned_price, CASE WHEN b.hist_units > 0 THEN b.hist_rev / b.hist_units ELSE b.price END) AS proj_price,
      COALESCE(b.planned_unit_cost,
        CASE WHEN b.hist_units > 0 THEN (b.hist_rev - b.hist_profit) / b.hist_units ELSE b.unit_cost END) AS proj_cost
    FROM base b
  )
  SELECT jsonb_build_object(
    'month', m_start,
    'days_total', days_total,
    'days_done', days_done,
    'products', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'product_id', c.id, 'title', c.title, 'sku', c.sku, 'image', c.image,
        'stock', COALESCE(c.available_stock, c.stock, 0),
        'hist_units', c.hist_units, 'hist_revenue', c.hist_rev, 'hist_profit', c.hist_profit,
        'mtd_units', c.mtd_units, 'mtd_revenue', c.mtd_rev, 'mtd_profit', c.mtd_profit,
        'run_rate_units', c.run_rate_units,
        'planned_units', c.planned_units, 'planned_price', c.planned_price,
        'planned_unit_cost', c.planned_unit_cost, 'note', c.note,
        'proj_units', c.proj_units,
        'proj_price', c.proj_price,
        'proj_cost', c.proj_cost,
        'proj_revenue', c.proj_units * c.proj_price,
        'proj_profit', c.proj_units * (c.proj_price - c.proj_cost),
        'days_of_stock', CASE WHEN c.proj_units > 0
          THEN ROUND(COALESCE(c.available_stock, c.stock, 0) / (c.proj_units / days_total::numeric), 0)
          ELSE NULL END
      ) ORDER BY (c.proj_units * c.proj_price) DESC)
      FROM calc c), '[]'::jsonb),
    'sourcing', (
      SELECT jsonb_build_object(
        'po_count', COALESCE(i.cnt,0) + COALESCE(l.cnt,0),
        'units', COALESCE(i.units,0),
        'value', COALESCE(i.val,0) + COALESCE(l.val,0)
      )
      FROM (SELECT COUNT(*) cnt, SUM(COALESCE(total_units,0)) units, SUM(COALESCE(grand_total_bdt,0)) val
            FROM imp_purchase_orders WHERE brand_id = ANY (_brand_ids) AND order_date BETWEEN m_start AND m_end) i
      CROSS JOIN (SELECT COUNT(*) cnt, SUM(COALESCE(total,0)) val
            FROM local_purchase_orders WHERE brand_id = ANY (_brand_ids) AND order_date BETWEEN m_start AND m_end) l
    ),
    'new_products', (
      SELECT COUNT(*) FROM products p WHERE p.brand_id = ANY (_brand_ids)
        AND p.created_at::date BETWEEN m_start AND m_end
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hub_month_projection(uuid[], date) TO authenticated, service_role;