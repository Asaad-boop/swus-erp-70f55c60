
-- ============================================================
-- P2: Weighted Average Cost (WAC) canonical engine
-- ============================================================

-- 1) Backfill cost on legacy opening_stock / stock_in movements
UPDATE public.stock_movements sm
SET unit_cost_bdt = v.weighted_avg_cost,
    total_cost_bdt = sm.delta * v.weighted_avg_cost
FROM public.product_variants v
WHERE sm.variant_id = v.id
  AND sm.reason IN ('opening_stock','stock_in','ledger_reconciliation')
  AND sm.delta > 0
  AND COALESCE(sm.unit_cost_bdt,0) = 0
  AND COALESCE(v.weighted_avg_cost,0) > 0;

UPDATE public.stock_movements sm
SET unit_cost_bdt = COALESCE(NULLIF(p.cost_price,0), NULLIF(p.weighted_avg_cost,0)),
    total_cost_bdt = sm.delta * COALESCE(NULLIF(p.cost_price,0), NULLIF(p.weighted_avg_cost,0))
FROM public.products p
WHERE sm.product_id = p.id
  AND sm.variant_id IS NULL
  AND sm.reason IN ('opening_stock','stock_in','ledger_reconciliation')
  AND sm.delta > 0
  AND COALESCE(sm.unit_cost_bdt,0) = 0
  AND COALESCE(NULLIF(p.cost_price,0), NULLIF(p.weighted_avg_cost,0)) > 0;

-- 2) Canonical WAC calculator: ledger-derived
CREATE OR REPLACE FUNCTION public.inv_wac_calc(_product_id uuid, _variant_id uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN SUM(sm.delta) > 0
              THEN ROUND(SUM(sm.delta * sm.unit_cost_bdt) / SUM(sm.delta), 4)
              ELSE NULL END
  FROM public.stock_movements sm
  WHERE sm.delta > 0
    AND COALESCE(sm.unit_cost_bdt,0) > 0
    AND sm.reason NOT IN ('order_return','order_return_backfill','order_sale_reversal','order_return_reversal')
    AND (
      (_variant_id IS NOT NULL AND sm.variant_id = _variant_id)
      OR (_variant_id IS NULL AND sm.product_id = _product_id AND sm.variant_id IS NULL)
    );
$$;

-- 3) Canonical recompute: writes WAC + total_cost_value + cost_price mirror
CREATE OR REPLACE FUNCTION public.inv_recompute_wac(_product_id uuid, _variant_id uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wac numeric;
  v_stock integer;
  v_is_combo boolean;
BEGIN
  IF _variant_id IS NOT NULL THEN
    v_wac := public.inv_wac_calc(NULL, _variant_id);
    IF v_wac IS NULL THEN
      SELECT NULLIF(weighted_avg_cost,0) INTO v_wac FROM public.product_variants WHERE id = _variant_id;
    END IF;
    UPDATE public.product_variants
      SET weighted_avg_cost = COALESCE(v_wac,0), updated_at = now()
    WHERE id = _variant_id;
    -- roll parent product cost up from variants (qty weighted, fallback simple avg)
    SELECT product_id INTO _product_id FROM public.product_variants WHERE id = _variant_id;
  END IF;

  IF _product_id IS NULL THEN RETURN v_wac; END IF;

  SELECT COALESCE(is_combo,false), COALESCE(stock,0) INTO v_is_combo, v_stock
  FROM public.products WHERE id = _product_id;

  IF v_is_combo THEN
    SELECT SUM(COALESCE(ci.quantity,1) * COALESCE(NULLIF(cp.weighted_avg_cost,0), cp.cost_price, 0))
      INTO v_wac
    FROM public.product_combo_items ci
    JOIN public.products cp ON cp.id = ci.child_product_id
    WHERE ci.combo_product_id = _product_id;
  ELSIF EXISTS (SELECT 1 FROM public.product_variants WHERE product_id = _product_id AND is_active IS NOT FALSE) THEN
    SELECT CASE WHEN SUM(GREATEST(COALESCE(stock,0),0)) > 0
                THEN ROUND(SUM(GREATEST(COALESCE(stock,0),0) * COALESCE(weighted_avg_cost,0))
                           / SUM(GREATEST(COALESCE(stock,0),0)), 4)
                ELSE ROUND(AVG(NULLIF(weighted_avg_cost,0)), 4) END
      INTO v_wac
    FROM public.product_variants
    WHERE product_id = _product_id AND is_active IS NOT FALSE;
  ELSE
    v_wac := public.inv_wac_calc(_product_id, NULL);
  END IF;

  IF v_wac IS NULL THEN
    SELECT NULLIF(cost_price,0) INTO v_wac FROM public.products WHERE id = _product_id;
  END IF;

  UPDATE public.products
    SET weighted_avg_cost = COALESCE(v_wac,0),
        cost_price = COALESCE(v_wac,0),
        updated_at = now()
  WHERE id = _product_id;

  RETURN v_wac;
END;
$$;

-- 4) Ledger trigger: any cost-bearing inbound movement refreshes WAC
CREATE OR REPLACE FUNCTION public.trg_stock_movement_wac()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  r := COALESCE(NEW, OLD);
  IF COALESCE(r.unit_cost_bdt,0) > 0 AND COALESCE(r.delta,0) > 0 THEN
    PERFORM public.inv_recompute_wac(r.product_id, r.variant_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS stock_movement_wac ON public.stock_movements;
CREATE TRIGGER stock_movement_wac
AFTER INSERT OR UPDATE OF unit_cost_bdt, delta OR DELETE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.trg_stock_movement_wac();

-- 5) Manual cost edits become documented cost corrections (cost_price = WAC mirror)
CREATE OR REPLACE FUNCTION public.trg_products_cost_override()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.cost_price,0) <> COALESCE(OLD.cost_price,0)
     AND COALESCE(NEW.weighted_avg_cost,0) = COALESCE(OLD.weighted_avg_cost,0) THEN
    -- user edited cost_price directly -> treat as WAC correction
    NEW.weighted_avg_cost := COALESCE(NEW.cost_price,0);
  ELSIF COALESCE(NEW.weighted_avg_cost,0) <> COALESCE(OLD.weighted_avg_cost,0) THEN
    NEW.cost_price := COALESCE(NEW.weighted_avg_cost,0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_cost_override ON public.products;
CREATE TRIGGER products_cost_override
BEFORE UPDATE OF cost_price, weighted_avg_cost ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trg_products_cost_override();

-- 6) Missing-cost + drift visibility
CREATE OR REPLACE VIEW public.inv_missing_cost
WITH (security_invoker = true) AS
SELECT p.id AS product_id,
       v.id AS variant_id,
       p.brand_id,
       p.sku,
       p.title,
       COALESCE(v.color_name, v.sku) AS variant_label,
       COALESCE(v.stock, p.stock, 0) AS stock,
       COALESCE(v.weighted_avg_cost, p.weighted_avg_cost, 0) AS wac
