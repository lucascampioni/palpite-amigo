
-- Add table for additional community owners (beyond the primary responsible_user_id)
CREATE TABLE public.community_owners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

ALTER TABLE public.community_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view community owners"
ON public.community_owners FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert community owners"
ON public.community_owners FOR INSERT
WITH CHECK (is_app_admin() OR is_user_admin());

CREATE POLICY "Admins can delete community owners"
ON public.community_owners FOR DELETE
USING (is_app_admin() OR is_user_admin());

CREATE POLICY "Admins can update community owners"
ON public.community_owners FOR UPDATE
USING (is_app_admin() OR is_user_admin());
