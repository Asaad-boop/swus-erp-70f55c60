
SELECT cron.unschedule('business-summary-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'business-summary-daily');

SELECT cron.schedule(
  'business-summary-daily',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://swus-erp.lovable.app/api/public/cron/business-summary',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnc3NwaXBramV1Y2VmdHVhdHVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNDcyMzIsImV4cCI6MjA5MTgyMzIzMn0.h6aRTBUhTvEvKCx8M-lvyA2BCBQbhvWMWKgn8dIyilc"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
