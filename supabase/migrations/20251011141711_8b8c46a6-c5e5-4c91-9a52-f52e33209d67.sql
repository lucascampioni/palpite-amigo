-- Move pg_cron and pg_net extensions to extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;

-- Drop extensions from public if they exist there
DROP EXTENSION IF EXISTS pg_cron CASCADE;
DROP EXTENSION IF EXISTS pg_net CASCADE;

-- Create extensions in the extensions schema
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage on extensions schema
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Re-schedule automatic sync of match results every hour
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