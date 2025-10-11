-- Wipe all football pool related data
BEGIN;

-- Use TRUNCATE with RESTART IDENTITY to reset sequences and CASCADE to handle dependencies
TRUNCATE TABLE
  public.football_predictions,
  public.football_matches,
  public.participants,
  public.pool_payment_info,
  public.pools
RESTART IDENTITY CASCADE;

COMMIT;