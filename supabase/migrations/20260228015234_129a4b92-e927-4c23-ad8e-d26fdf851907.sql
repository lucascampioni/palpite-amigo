
-- Backfill all existing users into the official community
INSERT INTO public.community_members (community_id, user_id, notify_new_pools)
SELECT c.id, p.id, p.notify_new_pools
FROM public.profiles p
CROSS JOIN public.communities c
WHERE c.is_official = true
ON CONFLICT (community_id, user_id) DO NOTHING;
