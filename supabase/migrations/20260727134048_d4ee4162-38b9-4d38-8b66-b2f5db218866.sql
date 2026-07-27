ALTER TABLE public.imp_purchase_orders
  ADD COLUMN IF NOT EXISTS receive_mode text NOT NULL DEFAULT 'carton';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'imp_po_receive_mode_chk') THEN
    ALTER TABLE public.imp_purchase_orders
      ADD CONSTRAINT imp_po_receive_mode_chk CHECK (receive_mode IN ('carton','quantity'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.imp_po_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.imp_purchase_orders(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL,
  release_number int NOT NULL,
  warehouse_id uuid,
  released_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (po_id, release_number)
);

CREATE TABLE IF NOT EXISTS public.imp_po_release_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES public.imp_po_releases(id) ON DELETE CASCADE,
  po_item_id uuid NOT NULL REFERENCES public.imp_po_items(id) ON DELETE CASCADE,
  product_id uuid,
  variant_id uuid,
  sku_snapshot text,
  quantity int NOT NULL CHECK (quantity > 0),
  damaged_qty int NOT NULL DEFAULT 0 CHECK (damaged_qty >= 0),
  unit_landed_cost_bdt numeric NOT NULL DEFAULT 0,
  stock_movement_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imp_po_releases_po ON public.imp_po_releases(po_id);
CREATE INDEX IF NOT EXISTS idx_imp_po_release_items_release ON public.imp_po_release_items(release_id);
CREATE INDEX IF NOT EXISTS idx_imp_po_release_items_po_item ON public.imp_po_release_items(po_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imp_po_releases TO authenticated;
GRANT ALL ON public.imp_po_releases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imp_po_release_items TO authenticated;
GRANT ALL ON public.imp_po_release_items TO service_role;

ALTER TABLE public.imp_po_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imp_po_release_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff view po releases" ON public.imp_po_releases;
CREATE POLICY "Staff view po releases" ON public.imp_po_releases
FOR SELECT TO authenticated
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'accountant'::app_role) OR
  has_role((SELECT auth.uid()), 'operations'::app_role) OR
  has_role((SELECT auth.uid()), 'warehouse_staff'::app_role)
);

DROP POLICY IF EXISTS "Ops manage po releases" ON public.imp_po_releases;
CREATE POLICY "Ops manage po releases" ON public.imp_po_releases
FOR ALL TO authenticated
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'operations'::app_role) OR
  has_role((SELECT auth.uid()), 'warehouse_staff'::app_role)
)
WITH CHECK (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'operations'::app_role) OR
  has_role((SELECT auth.uid()), 'warehouse_staff'::app_role)
);

DROP POLICY IF EXISTS "Staff view po release items" ON public.imp_po_release_items;
CREATE POLICY "Staff view po release items" ON public.imp_po_release_items
FOR SELECT TO authenticated
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'accountant'::app_role) OR
  has_role((SELECT auth.uid()), 'operations'::app_role) OR
  has_role((SELECT auth.uid()), 'warehouse_staff'::app_role)
);

DROP POLICY IF EXISTS "Ops manage po release items" ON public.imp_po_release_items;
CREATE POLICY "Ops manage po release items" ON public.imp_po_release_items
FOR ALL TO authenticated
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'operations'::app_role) OR
  has_role((SELECT auth.uid()), 'warehouse_staff'::app_role)
)
WITH CHECK (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'operations'::app_role) OR
  has_role((SELECT auth.uid()), 'warehouse_staff'::app_role)
);