ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_kind text NOT NULL DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS purchase_unit text,
  ADD COLUMN IF NOT EXISTS unit_conversion numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lead_time_days integer,
  ADD COLUMN IF NOT EXISTS default_supplier_id uuid REFERENCES public.erp_suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stock_location text;
ALTER TABLE public.products ADD CONSTRAINT products_kind_chk CHECK (product_kind IN ('simple','bundle','assembled','component'));
CREATE INDEX IF NOT EXISTS products_kind_idx ON public.products(product_kind);

CREATE TABLE public.bom_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  effective_date date,
  wastage_pct numeric NOT NULL DEFAULT 0 CHECK (wastage_pct >= 0 AND wastage_pct <= 100),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, variant_id, version)
);
CREATE UNIQUE INDEX bom_one_active_idx ON public.bom_headers(product_id, COALESCE(variant_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE status='active';

CREATE TABLE public.bom_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id uuid NOT NULL REFERENCES public.bom_headers(id) ON DELETE CASCADE,
  component_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  component_variant_id uuid REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  uom text NOT NULL DEFAULT 'pcs',
  est_unit_cost numeric,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bom_lines_bom_idx ON public.bom_lines(bom_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bom_headers, public.bom_lines TO authenticated;
GRANT ALL ON public.bom_headers, public.bom_lines TO service_role;
ALTER TABLE public.bom_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage bom" ON public.bom_headers FOR ALL TO authenticated
USING (private._imp_has_any_role(auth.uid(), VARIADIC ARRAY['owner','admin','operations','warehouse_staff','moderator','marketing_manager']) AND (brand_id IS NULL OR public.can_access_brand(auth.uid(), brand_id)))
WITH CHECK (private._imp_has_any_role(auth.uid(), VARIADIC ARRAY['owner','admin','operations','warehouse_staff','moderator','marketing_manager']) AND (brand_id IS NULL OR public.can_access_brand(auth.uid(), brand_id)));
CREATE POLICY "staff manage bom lines" ON public.bom_lines FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.bom_headers h WHERE h.id = bom_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.bom_headers h WHERE h.id = bom_id));

CREATE OR REPLACE FUNCTION public.bom_touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE TRIGGER bom_headers_touch BEFORE UPDATE ON public.bom_headers FOR EACH ROW EXECUTE FUNCTION public.bom_touch_updated_at();
CREATE TRIGGER bom_lines_touch BEFORE UPDATE ON public.bom_lines FOR EACH ROW EXECUTE FUNCTION public.bom_touch_updated_at();

-- Activate a BOM version atomically (archives previous active)
CREATE OR REPLACE FUNCTION public.bom_activate(_bom_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE h public.bom_headers;
BEGIN
  SELECT * INTO h FROM public.bom_headers WHERE id=_bom_id FOR UPDATE;
  IF h.id IS NULL THEN RAISE EXCEPTION 'BOM not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bom_lines WHERE bom_id=_bom_id) THEN RAISE EXCEPTION 'BOM has no components'; END IF;
  UPDATE public.bom_headers SET status='archived'
   WHERE product_id=h.product_id AND variant_id IS NOT DISTINCT FROM h.variant_id AND status='active' AND id<>_bom_id;
  UPDATE public.bom_headers SET status='active', effective_date=COALESCE(effective_date, (now() AT TIME ZONE 'Asia/Dhaka')::date) WHERE id=_bom_id;
END $$;
GRANT EXECUTE ON FUNCTION public.bom_activate(uuid) TO authenticated;