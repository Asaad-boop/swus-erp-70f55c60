
-- Phase 3: Content Journey
CREATE TABLE public.hub_creators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid,
  name text NOT NULL,
  handle text,
  platform text NOT NULL DEFAULT 'facebook',
  followers integer,
  niche text,
  rate numeric NOT NULL DEFAULT 0,
  contact text,
  profile_url text,
  performance_note text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_creators TO authenticated;
GRANT ALL ON public.hub_creators TO service_role;
ALTER TABLE public.hub_creators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub creators brand scoped" ON public.hub_creators FOR ALL TO authenticated
USING (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()))
WITH CHECK (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()));

CREATE TABLE public.hub_content_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid,
  product_id uuid,
  idea_id uuid REFERENCES public.hub_product_ideas(id) ON DELETE SET NULL,
  title text NOT NULL,
  angle text,
  platform text NOT NULL DEFAULT 'facebook',
  asset_type text NOT NULL DEFAULT 'ugc',
  owner_id uuid,
  budget numeric NOT NULL DEFAULT 0,
  launch_date date,
  deadline date,
  status text NOT NULL DEFAULT 'planned',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_content_plans TO authenticated;
GRANT ALL ON public.hub_content_plans TO service_role;
ALTER TABLE public.hub_content_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub content plans brand scoped" ON public.hub_content_plans FOR ALL TO authenticated
USING (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()))
WITH CHECK (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()));
CREATE INDEX hub_content_plans_brand_idx ON public.hub_content_plans(brand_id, status);
CREATE INDEX hub_content_plans_product_idx ON public.hub_content_plans(product_id);

CREATE TABLE public.hub_content_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.hub_content_plans(id) ON DELETE CASCADE,
  creator_id uuid REFERENCES public.hub_creators(id) ON DELETE SET NULL,
  deliverable text,
  agreed_budget numeric NOT NULL DEFAULT 0,
  actual_cost numeric NOT NULL DEFAULT 0,
  deadline date,
  status text NOT NULL DEFAULT 'briefed',
  result_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_content_assignments TO authenticated;
GRANT ALL ON public.hub_content_assignments TO service_role;
ALTER TABLE public.hub_content_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub content assignments via plan" ON public.hub_content_assignments FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.hub_content_plans p WHERE p.id = plan_id AND (p.brand_id IS NULL OR p.brand_id = ANY (get_user_brand_ids()))))
WITH CHECK (EXISTS (SELECT 1 FROM public.hub_content_plans p WHERE p.id = plan_id AND (p.brand_id IS NULL OR p.brand_id = ANY (get_user_brand_ids()))));
CREATE INDEX hub_content_assignments_plan_idx ON public.hub_content_assignments(plan_id);

CREATE TRIGGER hub_creators_updated BEFORE UPDATE ON public.hub_creators FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER hub_content_plans_updated BEFORE UPDATE ON public.hub_content_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER hub_content_assignments_updated BEFORE UPDATE ON public.hub_content_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Stock arrival -> auto content task
CREATE OR REPLACE FUNCTION public.hub_content_task_on_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand uuid;
  v_name text;
BEGIN
  IF NEW.product_id IS NULL OR COALESCE(NEW.quantity,0) <= 0 THEN
    RETURN NEW;
  END IF;
  SELECT r.brand_id INTO v_brand FROM imp_po_releases r WHERE r.id = NEW.release_id;
  SELECT p.name INTO v_name FROM products p WHERE p.id = NEW.product_id;
  IF EXISTS (SELECT 1 FROM hub_content_plans cp WHERE cp.product_id = NEW.product_id) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM hub_tasks t
    WHERE t.link_type = 'content_needed' AND t.link_id = NEW.product_id::text AND t.status <> 'done'
  ) THEN
    RETURN NEW;
  END IF;
  INSERT INTO hub_tasks (brand_id, title, details, priority, status, link_type, link_id, link_label, due_date)
  VALUES (
    v_brand,
    'Content plan দরকার: ' || COALESCE(v_name, NEW.sku_snapshot, 'Product'),
    'Stock এসে গেছে — এই product-এর জন্য content plan তৈরি করো (Growth Hub → Content Journey).',
    'high', 'todo', 'content_needed', NEW.product_id::text,
    COALESCE(v_name, NEW.sku_snapshot), (now() AT TIME ZONE 'Asia/Dhaka')::date + 3
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hub_content_task_on_release ON public.imp_po_release_items;
CREATE TRIGGER trg_hub_content_task_on_release
AFTER INSERT ON public.imp_po_release_items
FOR EACH ROW EXECUTE FUNCTION public.hub_content_task_on_release();
