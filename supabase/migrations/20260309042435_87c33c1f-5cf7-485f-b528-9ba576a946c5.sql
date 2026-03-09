
ALTER TABLE public.pools ADD COLUMN IF NOT EXISTS tiebreaker_method text DEFAULT NULL;

COMMENT ON COLUMN public.pools.tiebreaker_method IS 'Stores which tiebreaker criterion decided the winner for estabelecimento pools: exact_scores, total_correct_results, prediction_time, random_draw';
