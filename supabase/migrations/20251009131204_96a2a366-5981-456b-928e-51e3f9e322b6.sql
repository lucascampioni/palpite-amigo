-- Add foreign key constraint for owner_id in pools table
ALTER TABLE public.pools
  ADD CONSTRAINT pools_owner_id_fkey
  FOREIGN KEY (owner_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- Add foreign key constraint for winner_id in pools table
ALTER TABLE public.pools
  ADD CONSTRAINT pools_winner_id_fkey
  FOREIGN KEY (winner_id)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- Add foreign key constraints for participants table
ALTER TABLE public.participants
  ADD CONSTRAINT participants_pool_id_fkey
  FOREIGN KEY (pool_id)
  REFERENCES public.pools(id)
  ON DELETE CASCADE;

ALTER TABLE public.participants
  ADD CONSTRAINT participants_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;