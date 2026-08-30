-- ============ P0: Inventory safety baseline ============

CREATE TABLE IF NOT EXISTS public.inv_snapshot_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  note text,
  created_by uuid,
  row_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.inv_snapshot_runs TO authenticated;
GRANT ALL ON public.inv_snapshot_runs TO service_role;
ALTER TABLE public.inv_snapshot_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read snapshot runs" ON public.inv_snapshot_runs
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.inv_snapshot_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.inv_snapshot_runs(id) ON DELETE CASCADE,
  product_id uuid,
  variant_id uuid,
  brand_id uuid,
  sku text,
  title text,
  stock integer NOT NULL DEFAULT 0,
  reserved_stock integer NOT NULL DEFAULT 0,
  available_stock integer NOT NULL DEFAULT 0,
  ledger_sum integer NOT NULL DEFAULT 0,
  open_order_qty integer NOT NULL DEFAULT 0,
  qc_hold_qty integer NOT NULL DEFAULT 0,
  expected_reserved integer NOT NULL DEFAULT 0,
  weighted_avg_cost numeric NOT NULL DEFAULT 0,
  cost_price numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_snapshot_rows_run ON public.inv_snapshot_rows(run_id);
CREATE INDEX IF NOT EXISTS idx_inv_snapshot_rows_product ON public.inv_snapshot_rows(product_id);

GRANT SELECT ON public.inv_snapshot_rows TO authenticated;
GRANT ALL ON public.inv_snapshot_rows TO service_role;
ALTER TABLE public.inv_snapshot_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read snapshot rows" ON public.inv_snapshot_rows
  FOR SELECT TO authenticated USING (true);

