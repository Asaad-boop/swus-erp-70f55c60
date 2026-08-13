
CREATE TABLE IF NOT EXISTS public.mkt_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  rule text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  entity_type text NOT NULL,
  entity_id text,
  entity_name text,
  title text NOT NULL,
  message text NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommendation text,
  status text NOT NULL DEFAULT 'open',
  dedupe_key text NOT NULL UNIQUE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  acked_by uuid,
  acked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_alerts TO authenticated;
GRANT ALL ON public.mkt_alerts TO service_role;

ALTER TABLE public.mkt_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mkt alerts brand scoped" ON public.mkt_alerts;
CREATE POLICY "mkt alerts brand scoped" ON public.mkt_alerts
  FOR ALL TO authenticated
  USING ((brand_id IS NULL) OR (brand_id = ANY (get_user_brand_ids())))
  WITH CHECK ((brand_id IS NULL) OR (brand_id = ANY (get_user_brand_ids())));

CREATE INDEX IF NOT EXISTS mkt_alerts_brand_status_idx ON public.mkt_alerts (brand_id, status, severity);

CREATE OR REPLACE FUNCTION public.mkt_evaluate_alerts(_brand_ids uuid[], _lookback integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _from date := current_date - GREATEST(_lookback, 1) + 1;
  _to date := current_date;
  _run timestamptz := now();
  _r jsonb;
  _rec record;
  _count int := 0;
  _resolved int := 0;
BEGIN
  -- 1/2/3: campaign-level rules
  FOR _rec IN
    SELECT * FROM jsonb_array_elements(
      COALESCE(mkt_hierarchy_perf(_brand_ids, _from, _to, 'campaign', NULL), '[]'::jsonb)
    ) AS t(c)
  LOOP
    _r := _rec.c;
    IF COALESCE(_r->>'status','') = 'ACTIVE' AND COALESCE((_r->>'spend')::numeric,0) >= 1500
       AND COALESCE((_r->>'delivered_orders')::numeric,0) = 0 THEN
      INSERT INTO mkt_alerts (brand_id, rule, severity, entity_type, entity_id, entity_name, title, message, metrics, recommendation, dedupe_key, last_seen_at, status, resolved_at)
      VALUES ((_r->>'brand_id')::uuid, 'zero_orders', 'high', 'campaign', _r->>'id', _r->>'name',
        'Spend with no delivered orders',
        format('%s spent %s BDT in last %s days with 0 delivered orders.', _r->>'name', round((_r->>'spend')::numeric), _lookback),
        jsonb_build_object('spend',_r->'spend','orders',_r->'orders','delivered_orders',_r->'delivered_orders','ctr',_r->'ctr'),
        'Pause or rebuild this campaign — creative/offer likely not converting.',
        'zero_orders|' || (_r->>'id'), _run, 'open', NULL)
      ON CONFLICT (dedupe_key) DO UPDATE SET message = EXCLUDED.message, metrics = EXCLUDED.metrics,
        severity = EXCLUDED.severity, last_seen_at = _run, updated_at = _run,
        status = CASE WHEN mkt_alerts.status = 'resolved' THEN 'open' ELSE mkt_alerts.status END,
        resolved_at = NULL;
      _count := _count + 1;
    END IF;

    IF COALESCE(_r->>'status','') = 'ACTIVE' AND COALESCE((_r->>'spend')::numeric,0) >= 1000
       AND COALESCE((_r->>'delivered_orders')::numeric,0) > 0
       AND COALESCE((_r->>'roas')::numeric,0) < COALESCE((_r->>'target_roas')::numeric, 1.5) THEN
      INSERT INTO mkt_alerts (brand_id, rule, severity, entity_type, entity_id, entity_name, title, message, metrics, recommendation, dedupe_key, last_seen_at, status, resolved_at)
      VALUES ((_r->>'brand_id')::uuid, 'roas_drop',
        CASE WHEN COALESCE((_r->>'roas')::numeric,0) < 1 THEN 'high' ELSE 'medium' END,
        'campaign', _r->>'id', _r->>'name',
        'ROAS below target',
        format('%s ROAS %s vs target %s (spend %s BDT).', _r->>'name', round(COALESCE((_r->>'roas')::numeric,0),2), COALESCE(round((_r->>'target_roas')::numeric,2)::text,'1.5'), round((_r->>'spend')::numeric)),
        jsonb_build_object('spend',_r->'spend','roas',_r->'roas','target_roas',_r->'target_roas','revenue',_r->'revenue','cpa',_r->'cpa'),
        'Cut budget, test new creative/audience, or raise AOV before scaling.',
        'roas_drop|' || (_r->>'id'), _run, 'open', NULL)
      ON CONFLICT (dedupe_key) DO UPDATE SET message = EXCLUDED.message, metrics = EXCLUDED.metrics,
        severity = EXCLUDED.severity, last_seen_at = _run, updated_at = _run,
        status = CASE WHEN mkt_alerts.status = 'resolved' THEN 'open' ELSE mkt_alerts.status END,
        resolved_at = NULL;
      _count := _count + 1;
    END IF;

    IF (_r->>'target_cpa') IS NOT NULL AND COALESCE((_r->>'cpa')::numeric,0) > (_r->>'target_cpa')::numeric * 1.2
       AND COALESCE((_r->>'delivered_orders')::numeric,0) > 0 THEN
      INSERT INTO mkt_alerts (brand_id, rule, severity, entity_type, entity_id, entity_name, title, message, metrics, recommendation, dedupe_key, last_seen_at, status, resolved_at)
      VALUES ((_r->>'brand_id')::uuid, 'cpa_spike', 'medium', 'campaign', _r->>'id', _r->>'name',
        'CPA above target',
        format('%s CPA %s BDT vs target %s BDT.', _r->>'name', round((_r->>'cpa')::numeric), round((_r->>'target_cpa')::numeric)),
        jsonb_build_object('cpa',_r->'cpa','target_cpa',_r->'target_cpa','spend',_r->'spend','delivered_orders',_r->'delivered_orders'),
        'Tighten audience or improve landing page conversion.',
        'cpa_spike|' || (_r->>'id'), _run, 'open', NULL)
      ON CONFLICT (dedupe_key) DO UPDATE SET message = EXCLUDED.message, metrics = EXCLUDED.metrics,
        severity = EXCLUDED.severity, last_seen_at = _run, updated_at = _run,
        status = CASE WHEN mkt_alerts.status = 'resolved' THEN 'open' ELSE mkt_alerts.status END,
        resolved_at = NULL;
      _count := _count + 1;
    END IF;
  END LOOP;

  -- 4: creative fatigue
  FOR _rec IN
    SELECT * FROM jsonb_array_elements(
      COALESCE(mkt_creative_perf(_brand_ids, _from, _to), '[]'::jsonb)
    ) AS t(c)
  LOOP
    _r := _rec.c;
    IF COALESCE((_r->>'active')::boolean, false)
       AND COALESCE((_r->>'spend_7')::numeric,0) >= 500
       AND (COALESCE((_r->>'fatigued')::boolean,false) OR COALESCE((_r->>'frequency')::numeric,0) > 3) THEN
      INSERT INTO mkt_alerts (brand_id, rule, severity, entity_type, entity_id, entity_name, title, message, metrics, recommendation, dedupe_key, last_seen_at, status, resolved_at)
      VALUES ((_r->>'brand_id')::uuid, 'creative_fatigue', 'medium', 'creative', left(_r->>'creative_key', 300), _r->>'name',
        'Creative fatigue',
        format('%s — frequency %s, CTR(7d) %s%% vs %s%% overall.', COALESCE(_r->>'name','Creative'), round(COALESCE((_r->>'frequency')::numeric,0),2), COALESCE(_r->>'ctr_7','0'), COALESCE(_r->>'ctr','0')),
        jsonb_build_object('frequency',_r->'frequency','ctr',_r->'ctr','ctr_7',_r->'ctr_7','spend_7',_r->'spend_7','thumbnail',_r->'thumbnail'),
        'Refresh the hook or swap in a new creative variant.',
        'creative_fatigue|' || left(_r->>'creative_key', 300), _run, 'open', NULL)
      ON CONFLICT (dedupe_key) DO UPDATE SET message = EXCLUDED.message, metrics = EXCLUDED.metrics,
        severity = EXCLUDED.severity, last_seen_at = _run, updated_at = _run,
        status = CASE WHEN mkt_alerts.status = 'resolved' THEN 'open' ELSE mkt_alerts.status END,
        resolved_at = NULL;
      _count := _count + 1;
    END IF;
  END LOOP;

  -- 5: budget overspend / underperformance
  FOR _rec IN
    SELECT * FROM jsonb_array_elements(
      COALESCE(mkt_budget_status(_brand_ids, _from, _to), '[]'::jsonb)
    ) AS t(c)
  LOOP
    _r := _rec.c;
    IF COALESCE((_r->>'utilization')::numeric,0) > 100 THEN
      INSERT INTO mkt_alerts (brand_id, rule, severity, entity_type, entity_id, entity_name, title, message, metrics, recommendation, dedupe_key, last_seen_at, status, resolved_at)
      VALUES ((_r->>'brand_id')::uuid, 'budget_overspend', 'high', 'budget', _r->>'id', _r->>'name',
        'Budget exceeded',
        format('%s used %s%% of planned spend (%s / %s BDT).', _r->>'name', round(COALESCE((_r->>'utilization')::numeric,0)), round(COALESCE((_r->>'actual_spend')::numeric,0)), round(COALESCE((_r->>'planned_spend')::numeric,0))),
        jsonb_build_object('utilization',_r->'utilization','actual_spend',_r->'actual_spend','planned_spend',_r->'planned_spend','actual_roas',_r->'actual_roas'),
        'Pause scaling or raise the plan after reviewing ROAS.',
        'budget_overspend|' || (_r->>'id'), _run, 'open', NULL)
      ON CONFLICT (dedupe_key) DO UPDATE SET message = EXCLUDED.message, metrics = EXCLUDED.metrics,
        severity = EXCLUDED.severity, last_seen_at = _run, updated_at = _run,
        status = CASE WHEN mkt_alerts.status = 'resolved' THEN 'open' ELSE mkt_alerts.status END,
        resolved_at = NULL;
      _count := _count + 1;
    END IF;
  END LOOP;

  -- 6: low stock while advertising
  FOR _rec IN
    SELECT p.brand_id, p.id AS product_id, p.title,
           COALESCE(p.available_stock, p.stock, 0) AS stock,
           COALESCE(p.low_stock_threshold, 10) AS threshold,
           (x.c->>'ad_spend')::numeric AS ad_spend
    FROM jsonb_array_elements(COALESCE(mkt_product_perf(_brand_ids, _from, _to), '[]'::jsonb)) AS x(c)
    JOIN products p ON p.id = (x.c->>'product_id')::uuid
    WHERE COALESCE((x.c->>'ad_spend')::numeric,0) > 0
      AND COALESCE(p.available_stock, p.stock, 0) <= COALESCE(p.low_stock_threshold, 10)
  LOOP
    INSERT INTO mkt_alerts (brand_id, rule, severity, entity_type, entity_id, entity_name, title, message, metrics, recommendation, dedupe_key, last_seen_at, status, resolved_at)
    VALUES (_rec.brand_id, 'low_stock_active_ad', 'high', 'product', _rec.product_id::text, _rec.title,
      'Low stock on an advertised product',
      format('%s has %s units left but is still getting ad spend (%s BDT).', _rec.title, _rec.stock, round(_rec.ad_spend)),
      jsonb_build_object('stock',_rec.stock,'threshold',_rec.threshold,'ad_spend',_rec.ad_spend),
      'Restock now or pause the ads pointing to this product.',
      'low_stock_active_ad|' || _rec.product_id::text, _run, 'open', NULL)
    ON CONFLICT (dedupe_key) DO UPDATE SET message = EXCLUDED.message, metrics = EXCLUDED.metrics,
      severity = EXCLUDED.severity, last_seen_at = _run, updated_at = _run,
      status = CASE WHEN mkt_alerts.status = 'resolved' THEN 'open' ELSE mkt_alerts.status END,
      resolved_at = NULL;
    _count := _count + 1;
  END LOOP;

  -- 7: high return rate on advertised products
  FOR _rec IN
    WITH perf AS (
      SELECT (x.c->>'product_id')::uuid AS product_id, (x.c->>'ad_spend')::numeric AS ad_spend
      FROM jsonb_array_elements(COALESCE(mkt_product_perf(_brand_ids, _from, _to), '[]'::jsonb)) AS x(c)
      WHERE COALESCE((x.c->>'ad_spend')::numeric,0) > 0
    ),
    ret AS (
      SELECT oi.product_id,
             count(*) FILTER (WHERE o.status IN ('returned','partial_return')) AS returned_orders,
             count(*) AS total_orders
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.created_at::date BETWEEN _from AND _to
        AND o.brand_id = ANY(_brand_ids)
        AND o.status IN ('delivered','returned','partial_return')
      GROUP BY oi.product_id
    )
    SELECT p.brand_id, p.id AS product_id, p.title, r.returned_orders, r.total_orders,
           round(r.returned_orders::numeric * 100 / NULLIF(r.total_orders,0), 1) AS return_pct
    FROM perf pf
    JOIN ret r ON r.product_id = pf.product_id
    JOIN products p ON p.id = pf.product_id
    WHERE r.total_orders >= 10
      AND r.returned_orders::numeric / NULLIF(r.total_orders,0) > 0.25
  LOOP
    INSERT INTO mkt_alerts (brand_id, rule, severity, entity_type, entity_id, entity_name, title, message, metrics, recommendation, dedupe_key, last_seen_at, status, resolved_at)
    VALUES (_rec.brand_id, 'high_return_active_ad', 'medium', 'product', _rec.product_id::text, _rec.title,
      'High return rate while advertising',
      format('%s return rate %s%% (%s of %s orders).', _rec.title, _rec.return_pct, _rec.returned_orders, _rec.total_orders),
      jsonb_build_object('return_pct',_rec.return_pct,'returned_orders',_rec.returned_orders,'total_orders',_rec.total_orders),
      'Check product quality, expectation gap in the ad, or delivery area targeting.',
      'high_return_active_ad|' || _rec.product_id::text, _run, 'open', NULL)
    ON CONFLICT (dedupe_key) DO UPDATE SET message = EXCLUDED.message, metrics = EXCLUDED.metrics,
      severity = EXCLUDED.severity, last_seen_at = _run, updated_at = _run,
      status = CASE WHEN mkt_alerts.status = 'resolved' THEN 'open' ELSE mkt_alerts.status END,
      resolved_at = NULL;
    _count := _count + 1;
  END LOOP;

  -- auto-resolve alerts no longer triggering for these brands
  UPDATE mkt_alerts SET status = 'resolved', resolved_at = _run, updated_at = _run
  WHERE status <> 'resolved'
    AND brand_id = ANY(_brand_ids)
    AND last_seen_at < _run;
  GET DIAGNOSTICS _resolved = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'triggered', _count, 'resolved', _resolved,
                            'from', _from, 'to', _to, 'run_at', _run);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mkt_evaluate_alerts(uuid[], integer) TO authenticated, service_role;
