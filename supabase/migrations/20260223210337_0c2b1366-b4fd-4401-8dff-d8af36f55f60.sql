
-- Function to generate slug from title
CREATE OR REPLACE FUNCTION public.generate_slug(title text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  base_slug text;
BEGIN
  -- Normalize: lowercase, replace accented chars, replace non-alnum with hyphens
  base_slug := lower(title);
  base_slug := translate(base_slug, 
    'àáâãäåèéêëìíîïòóôõöùúûüýÿñç',
    'aaaaaaeeeeiiiioooooouuuuyync');
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
  
  RETURN base_slug;
END;
$$;

-- Add slug column
ALTER TABLE public.pools ADD COLUMN IF NOT EXISTS slug text;

-- Create unique index on slug
CREATE UNIQUE INDEX IF NOT EXISTS pools_slug_unique ON public.pools(slug);

-- Populate existing pools with slugs (handle duplicates by appending short id)
UPDATE public.pools
SET slug = generate_slug(title) || '-' || left(id::text, 6)
WHERE slug IS NULL;

-- Trigger function to auto-set slug on insert/update
CREATE OR REPLACE FUNCTION public.set_pool_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter integer := 0;
BEGIN
  -- Only generate slug if title changed or slug is null
  IF NEW.slug IS NULL OR (TG_OP = 'UPDATE' AND OLD.title != NEW.title) THEN
    base_slug := generate_slug(NEW.title);
    final_slug := base_slug;
    
    -- Check for uniqueness, append counter if needed
    LOOP
      IF NOT EXISTS (SELECT 1 FROM pools WHERE slug = final_slug AND id != NEW.id) THEN
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

-- Create trigger
DROP TRIGGER IF EXISTS set_pool_slug_trigger ON public.pools;
CREATE TRIGGER set_pool_slug_trigger
BEFORE INSERT OR UPDATE ON public.pools
FOR EACH ROW
EXECUTE FUNCTION public.set_pool_slug();
