
CREATE TABLE IF NOT EXISTS public.rpt_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  brand_key text NOT NULL,
  brand_ids uuid[] NOT NULL DEFAULT '{}',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rpt_snapshots_period_uk
  ON public.rpt_snapshots (period_type, period_start, brand_key);

GRANT SELECT ON public.rpt_snapshots TO authenticated;
GRANT ALL ON public.rpt_snapshots TO service_role;
ALTER TABLE public.rpt_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read snapshots" ON public.rpt_snapshots;
CREATE POLICY "Staff can read snapshots" ON public.rpt_snapshots
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.rpt_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Business summary',
  frequency text NOT NULL DEFAULT 'daily',
  channel text NOT NULL DEFAULT 'sms',
  recipients text[] NOT NULL DEFAULT '{}',
  brand_ids uuid[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  last_result text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rpt_subscriptions TO authenticated;
GRANT ALL ON public.rpt_subscriptions TO service_role;
ALTER TABLE public.rpt_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage subscriptions" ON public.rpt_subscriptions;
CREATE POLICY "Staff manage subscriptions" ON public.rpt_subscriptions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_rpt_snapshots_updated_at ON public.rpt_snapshots;
CREATE TRIGGER trg_rpt_snapshots_updated_at BEFORE UPDATE ON public.rpt_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_rpt_subscriptions_updated_at ON public.rpt_subscriptions;
CREATE TRIGGER trg_rpt_subscriptions_updated_at BEFORE UPDATE ON public.rpt_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.rpt_build_snapshot(
  _period_type text,
  _period_start date,
  _brand_ids uuid[]
) RETURNS public.rpt_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date;
  v_end date;
  v_key text;
  v_payload jsonb;
  v_row public.rpt_snapshots;
BEGIN
  IF _period_type NOT IN ('day','month') THEN
    RAISE EXCEPTION 'period_type must be day or month';
  END IF;

  IF _period_type = 'day' THEN
    v_start := _period_start;
    v_end := _period_start;
  ELSE
    v_start := date_trunc('month', _period_start)::date;
    v_end := (date_trunc('month', _period_start) + interval '1 month - 1 day')::date;
  END IF;

  v_key := coalesce(array_to_string(ARRAY(SELECT unnest(_brand_ids) ORDER BY 1), ','), '');

  v_payload := jsonb_build_object(
    'delivered', public.rpt_sales_summary(_brand_ids, v_start, v_end, 'delivered'),
    'created',   public.rpt_sales_summary(_brand_ids, v_start, v_end, 'created'),
    'cash',      public.rpt_cash_flow(_brand_ids, v_start, v_end)
  );

  INSERT INTO public.rpt_snapshots (period_type, period_start, period_end, brand_key, brand_ids, payload, generated_at)
  VALUES (_period_type, v_start, v_end, v_key, _brand_ids, v_payload, now())
  ON CONFLICT (period_type, period_start, brand_key)
  DO UPDATE SET payload = EXCLUDED.payload, period_end = EXCLUDED.period_end,
                brand_ids = EXCLUDED.brand_ids, generated_at = now(), updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.rpt_build_snapshot(text, date, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpt_build_snapshot(text, date, uuid[]) TO authenticated, service_role;
