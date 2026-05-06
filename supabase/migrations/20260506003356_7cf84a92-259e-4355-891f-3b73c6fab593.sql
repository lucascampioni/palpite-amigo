-- 1) Tighten profiles: pool owners only see participant profiles in their own pools
DROP POLICY IF EXISTS "Pool owners can view profiles with phone" ON public.profiles;
CREATE POLICY "Pool owners can view participant profiles"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.participants p
    JOIN public.pools po ON po.id = p.pool_id
    WHERE po.owner_id = auth.uid() AND p.user_id = profiles.id
  )
);

-- 2) Storage payment-proofs: drop overly broad policies (owner-scoped equivalents already exist)
DROP POLICY IF EXISTS "Users can view payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Users can update payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload payment proofs" ON storage.objects;

-- 3) Realtime: add RLS policy on realtime.messages so subscriptions require auth
--    and table-level RLS is honored for postgres_changes
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='realtime' AND tablename='messages') THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can receive realtime" ON realtime.messages';
    EXECUTE 'CREATE POLICY "Authenticated users can receive realtime" ON realtime.messages FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

-- 4) whatsapp_otp: clients never read OTP codes; drop SELECT policy
DROP POLICY IF EXISTS "Users can view own OTP" ON public.whatsapp_otp;

-- 5) user_stats: prevent users from manipulating their own stats; auto-create via trigger
DROP POLICY IF EXISTS "Users can insert own stats" ON public.user_stats;
DROP POLICY IF EXISTS "Users can update own stats" ON public.user_stats;

CREATE OR REPLACE FUNCTION public.handle_new_user_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_stats (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_init_stats ON public.profiles;
CREATE TRIGGER on_profile_created_init_stats
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_stats();

-- Backfill any missing stats rows
INSERT INTO public.user_stats (user_id)
SELECT id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- 6) pool_vouchers: drop broad unused-voucher SELECT (leaks phone numbers)
--    Pool owners and used_by users still see their own via existing policies.
DROP POLICY IF EXISTS "Authenticated users can check voucher by code" ON public.pool_vouchers;