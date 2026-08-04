CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  bool_value boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO anon;
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_settings readable" ON public.app_settings FOR SELECT USING (true);

INSERT INTO public.app_settings (key, bool_value) VALUES ('doctor_password_required', true);

CREATE OR REPLACE FUNCTION public.set_app_flag(p_key text, p_value boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_key NOT IN ('doctor_password_required') THEN
    RAISE EXCEPTION 'unknown setting';
  END IF;
  INSERT INTO public.app_settings (key, bool_value, updated_at)
  VALUES (p_key, p_value, now())
  ON CONFLICT (key) DO UPDATE SET bool_value = excluded.bool_value, updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_app_flag(text, boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_app_flag(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT bool_value FROM public.app_settings WHERE key = p_key;
$$;
GRANT EXECUTE ON FUNCTION public.get_app_flag(text) TO anon, authenticated;