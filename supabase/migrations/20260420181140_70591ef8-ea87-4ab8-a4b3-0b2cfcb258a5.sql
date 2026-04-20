SELECT net.http_post(
  url := 'https://aqpkkdhkbklhmjjiicsn.supabase.co/functions/v1/mp-process-payouts',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
    'X-Internal-Source', 'update-football-winners'
  ),
  body := jsonb_build_object('pool_id', '9efad95c-f8f2-4cb4-8d50-586b9e799538')
);