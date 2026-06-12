-- Staff (page manager) login secrets, manageable by admin
CREATE TABLE IF NOT EXISTS public.staff_secrets (
  role text PRIMARY KEY,
  password text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_secrets TO service_role;
ALTER TABLE public.staff_secrets ENABLE ROW LEVEL SECURITY;
-- No direct-access policies: all access is through SECURITY DEFINER functions below.

INSERT INTO public.staff_secrets (role, password) VALUES
  ('designer','mcadcam'),
  ('technician','fcadcam'),
  ('secretary_sanaa','sanaacadcam'),
  ('secretary_ibb','ibbcadcam'),
  ('admin','ZirconCadCam1979')
ON CONFLICT (role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_staff_secret(p_role text, p_password text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.staff_secrets (role, password, updated_at)
  VALUES (p_role, p_password, now())
  ON CONFLICT (role) DO UPDATE SET password = EXCLUDED.password, updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.get_staff_password(p_role text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT password FROM public.staff_secrets WHERE role = p_role LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.list_staff_secrets()
RETURNS TABLE(role text, password text, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role, password, updated_at FROM public.staff_secrets ORDER BY role
$$;

CREATE OR REPLACE FUNCTION public.list_doctor_secrets()
RETURNS TABLE(slot integer, name text, active boolean, password text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.slot, p.name, p.active, s.password
  FROM public.doctor_profiles p
  LEFT JOIN public.doctor_secrets s ON s.slot = p.slot
  ORDER BY p.slot
$$;

GRANT EXECUTE ON FUNCTION public.set_staff_secret(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_password(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_staff_secrets() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_doctor_secrets() TO anon, authenticated;