-- ---------- Audit trail on every stock / reserved mutation ----------
CREATE TABLE IF NOT EXISTS public.inv_stock_audit (
  id bigserial PRIMARY KEY,
  entity text NOT NULL,               -- 'product' | 'variant'
  product_id uuid,
  variant_id uuid,
  op text NOT NULL,                   -- INSERT | UPDATE | DELETE
  stock_before integer,
  stock_after integer,
  reserved_before integer,
  reserved_after integer,
  changed_by uuid,
  db_user text NOT NULL DEFAULT current_user,
  app_source text,                    -- set via set_config('app.inv_source', ...)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_stock_audit_product ON public.inv_stock_audit(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_stock_audit_created ON public.inv_stock_audit(created_at DESC);

GRANT SELECT ON public.inv_stock_audit TO authenticated;
GRANT ALL ON public.inv_stock_audit TO service_role;
ALTER TABLE public.inv_stock_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read stock audit" ON public.inv_stock_audit
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.tg_inv_audit_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_entity text := TG_ARGV[0];
BEGIN
  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.stock,0) = COALESCE(NEW.stock,0)
     AND COALESCE(OLD.reserved_stock,0) = COALESCE(NEW.reserved_stock,0) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.inv_stock_audit(
    entity, product_id, variant_id, op,
    stock_before, stock_after, reserved_before, reserved_after,
    changed_by, app_source
  ) VALUES (
    v_entity,
    CASE WHEN v_entity = 'product' THEN NEW.id ELSE NEW.product_id END,
    CASE WHEN v_entity = 'variant' THEN NEW.id ELSE NULL END,
    TG_OP,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.stock ELSE NULL END,
    NEW.stock,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.reserved_stock ELSE NULL END,
    NEW.reserved_stock,
    auth.uid(),
    NULLIF(current_setting('app.inv_source', true), '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inv_audit_products ON public.products;
CREATE TRIGGER trg_inv_audit_products
AFTER INSERT OR UPDATE OF stock, reserved_stock ON public.products
FOR EACH ROW EXECUTE FUNCTION public.tg_inv_audit_stock('product');

DROP TRIGGER IF EXISTS trg_inv_audit_variants ON public.product_variants;
CREATE TRIGGER trg_inv_audit_variants
AFTER INSERT OR UPDATE OF stock, reserved_stock ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.tg_inv_audit_stock('variant');

-- ---------- Canonical expected reservation ----------
CREATE OR REPLACE VIEW public.v_inv_expected_reserved AS
WITH open_orders AS (
  SELECT oi.product_id, oi.variant_id, SUM(COALESCE(oi.quantity,0))::int AS qty
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  LEFT JOIN public.products p ON p.id = oi.product_id
  WHERE public.order_stock_is_reserved_status(o.status)
    AND COALESCE(p.is_combo, false) = false
  GROUP BY 1, 2
),
qc_hold AS (
  SELECT ri.product_id, ri.variant_id, SUM(COALESCE(ri.reserved_qty,0))::int AS qty
  FROM public.imp_po_release_items ri
  WHERE COALESCE(ri.reserved_qty,0) > 0
  GROUP BY 1, 2
)
SELECT
  COALESCE(oo.product_id, qh.product_id) AS product_id,
  COALESCE(oo.variant_id, qh.variant_id) AS variant_id,
  COALESCE(oo.qty, 0) AS open_order_qty,
  COALESCE(qh.qty, 0) AS qc_hold_qty,
  COALESCE(oo.qty, 0) + COALESCE(qh.qty, 0) AS expected_reserved
FROM open_orders oo
FULL OUTER JOIN qc_hold qh
  ON qh.product_id IS NOT DISTINCT FROM oo.product_id
 AND qh.variant_id IS NOT DISTINCT FROM oo.variant_id;

GRANT SELECT ON public.v_inv_expected_reserved TO authenticated, service_role;

-- ---------- Drift view (product level) ----------
CREATE OR REPLACE VIEW public.v_inv_drift AS
SELECT
  p.id AS product_id,
  p.brand_id,
  p.sku,
  p.title,
  p.is_active,
  COALESCE(p.stock,0)                                       AS stock,
  COALESCE(p.reserved_stock,0)                              AS reserved_stock,
  COALESCE(p.available_stock, COALESCE(p.stock,0) - COALESCE(p.reserved_stock,0)) AS available_stock,
  COALESCE(lg.ledger_sum, 0)                                AS ledger_sum,
  COALESCE(p.stock,0) - COALESCE(lg.ledger_sum, 0)          AS ledger_drift,
  COALESCE(er.open_order_qty, 0)                            AS open_order_qty,
  COALESCE(er.qc_hold_qty, 0)                               AS qc_hold_qty,
  COALESCE(er.expected_reserved, 0)                         AS expected_reserved,
  COALESCE(p.reserved_stock,0) - COALESCE(er.expected_reserved, 0) AS reserved_drift,
  COALESCE(p.weighted_avg_cost, 0)                          AS weighted_avg_cost,
  (COALESCE(p.weighted_avg_cost,0) <= 0 AND COALESCE(p.stock,0) > 0) AS missing_cost,
  (COALESCE(p.available_stock, COALESCE(p.stock,0) - COALESCE(p.reserved_stock,0)) < 0) AS is_oversold,
  (COALESCE(lg.movement_count,0) = 0)                       AS has_no_ledger
FROM public.products p
LEFT JOIN (
  SELECT product_id, SUM(delta)::int AS ledger_sum, COUNT(*)::int AS movement_count
  FROM public.stock_movements
  GROUP BY product_id
) lg ON lg.product_id = p.id
LEFT JOIN (
  SELECT product_id,
         SUM(open_order_qty)::int AS open_order_qty,
         SUM(qc_hold_qty)::int AS qc_hold_qty,
         SUM(expected_reserved)::int AS expected_reserved
  FROM public.v_inv_expected_reserved
  WHERE product_id IS NOT NULL
  GROUP BY product_id
) er ON er.product_id = p.id
WHERE COALESCE(p.is_combo, false) = false;

GRANT SELECT ON public.v_inv_drift TO authenticated, service_role;

-- ---------- Snapshot function ----------
CREATE OR REPLACE FUNCTION public.inv_take_snapshot(_label text, _note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_run uuid;
  v_count integer;
BEGIN
  INSERT INTO public.inv_snapshot_runs(label, note, created_by)
  VALUES (_label, _note, auth.uid())
  RETURNING id INTO v_run;

  -- product level
  INSERT INTO public.inv_snapshot_rows(
    run_id, product_id, variant_id, brand_id, sku, title,
    stock, reserved_stock, available_stock, ledger_sum,
    open_order_qty, qc_hold_qty, expected_reserved,
    weighted_avg_cost, cost_price
  )
  SELECT
    v_run, d.product_id, NULL, d.brand_id, d.sku, d.title,
    d.stock, d.reserved_stock, d.available_stock, d.ledger_sum,
    d.open_order_qty, d.qc_hold_qty, d.expected_reserved,
    d.weighted_avg_cost, p.cost_price
  FROM public.v_inv_drift d
  JOIN public.products p ON p.id = d.product_id;

  -- variant level
  INSERT INTO public.inv_snapshot_rows(
    run_id, product_id, variant_id, brand_id, sku, title,
    stock, reserved_stock, available_stock, ledger_sum,
    open_order_qty, qc_hold_qty, expected_reserved,
    weighted_avg_cost
  )
  SELECT
    v_run, v.product_id, v.id, p.brand_id, v.sku, p.title,
    COALESCE(v.stock,0), COALESCE(v.reserved_stock,0),
    COALESCE(v.available_stock, COALESCE(v.stock,0) - COALESCE(v.reserved_stock,0)),
    COALESCE((SELECT SUM(m.delta)::int FROM public.stock_movements m WHERE m.variant_id = v.id), 0),
    COALESCE(er.open_order_qty, 0), COALESCE(er.qc_hold_qty, 0), COALESCE(er.expected_reserved, 0),
    COALESCE(v.weighted_avg_cost, 0)
  FROM public.product_variants v
  JOIN public.products p ON p.id = v.product_id
  LEFT JOIN public.v_inv_expected_reserved er ON er.variant_id = v.id;

  SELECT COUNT(*) INTO v_count FROM public.inv_snapshot_rows WHERE run_id = v_run;
  UPDATE public.inv_snapshot_runs SET row_count = v_count WHERE id = v_run;

  RETURN v_run;
END;
$$;

REVOKE ALL ON FUNCTION public.inv_take_snapshot(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.inv_take_snapshot(text, text) TO authenticated, service_role;