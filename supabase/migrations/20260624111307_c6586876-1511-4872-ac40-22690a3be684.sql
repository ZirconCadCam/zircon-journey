CREATE TABLE IF NOT EXISTS public.staff_sessions (
  role text PRIMARY KEY,
  device_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_sessions TO service_role;
ALTER TABLE public.staff_sessions ENABLE ROW LEVEL SECURITY;
-- No direct-access policies: all access is through SECURITY DEFINER functions below.

CREATE OR REPLACE FUNCTION public.claim_staff_session(p_role text, p_device text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.staff_sessions (role, device_id, updated_at)
  VALUES (p_role, p_device, now())
  ON CONFLICT (role) DO UPDATE SET device_id = EXCLUDED.device_id, updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.check_staff_session(p_role text, p_device text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_sessions
    WHERE role = p_role AND device_id = p_device
  )
$$;

CREATE OR REPLACE FUNCTION public.clear_staff_session(p_role text, p_device text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.staff_sessions
  WHERE role = p_role AND device_id = p_device;
END; $$;

GRANT EXECUTE ON FUNCTION public.claim_staff_session(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_staff_session(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_staff_session(text, text) TO anon, authenticated;