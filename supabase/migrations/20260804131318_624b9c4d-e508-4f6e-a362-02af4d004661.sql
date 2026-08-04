-- Restrict app flag changes to admins only.
DROP FUNCTION IF EXISTS public.set_app_flag(text, boolean);

CREATE OR REPLACE FUNCTION public.is_admin_actor(p_admin_password text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE pw text;
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin') THEN
    RETURN true;
  END IF;
  IF p_admin_password IS NULL OR length(btrim(p_admin_password)) = 0 THEN
    RETURN false;
  END IF;
  SELECT password INTO pw FROM public.staff_secrets WHERE role = 'admin' LIMIT 1;
  RETURN pw IS NOT NULL AND pw = p_admin_password;
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin_actor(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_actor(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_app_flag(p_key text, p_value boolean, p_admin_password text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_actor(p_admin_password) THEN
    RAISE EXCEPTION 'غير مصرح: هذا الإجراء متاح للإدارة فقط';
  END IF;
  IF p_key NOT IN ('doctor_password_required') THEN
    RAISE EXCEPTION 'unknown setting';
  END IF;
  INSERT INTO public.app_settings (key, bool_value, updated_at)
  VALUES (p_key, p_value, now())
  ON CONFLICT (key) DO UPDATE SET bool_value = excluded.bool_value, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_app_flag(text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_app_flag(text, boolean, text) TO anon, authenticated, service_role;