FROM public.products p
LEFT JOIN public.product_variants v ON v.product_id = p.id AND v.is_active IS NOT FALSE
WHERE p.is_active IS NOT FALSE
  AND COALESCE(p.is_combo,false) = false
  AND COALESCE(v.weighted_avg_cost, p.weighted_avg_cost, 0) <= 0
  AND (COALESCE(v.stock, p.stock, 0) <> 0
       OR EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.product_id = p.id));

CREATE OR REPLACE FUNCTION public.inv_cost_drift()
RETURNS TABLE(product_id uuid, variant_id uuid, sku text, title text, stored numeric, calculated numeric, diff numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, NULL::uuid, p.sku, p.title,
         COALESCE(p.weighted_avg_cost,0),
         COALESCE(public.inv_wac_calc(p.id, NULL),0),
         ROUND(COALESCE(p.weighted_avg_cost,0) - COALESCE(public.inv_wac_calc(p.id, NULL),0), 2)
  FROM public.products p
  WHERE p.is_active IS NOT FALSE
    AND COALESCE(p.is_combo,false) = false
    AND NOT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id AND v.is_active IS NOT FALSE)
    AND public.inv_wac_calc(p.id, NULL) IS NOT NULL
    AND ABS(COALESCE(p.weighted_avg_cost,0) - public.inv_wac_calc(p.id, NULL)) > 0.05
  UNION ALL
  SELECT v.product_id, v.id, p.sku, p.title,
         COALESCE(v.weighted_avg_cost,0),
         COALESCE(public.inv_wac_calc(NULL, v.id),0),
         ROUND(COALESCE(v.weighted_avg_cost,0) - COALESCE(public.inv_wac_calc(NULL, v.id),0), 2)
  FROM public.product_variants v
  JOIN public.products p ON p.id = v.product_id
  WHERE v.is_active IS NOT FALSE
    AND public.inv_wac_calc(NULL, v.id) IS NOT NULL
    AND ABS(COALESCE(v.weighted_avg_cost,0) - public.inv_wac_calc(NULL, v.id)) > 0.05;
$$;

GRANT SELECT ON public.inv_missing_cost TO authenticated;
GRANT SELECT ON public.inv_missing_cost TO service_role;
GRANT EXECUTE ON FUNCTION public.inv_wac_calc(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inv_recompute_wac(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inv_cost_drift() TO authenticated, service_role;

-- 7) Controlled recompute of every active variant, then product
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.product_variants WHERE is_active IS NOT FALSE LOOP
    PERFORM public.inv_recompute_wac(NULL, r.id);
  END LOOP;
  FOR r IN SELECT id FROM public.products WHERE is_active IS NOT FALSE AND COALESCE(is_combo,false) = false LOOP
    PERFORM public.inv_recompute_wac(r.id, NULL);
  END LOOP;
  FOR r IN SELECT id FROM public.products WHERE is_active IS NOT FALSE AND COALESCE(is_combo,false) = true LOOP
    PERFORM public.inv_recompute_wac(r.id, NULL);
  END LOOP;
END $$;
