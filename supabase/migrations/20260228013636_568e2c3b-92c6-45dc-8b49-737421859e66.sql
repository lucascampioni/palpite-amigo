
-- Create communities table
CREATE TABLE public.communities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  responsible_user_id UUID NOT NULL,
  is_official BOOLEAN NOT NULL DEFAULT false,
  display_responsible_name TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create community_members table
CREATE TABLE public.community_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  notify_new_pools BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(community_id, user_id)
);

-- Enable RLS
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

-- Communities RLS: everyone authenticated can view
CREATE POLICY "Anyone authenticated can view communities"
ON public.communities FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only admins can insert/update/delete communities
CREATE POLICY "Admins can insert communities"
ON public.communities FOR INSERT
WITH CHECK (is_app_admin());

CREATE POLICY "Admins can update communities"
ON public.communities FOR UPDATE
USING (is_app_admin());

CREATE POLICY "Admins can delete communities"
ON public.communities FOR DELETE
USING (is_app_admin());

-- Community members RLS
CREATE POLICY "Anyone authenticated can view community members"
ON public.community_members FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can join communities"
ON public.community_members FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own membership"
ON public.community_members FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can leave communities"
ON public.community_members FOR DELETE
USING (auth.uid() = user_id);

-- Admins can also manage members (for auto-adding to official)
CREATE POLICY "Admins can insert members"
ON public.community_members FOR INSERT
WITH CHECK (is_app_admin());

-- Trigger for updated_at on communities
CREATE TRIGGER update_communities_updated_at
BEFORE UPDATE ON public.communities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Slug trigger for communities
CREATE OR REPLACE FUNCTION public.set_community_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter integer := 0;
BEGIN
  IF NEW.slug IS NULL OR (TG_OP = 'UPDATE' AND OLD.name != NEW.name) THEN
    base_slug := generate_slug(NEW.name);
    final_slug := base_slug;
    LOOP
      IF NOT EXISTS (SELECT 1 FROM communities WHERE slug = final_slug AND id != NEW.id) THEN
        EXIT;
      END IF;
      counter := counter + 1;
      final_slug := base_slug || '-' || counter;
    END LOOP;
    NEW.slug := final_slug;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_community_slug_trigger
BEFORE INSERT OR UPDATE ON public.communities
FOR EACH ROW
EXECUTE FUNCTION public.set_community_slug();

-- Function to auto-add new users to official community
CREATE OR REPLACE FUNCTION public.auto_join_official_community()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.community_members (community_id, user_id, notify_new_pools)
  SELECT c.id, NEW.id, NEW.notify_new_pools
  FROM public.communities c
  WHERE c.is_official = true
  ON CONFLICT (community_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_join_official_community_trigger
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.auto_join_official_community();
