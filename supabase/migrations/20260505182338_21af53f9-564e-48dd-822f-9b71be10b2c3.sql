REVOKE ALL ON FUNCTION public.check_email_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_email_status(text) TO service_role;