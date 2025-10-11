-- Enable pg_cron extension for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule automatic sync of match results every hour
-- This will check for finished matches and update their scores
SELECT cron.schedule(
  'sync-match-results-hourly',
  '0 * * * *', -- Every hour at minute 0
  $$
  SELECT
    net.http_post(
      url:='https://aqpkkdhkbklhmjjiicsn.supabase.co/functions/v1/sync-match-results',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcGtrZGhrYmtsaG1qamlpY3NuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTA5NDYsImV4cCI6MjA3NTU4Njk0Nn0.u6x34-kzFb-82Ww7VcxqgU2zoG6NRZ0UiZjMZM8Pq9Q"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Scheduled tasks for automatic match results synchronization';