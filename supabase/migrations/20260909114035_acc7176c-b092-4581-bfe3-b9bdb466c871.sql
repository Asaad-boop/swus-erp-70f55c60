-- lovable-cron-fallback-reviewed: 24 runs/day; hourly retry backstop only — normal delivery is event-driven via pg_net on enqueue
CREATE OR REPLACE FUNCTION public.enqueue_webhook_event(_event text, _payload jsonb, _brand_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  inserted int;
BEGIN
  INSERT INTO public.webhook_deliveries (endpoint_id, event, payload)
  SELECT e.id, _event, _payload
  FROM public.webhook_endpoints e
  WHERE e.is_enabled
    AND _event = ANY(e.events)
    AND (e.brand_id IS NULL OR _brand_id IS NULL OR e.brand_id = _brand_id);

  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted > 0 THEN
    -- Fire delivery immediately; no polling needed for the happy path.
    PERFORM net.http_post(
      url := 'https://swus-erp.lovable.app/api/public/cron/dispatch-webhooks',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnc3NwaXBramV1Y2VmdHVhdHVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNDcyMzIsImV4cCI6MjA5MTgyMzIzMn0.h6aRTBUhTvEvKCx8M-lvyA2BCBQbhvWMWKgn8dIyilc"}'::jsonb,
      body := '{"limit":40}'::jsonb,
      timeout_milliseconds := 20000
    );
  END IF;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.enqueue_webhook_event(text, jsonb, uuid) FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'dispatch-webhooks-retry',
  '7 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://swus-erp.lovable.app/api/public/cron/dispatch-webhooks',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnc3NwaXBramV1Y2VmdHVhdHVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNDcyMzIsImV4cCI6MjA5MTgyMzIzMn0.h6aRTBUhTvEvKCx8M-lvyA2BCBQbhvWMWKgn8dIyilc"}'::jsonb,
    body := '{"limit":40}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);