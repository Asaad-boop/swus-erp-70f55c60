CREATE TABLE public.hub_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.hub_goals(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'objective',
  title text NOT NULL,
  description text,
  period_start date NOT NULL DEFAULT date_trunc('month', now())::date,
  period_end date NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month - 1 day')::date,
  metric_key text,
  target_value numeric NOT NULL DEFAULT 0,
  current_value numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'number',
  owner text,
  status text NOT NULL DEFAULT 'active',
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hub_goals_brand_period_idx ON public.hub_goals (brand_id, period_start, period_end);
CREATE INDEX hub_goals_parent_idx ON public.hub_goals (parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_goals TO authenticated;
GRANT ALL ON public.hub_goals TO service_role;
ALTER TABLE public.hub_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub goals brand scoped" ON public.hub_goals FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()));

CREATE TABLE public.hub_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  goal_id uuid REFERENCES public.hub_goals(id) ON DELETE SET NULL,
  title text NOT NULL,
  details text,
  assignee_id uuid,
  due_date date,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'todo',
  link_type text,
  link_id text,
  link_label text,
  recurrence text NOT NULL DEFAULT 'none',
  last_spawned_on date,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  position int NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hub_tasks_brand_status_idx ON public.hub_tasks (brand_id, status);
CREATE INDEX hub_tasks_due_idx ON public.hub_tasks (due_date);
CREATE INDEX hub_tasks_assignee_idx ON public.hub_tasks (assignee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_tasks TO authenticated;
GRANT ALL ON public.hub_tasks TO service_role;
ALTER TABLE public.hub_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub tasks brand scoped" ON public.hub_tasks FOR ALL TO authenticated
  USING (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()))
  WITH CHECK (brand_id IS NULL OR brand_id = ANY (get_user_brand_ids()));

CREATE TABLE public.hub_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  body text NOT NULL,
  author_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hub_comments_entity_idx ON public.hub_comments (entity_type, entity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_comments TO authenticated;
GRANT ALL ON public.hub_comments TO service_role;
ALTER TABLE public.hub_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub comments staff" ON public.hub_comments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER hub_goals_touch BEFORE UPDATE ON public.hub_goals
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();
CREATE TRIGGER hub_tasks_touch BEFORE UPDATE ON public.hub_tasks
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE OR REPLACE FUNCTION public.hub_goal_actuals(_brand_ids uuid[])
RETURNS TABLE (goal_id uuid, actual numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT g.id,
    COALESCE(
      CASE g.metric_key
        WHEN 'delivered_revenue' THEN (
          SELECT COALESCE(SUM(oi.line_total), 0)
          FROM orders o JOIN order_items oi ON oi.order_id = o.id
          WHERE o.status IN ('delivered','completed','partial_delivered')
            AND o.brand_id = ANY (_brand_ids)
            AND (g.brand_id IS NULL OR o.brand_id = g.brand_id)
            AND o.created_at::date BETWEEN g.period_start AND g.period_end
        )
        WHEN 'orders' THEN (
          SELECT COUNT(*)::numeric FROM orders o
          WHERE o.brand_id = ANY (_brand_ids)
            AND (g.brand_id IS NULL OR o.brand_id = g.brand_id)
            AND o.status NOT IN ('cancelled','fake')
            AND o.created_at::date BETWEEN g.period_start AND g.period_end
        )
        WHEN 'delivered_orders' THEN (
          SELECT COUNT(*)::numeric FROM orders o
          WHERE o.brand_id = ANY (_brand_ids)
            AND (g.brand_id IS NULL OR o.brand_id = g.brand_id)
            AND o.status IN ('delivered','completed','partial_delivered')
            AND o.created_at::date BETWEEN g.period_start AND g.period_end
        )
        WHEN 'ad_spend' THEN (
          SELECT COALESCE(SUM(i.spend_bdt), 0) FROM mkt_insights_daily i
          WHERE i.brand_id = ANY (_brand_ids)
            AND (g.brand_id IS NULL OR i.brand_id = g.brand_id)
            AND i.date BETWEEN g.period_start AND g.period_end
        )
        ELSE NULL
      END,
      g.current_value
    )
  FROM hub_goals g
  WHERE g.brand_id IS NULL OR g.brand_id = ANY (_brand_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.hub_goal_actuals(uuid[]) TO authenticated, service_role;