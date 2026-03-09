
-- Function to auto-claim pending vouchers when a new user registers
CREATE OR REPLACE FUNCTION public.auto_claim_vouchers_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  voucher RECORD;
BEGIN
  -- Find all unclaimed vouchers matching this phone number
  FOR voucher IN
    SELECT pv.id, pv.pool_id, pv.prediction_sets, p.title, p.slug
    FROM pool_vouchers pv
    JOIN pools p ON p.id = pv.pool_id
    WHERE pv.phone = NEW.phone
      AND pv.used_by IS NULL
      AND p.status = 'active'
  LOOP
    -- Link voucher to the new user
    UPDATE pool_vouchers
    SET used_by = NEW.id, used_at = now()
    WHERE id = voucher.id;

    -- Create approved participant
    INSERT INTO participants (pool_id, user_id, participant_name, guess_value, status)
    VALUES (voucher.pool_id, NEW.id, NEW.full_name, 'voucher', 'approved')
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger on profiles table (fires after new user profile is created)
CREATE TRIGGER on_profile_created_claim_vouchers
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  WHEN (NEW.phone IS NOT NULL)
  EXECUTE FUNCTION public.auto_claim_vouchers_on_signup();
