
-- Update can_create_pools to include estabelecimento role
CREATE OR REPLACE FUNCTION public.can_create_pools()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT is_app_admin() OR EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'pool_creator', 'estabelecimento')
  )
$function$;
