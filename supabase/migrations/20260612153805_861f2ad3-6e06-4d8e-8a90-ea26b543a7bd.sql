-- Avatar overrides: lets the admin assign uploaded photos to each doctor / designer / technician.
CREATE TABLE public.avatar_overrides (
  subject text PRIMARY KEY,
  image_url text NOT NULL,
  label text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.avatar_overrides TO anon, authenticated;
GRANT ALL ON public.avatar_overrides TO service_role;

ALTER TABLE public.avatar_overrides ENABLE ROW LEVEL SECURITY;

-- Avatars are shown everywhere (doctor portals use the anon key), so reads are public.
CREATE POLICY "avatar_overrides read public"
  ON public.avatar_overrides FOR SELECT
  TO anon, authenticated
  USING (true);

-- Writes go through the SECURITY DEFINER RPCs below, mirroring upsert_doctor / set_doctor_secret.
CREATE OR REPLACE FUNCTION public.set_avatar_override(p_subject text, p_image_url text, p_label text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.avatar_overrides (subject, image_url, label, updated_at)
  VALUES (p_subject, p_image_url, p_label, now())
  ON CONFLICT (subject) DO UPDATE
    SET image_url = EXCLUDED.image_url,
        label = EXCLUDED.label,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_avatar_override(p_subject text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.avatar_overrides WHERE subject = p_subject;
END;
$$;