-- Re-point existing cron jobs at the correct Supabase project (qdpfqjaggqxhmifqhsfh).
-- cron.schedule() upserts by job name, so this updates the jobs in place.

SELECT cron.schedule(
  'sync-match-results-hourly',
  '0 * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://qdpfqjaggqxhmifqhsfh.supabase.co/functions/v1/sync-match-results',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkcGZxamFnZ3F4aG1pZnFoc2ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5ODM0NzIsImV4cCI6MjEwNDU1OTQ3Mn0.mLhtT7tJA9DJWYZnAT2xAMeh1z_Zi2hQoboYudoEq90"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

SELECT cron.schedule(
  'broadcast-copa-gratuita-dispatch',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qdpfqjaggqxhmifqhsfh.supabase.co/functions/v1/broadcast-copa-gratuita',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkcGZxamFnZ3F4aG1pZnFoc2ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5ODM0NzIsImV4cCI6MjEwNDU1OTQ3Mn0.mLhtT7tJA9DJWYZnAT2xAMeh1z_Zi2hQoboYudoEq90"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
