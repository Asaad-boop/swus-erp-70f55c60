-- Derived stock for combo products = min(child available stock / qty per combo)
CREATE OR REPLACE FUNCTION public.combo_derived_stock(_combo_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(MIN(
    FLOOR(
      GREATEST(COALESCE(
        CASE WHEN ci.child_variant_id IS NOT NULL THEN pv.stock ELSE c.stock END, 0), 0)
      / NULLIF(ci.quantity, 0)
    )
  )::int, 0)
  FROM public.product_combo_items ci
  LEFT JOIN public.products c ON c.id = ci.child_product_id
  LEFT JOIN public.product_variants pv ON pv.id = ci.child_variant_id
  WHERE ci.combo_product_id = _combo_id;
$$;

CREATE OR REPLACE FUNCTION public.recalc_combo_stock(_combo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v int;
BEGIN
  SELECT public.combo_derived_stock(_combo_id) INTO v;
  UPDATE public.products p
     SET stock = v,
         updated_at = now()
   WHERE p.id = _combo_id
     AND p.is_combo = true
     AND (p.stock IS DISTINCT FROM v);
END;
$$;

-- When a child product's stock changes, refresh every combo that uses it
CREATE OR REPLACE FUNCTION public.trg_child_stock_recalc_combos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT ci.combo_product_id
    FROM public.product_combo_items ci
    WHERE ci.child_product_id = NEW.id
  LOOP
    PERFORM public.recalc_combo_stock(r.combo_product_id);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_child_stock_recalc_combos ON public.products;
CREATE TRIGGER trg_products_child_stock_recalc_combos
AFTER UPDATE OF stock ON public.products
FOR EACH ROW
WHEN (COALESCE(NEW.is_combo, false) = false AND OLD.stock IS DISTINCT FROM NEW.stock)
EXECUTE FUNCTION public.trg_child_stock_recalc_combos();

CREATE OR REPLACE FUNCTION public.trg_variant_stock_recalc_combos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT ci.combo_product_id
    FROM public.product_combo_items ci
    WHERE ci.child_variant_id = NEW.id
  LOOP
    PERFORM public.recalc_combo_stock(r.combo_product_id);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_variants_stock_recalc_combos ON public.product_variants;
CREATE TRIGGER trg_variants_stock_recalc_combos
AFTER UPDATE OF stock ON public.product_variants
FOR EACH ROW
WHEN (OLD.stock IS DISTINCT FROM NEW.stock)
EXECUTE FUNCTION public.trg_variant_stock_recalc_combos();

-- When the combo recipe itself changes, refresh the combo
CREATE OR REPLACE FUNCTION public.trg_combo_items_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_combo_stock(COALESCE(NEW.combo_product_id, OLD.combo_product_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_combo_items_recalc ON public.product_combo_items;
CREATE TRIGGER trg_combo_items_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.product_combo_items
FOR EACH ROW EXECUTE FUNCTION public.trg_combo_items_recalc();

GRANT EXECUTE ON FUNCTION public.combo_derived_stock(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalc_combo_stock(uuid) TO authenticated, service_role;

-- Backfill all existing combos
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.products WHERE is_combo = true LOOP
    PERFORM public.recalc_combo_stock(r.id);
  END LOOP;
END $$;