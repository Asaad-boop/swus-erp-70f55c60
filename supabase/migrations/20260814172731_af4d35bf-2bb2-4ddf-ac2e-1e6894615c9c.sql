
-- ============ Agencies ============
CREATE TABLE IF NOT EXISTS public.content_agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  website text,
  services text[] NOT NULL DEFAULT '{}',
  retainer_fee numeric NOT NULL DEFAULT 0,
  commission_pct numeric NOT NULL DEFAULT 0,
  rating numeric,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_agencies TO authenticated;
GRANT ALL ON public.content_agencies TO service_role;
ALTER TABLE public.content_agencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content agencies brand scoped" ON public.content_agencies FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()));

-- ============ Creator extensions ============
ALTER TABLE public.hub_creators
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.content_agencies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS negotiation_status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS min_charge numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_charge numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.content_creator_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.hub_creators(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  direction text NOT NULL DEFAULT 'out',
  summary text NOT NULL,
  outcome text,
  quoted_amount numeric,
  next_follow_up date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_creator_contacts TO authenticated;
GRANT ALL ON public.content_creator_contacts TO service_role;
ALTER TABLE public.content_creator_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content creator contacts brand scoped" ON public.content_creator_contacts FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()));

-- ============ Product content plan (intake) ============
CREATE TABLE IF NOT EXISTS public.content_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  idea_id uuid REFERENCES public.hub_product_ideas(id) ON DELETE SET NULL,
  title text NOT NULL,
  target_count integer NOT NULL DEFAULT 3,
  target_date date,
  budget numeric NOT NULL DEFAULT 0,
  strategy text,
  status text NOT NULL DEFAULT 'active',
  owner_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_plans TO authenticated;
GRANT ALL ON public.content_plans TO service_role;
ALTER TABLE public.content_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content plans brand scoped" ON public.content_plans FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()));

-- ============ Media plans ============
CREATE TABLE IF NOT EXISTS public.content_media_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.content_plans(id) ON DELETE SET NULL,
  title text NOT NULL,
  target_qty integer NOT NULL DEFAULT 0,
  selling_price numeric NOT NULL DEFAULT 0,
  ad_budget numeric NOT NULL DEFAULT 0,
  content_budget numeric NOT NULL DEFAULT 0,
  creator_budget numeric NOT NULL DEFAULT 0,
  channels text[] NOT NULL DEFAULT '{}',
  audience text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_media_plans TO authenticated;
GRANT ALL ON public.content_media_plans TO service_role;
ALTER TABLE public.content_media_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content media plans brand scoped" ON public.content_media_plans FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()));

-- ============ Content items (pipeline cards) ============
CREATE SEQUENCE IF NOT EXISTS public.content_item_code_seq;

CREATE TABLE IF NOT EXISTS public.content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.content_plans(id) ON DELETE CASCADE,
  media_plan_id uuid REFERENCES public.content_media_plans(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  creator_id uuid REFERENCES public.hub_creators(id) ON DELETE SET NULL,
  agency_id uuid REFERENCES public.content_agencies(id) ON DELETE SET NULL,
  code text NOT NULL DEFAULT ('CNT-' || lpad(nextval('public.content_item_code_seq')::text, 4, '0')),
  title text NOT NULL DEFAULT 'Untitled content',
  content_type text NOT NULL DEFAULT 'ugc',
  platform text NOT NULL DEFAULT 'facebook',
  source text NOT NULL DEFAULT 'in_house',
  angle text,
  hook text,
  script text,
  caption text,
  cta text,
  hashtags text,
  reference_urls text[] NOT NULL DEFAULT '{}',
  due_date date,
  cost numeric NOT NULL DEFAULT 0,
  stage text NOT NULL DEFAULT 'ideation',
  status text NOT NULL DEFAULT 'briefed',
  revision_note text,
  video_url text,
  published_url text,
  published_at timestamptz,
  views integer NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  shares integer NOT NULL DEFAULT 0,
  attributed_orders integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS content_items_code_key ON public.content_items(code);
CREATE INDEX IF NOT EXISTS content_items_plan_idx ON public.content_items(plan_id);
CREATE INDEX IF NOT EXISTS content_items_product_idx ON public.content_items(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_items TO authenticated;
GRANT ALL ON public.content_items TO service_role;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content items brand scoped" ON public.content_items FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()));

-- ============ Briefs ============
CREATE TABLE IF NOT EXISTS public.content_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  media_plan_id uuid REFERENCES public.content_media_plans(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.content_items(id) ON DELETE SET NULL,
  creator_id uuid REFERENCES public.hub_creators(id) ON DELETE SET NULL,
  agency_id uuid REFERENCES public.content_agencies(id) ON DELETE SET NULL,
  deliverable_type text NOT NULL DEFAULT 'ugc',
  hook text,
  script text,
  cta text,
  reference_url text,
  due_date date,
  cost numeric NOT NULL DEFAULT 0,
  approval_status text NOT NULL DEFAULT 'pending',
  revision_note text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_briefs TO authenticated;
GRANT ALL ON public.content_briefs TO service_role;
ALTER TABLE public.content_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content briefs brand scoped" ON public.content_briefs FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()));

-- ============ Creator shipments ============
CREATE TABLE IF NOT EXISTS public.content_creator_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  creator_id uuid NOT NULL REFERENCES public.hub_creators(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  item_id uuid REFERENCES public.content_items(id) ON DELETE SET NULL,
  qty integer NOT NULL DEFAULT 1,
  courier text,
  tracking_no text,
  sent_date date,
  delivered_date date,
  status text NOT NULL DEFAULT 'pending',
  cost numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_creator_shipments TO authenticated;
GRANT ALL ON public.content_creator_shipments TO service_role;
ALTER TABLE public.content_creator_shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content shipments brand scoped" ON public.content_creator_shipments FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()));

-- ============ updated_at triggers ============
CREATE OR REPLACE FUNCTION public.content_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['content_agencies','content_plans','content_media_plans','content_items','content_briefs','content_creator_shipments']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_touch ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.content_touch_updated_at()', t, t);
  END LOOP;
END $$;

-- ============ Intake feed RPC ============
CREATE OR REPLACE FUNCTION public.content_intake_feed(_brand_ids uuid[])
RETURNS TABLE (
  product_id uuid,
  title text,
  sku text,
  image text,
  brand_id uuid,
  price numeric,
  stock integer,
  phase text,
  since timestamptz,
  incoming_qty integer,
  po_numbers text[],
  content_count integer,
  published_count integer,
  plan_id uuid,
  plan_target integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH allowed AS (
    SELECT CASE
      WHEN _brand_ids IS NULL OR array_length(_brand_ids, 1) IS NULL
        THEN get_user_brand_ids()
      ELSE _brand_ids
    END AS ids
  ),
  transit AS (
    SELECT i.product_id,
           sum(i.quantity)::int AS qty,
           array_agg(DISTINCT po.po_number) AS pos,
           min(po.order_date)::timestamptz AS since
    FROM imp_po_items i
    JOIN imp_purchase_orders po ON po.id = i.po_id
    WHERE po.status IN ('ordered','at_china_warehouse','in_transit','arrived_bd','partially_received')
      AND i.product_id IS NOT NULL
    GROUP BY i.product_id
  ),
  instock AS (
    SELECT sm.product_id, max(sm.created_at) AS since
    FROM stock_movements sm
    WHERE sm.delta > 0
    GROUP BY sm.product_id
  ),
  counts AS (
    SELECT ci.product_id,
           count(*)::int AS total,
           count(*) FILTER (WHERE ci.stage IN ('published','performance'))::int AS published
    FROM content_items ci
    GROUP BY ci.product_id
  )
  SELECT p.id,
         p.title,
         p.sku,
         p.image,
         p.brand_id,
         p.price,
         COALESCE(p.stock, 0)::int,
         CASE WHEN COALESCE(p.stock,0) > 0 THEN 'in_stock' ELSE 'in_transit' END,
         CASE WHEN COALESCE(p.stock,0) > 0
              THEN COALESCE(ins.since, p.created_at)
              ELSE COALESCE(t.since, p.created_at) END,
         COALESCE(t.qty, 0),
         COALESCE(t.pos, '{}'::text[]),
         COALESCE(c.total, 0),
         COALESCE(c.published, 0),
         cp.id,
         cp.target_count
  FROM products p
  LEFT JOIN transit t ON t.product_id = p.id
  LEFT JOIN instock ins ON ins.product_id = p.id
  LEFT JOIN counts c ON c.product_id = p.id
  LEFT JOIN LATERAL (
    SELECT cp2.id, cp2.target_count FROM content_plans cp2
    WHERE cp2.product_id = p.id AND cp2.status <> 'archived'
    ORDER BY cp2.created_at DESC LIMIT 1
  ) cp ON true
  CROSS JOIN allowed a
  WHERE (p.brand_id IS NULL OR p.brand_id = ANY (a.ids))
    AND (COALESCE(p.stock,0) > 0 OR t.product_id IS NOT NULL)
  ORDER BY 9 ASC;
$$;
GRANT EXECUTE ON FUNCTION public.content_intake_feed(uuid[]) TO authenticated;

-- ============ Migrate existing Creative Desk content ============
INSERT INTO public.content_items (
  brand_id, product_id, title, content_type, platform, angle, script, caption, cta, hashtags,
  reference_urls, due_date, cost, stage, status, video_url, published_url, published_at,
  views, attributed_orders, created_by, created_at
)
SELECT hp.brand_id, hp.product_id, hp.title,
       COALESCE(hp.asset_type,'ugc'), COALESCE(hp.platform,'facebook'), hp.angle, hp.script,
       hp.caption, hp.cta, hp.hashtags, COALESCE(hp.reference_urls,'{}'), hp.deadline,
       COALESCE(hp.budget,0),
       CASE hp.status
         WHEN 'planned' THEN 'ideation'
         WHEN 'briefing' THEN 'ideation'
         WHEN 'shooting' THEN 'create'
         WHEN 'editing' THEN 'editing'
         WHEN 'scheduled' THEN 'editing'
         WHEN 'live' THEN 'published'
         ELSE 'ideation' END,
       CASE hp.status WHEN 'live' THEN 'published' ELSE 'briefed' END,
       hp.video_url, hp.published_url, hp.published_at,
       COALESCE(hp.views,0), COALESCE(hp.attributed_orders,0), hp.created_by, hp.created_at
FROM public.hub_content_plans hp
WHERE NOT EXISTS (SELECT 1 FROM public.content_items ci WHERE ci.created_at = hp.created_at AND ci.title = hp.title);
