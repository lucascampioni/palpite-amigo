
CREATE TABLE public.whatsapp_send_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone text NOT NULL,
  message_type text NOT NULL,
  success boolean NOT NULL,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_whatsapp_send_log_sent_at ON public.whatsapp_send_log(sent_at DESC);
GRANT ALL ON public.whatsapp_send_log TO service_role;
ALTER TABLE public.whatsapp_send_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view send log" ON public.whatsapp_send_log FOR SELECT USING (public.is_app_admin() OR public.is_user_admin());

CREATE TABLE public.whatsapp_circuit_state (
  id int PRIMARY KEY DEFAULT 1,
  consecutive_failures int NOT NULL DEFAULT 0,
  paused_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);
INSERT INTO public.whatsapp_circuit_state (id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT ALL ON public.whatsapp_circuit_state TO service_role;
ALTER TABLE public.whatsapp_circuit_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view circuit state" ON public.whatsapp_circuit_state FOR SELECT USING (public.is_app_admin() OR public.is_user_admin());
