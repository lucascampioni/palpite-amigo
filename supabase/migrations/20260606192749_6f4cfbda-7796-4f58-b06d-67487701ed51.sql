
CREATE TABLE IF NOT EXISTS public.broadcast_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign text NOT NULL,
  phone text NOT NULL,
  user_id uuid,
  status text NOT NULL DEFAULT 'pending',
  attempted_at timestamptz,
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign, phone)
);

GRANT ALL ON public.broadcast_queue TO service_role;
ALTER TABLE public.broadcast_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view broadcast queue" ON public.broadcast_queue
  FOR SELECT USING (is_app_admin() OR is_user_admin());

CREATE INDEX IF NOT EXISTS broadcast_queue_pick_idx
  ON public.broadcast_queue (campaign, status, created_at);

-- Populate with all profiles having a phone, excluding the opt-out number
INSERT INTO public.broadcast_queue (campaign, phone, user_id)
SELECT
  'copa_gratuita_2026',
  regexp_replace(p.phone, '\D', '', 'g'),
  p.id
FROM public.profiles p
WHERE p.phone IS NOT NULL
  AND length(regexp_replace(p.phone, '\D', '', 'g')) >= 10
  AND regexp_replace(p.phone, '\D', '', 'g') NOT IN ('12981438598', '5512981438598')
ON CONFLICT (campaign, phone) DO NOTHING;

-- Schedule cron every 2 minutes (anti-ban throttle keeps it under 3/min, 30/h, 150/day)
SELECT cron.schedule(
  'broadcast-copa-gratuita-dispatch',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://aqpkkdhkbklhmjjiicsn.supabase.co/functions/v1/broadcast-copa-gratuita',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcGtrZGhrYmtsaG1qamlpY3NuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTA5NDYsImV4cCI6MjA3NTU4Njk0Nn0.u6x34-kzFb-82Ww7VcxqgU2zoG6NRZ0UiZjMZM8Pq9Q"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
