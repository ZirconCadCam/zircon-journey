REVOKE EXECUTE ON FUNCTION public.set_avatar_override(text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_avatar_override(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_staff_session(text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_staff_session(text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_staff_session(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_avatar_override(text,text,text), public.clear_avatar_override(text), public.claim_staff_session(text,text), public.check_staff_session(text,text), public.clear_staff_session(text,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.set_doctor_active(integer,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.staff_sessions FROM anon, authenticated;
COMMENT ON TABLE public.staff_sessions IS 'DEPRECATED: device sign-in uses server-signed staff tickets with a 30-day expiry';