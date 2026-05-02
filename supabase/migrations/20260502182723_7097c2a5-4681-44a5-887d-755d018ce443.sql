INSERT INTO public.platform_settings (key, value)
VALUES ('delfos_fee_percent_min', '0'::jsonb)
ON CONFLICT (key) DO NOTHING;