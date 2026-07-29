ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'pre_order';

CREATE TABLE IF NOT EXISTS public.preorders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  brand_id uuid,
  promise_date date,
  promise_days integer,
  stage text NOT NULL DEFAULT 'open',
  advance_amount numeric NOT NULL DEFAULT 0,
  advance_method text,
  advance_source text,
  advance_txn_id text,
  advance_received_at timestamptz,
  due_amount numeric NOT NULL DEFAULT 0,
  due_collect_method text,
  due_note text,
  ready_at timestamptz,
  called_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  refund_amount numeric NOT NULL DEFAULT 0,
  refund_method text,
  refund_note text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preorders_brand ON public.preorders(brand_id);
CREATE INDEX IF NOT EXISTS idx_preorders_stage ON public.preorders(stage);
CREATE INDEX IF NOT EXISTS idx_preorders_promise ON public.preorders(promise_date);

CREATE TABLE IF NOT EXISTS public.preorder_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preorder_id uuid NOT NULL REFERENCES public.preorders(id) ON DELETE CASCADE,
  order_id uuid,
  brand_id uuid,
  event text NOT NULL,
  detail text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preorder_events_preorder ON public.preorder_events(preorder_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.preorders TO authenticated;
GRANT ALL ON public.preorders TO service_role;
GRANT SELECT, INSERT ON public.preorder_events TO authenticated;
GRANT ALL ON public.preorder_events TO service_role;

ALTER TABLE public.preorders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preorder_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brand staff manage preorders"
ON public.preorders FOR ALL TO authenticated
USING ((SELECT public.has_brand_access(brand_id)))
WITH CHECK ((SELECT public.has_brand_access(brand_id)));

CREATE POLICY "Brand staff read preorder events"
ON public.preorder_events FOR SELECT TO authenticated
USING ((SELECT public.has_brand_access(brand_id)));

CREATE POLICY "Brand staff insert preorder events"
ON public.preorder_events FOR INSERT TO authenticated
WITH CHECK ((SELECT public.has_brand_access(brand_id)));

CREATE TRIGGER trg_preorders_updated_at
BEFORE UPDATE ON public.preorders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
