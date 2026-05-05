CREATE OR REPLACE FUNCTION public.check_email_status(_email text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'exists', true,
        'user_id', u.id,
        'email_confirmed', u.email_confirmed_at IS NOT NULL,
        'has_profile', p.id IS NOT NULL
      )
      FROM auth.users u
      LEFT JOIN public.profiles p ON p.id = u.id
      WHERE lower(u.email) = lower(trim(_email))
      ORDER BY u.created_at DESC
      LIMIT 1
    ),
    jsonb_build_object(
      'exists', false,
      'user_id', null,
      'email_confirmed', false,
      'has_profile', false
    )
  );
$$;