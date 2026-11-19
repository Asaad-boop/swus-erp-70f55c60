-- Live visitors are derived from analytics_events (which the storefronts keep
-- sending) instead of active_sessions, which nothing has written since
-- 2026-10-30. SECURITY INVOKER: the caller's analytics_events RLS applies.
CREATE OR REPLACE FUNCTION public.live_sessions(_since timestamptz, _brand_ids uuid[] DEFAULT NULL, _limit int DEFAULT 300)
RETURNS TABLE(
  session_id text, brand_id uuid, first_seen_at timestamptz, last_seen_at timestamptz,
  path text, referrer text, utm_source text, device_type text, user_agent text,
  events int, page_views int, product_views int, add_to_cart boolean, checkout boolean, purchase boolean
)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    s.session_id::text, s.brand_id, s.first_seen, s.last_seen,
    s.last_path, s.referrer, s.utm_source, s.device_type, s.user_agent,
    s.events, s.page_views, s.product_views, s.atc, s.co, s.pur
  FROM (
    SELECT e.session_id,
      (array_agg(e.brand_id ORDER BY e.created_at DESC) FILTER (WHERE e.brand_id IS NOT NULL))[1] AS brand_id,
      min(e.created_at) AS first_seen,
      max(e.created_at) AS last_seen,
      (array_agg(e.path ORDER BY e.created_at DESC))[1] AS last_path,
      (array_agg(e.referrer ORDER BY e.created_at) FILTER (WHERE e.referrer IS NOT NULL AND e.referrer <> ''))[1] AS referrer,
      (array_agg(e.utm_source ORDER BY e.created_at) FILTER (WHERE e.utm_source IS NOT NULL))[1] AS utm_source,
      (array_agg(e.device_type ORDER BY e.created_at DESC) FILTER (WHERE e.device_type IS NOT NULL))[1] AS device_type,
      (array_agg(e.user_agent ORDER BY e.created_at DESC) FILTER (WHERE e.user_agent IS NOT NULL))[1] AS user_agent,
      count(*)::int AS events,
      count(*) FILTER (WHERE e.event_name = 'page_view')::int AS page_views,
      count(*) FILTER (WHERE e.event_name = 'view_item')::int AS product_views,
      bool_or(e.event_name = 'add_to_cart') AS atc,
      bool_or(e.event_name = 'begin_checkout') AS co,
      bool_or(e.event_name = 'purchase') AS pur
    FROM public.analytics_events e
    WHERE e.created_at >= _since
      AND e.session_id IS NOT NULL
      AND (_brand_ids IS NULL OR e.brand_id = ANY(_brand_ids))
    GROUP BY e.session_id
  ) s
  ORDER BY s.last_seen DESC
  LIMIT greatest(1, least(coalesce(_limit, 300), 2000));
$$;

REVOKE EXECUTE ON FUNCTION public.live_sessions(timestamptz, uuid[], int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.live_sessions(timestamptz, uuid[], int) TO authenticated, service_role;
