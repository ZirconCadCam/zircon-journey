-- ============================================================
-- 1) Move doctor passwords OUT of the publicly-readable table
--    into a locked table only the service role / definer funcs reach.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.doctor_secrets (
  slot integer PRIMARY KEY,
  password text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only the service role (and SECURITY DEFINER functions, which run as owner)
-- may touch this table. No anon / authenticated grants, no RLS policies.
GRANT ALL ON public.doctor_secrets TO service_role;
ALTER TABLE public.doctor_secrets ENABLE ROW LEVEL SECURITY;

-- Migrate existing plaintext passwords into the locked table.
INSERT INTO public.doctor_secrets (slot, password)
SELECT slot, password FROM public.doctor_profiles
ON CONFLICT (slot) DO NOTHING;

-- Remove the plaintext password column from the publicly-readable table.
ALTER TABLE public.doctor_profiles DROP COLUMN IF EXISTS password;

-- ============================================================
-- 2) Server-side login check (no plaintext ever returned to client,
--    cannot be used to enumerate passwords).
-- ============================================================
CREATE OR REPLACE FUNCTION public.verify_doctor_login(p_password text)
RETURNS TABLE(slot integer, name text, active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.slot, p.name, p.active
  FROM public.doctor_profiles p
  JOIN public.doctor_secrets s ON s.slot = p.slot
  WHERE s.password = p_password
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.verify_doctor_login(text) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_doctor_login(text) TO anon, authenticated;

-- ============================================================
-- 3) Admin management of doctors (write-only for the secret — the
--    password can be SET but never read back by any client).
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_doctor(
  p_slot integer, p_name text, p_branch text, p_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.doctor_profiles WHERE slot = p_slot) THEN
    UPDATE public.doctor_profiles
      SET name = p_name, branch = p_branch, active = p_active, updated_at = now()
      WHERE slot = p_slot;
  ELSE
    INSERT INTO public.doctor_profiles (slot, name, branch, active)
      VALUES (p_slot, p_name, p_branch, p_active);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_doctor(integer, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.upsert_doctor(integer, text, text, boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_doctor_secret(p_slot integer, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.doctor_secrets (slot, password)
  VALUES (p_slot, p_password)
  ON CONFLICT (slot) DO UPDATE SET password = EXCLUDED.password, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_doctor_secret(integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_doctor_secret(integer, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_doctor_active(p_slot integer, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.doctor_profiles SET active = p_active, updated_at = now() WHERE slot = p_slot;
END;
$$;
REVOKE ALL ON FUNCTION public.set_doctor_active(integer, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.set_doctor_active(integer, boolean) TO anon, authenticated;

-- ============================================================
-- 4) Fix "function search_path mutable" linter findings.
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.bump_conversation_last_message()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.chat_conversations
  SET last_message_at = NEW.created_at, archived = false
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;

-- ============================================================
-- 5) Tighten the legacy (real-auth) case_messages read policy so a
--    user can only read messages for cases they are attached to.
-- ============================================================
DROP POLICY IF EXISTS "messages select if case visible" ON public.case_messages;
CREATE POLICY "messages select if case member"
ON public.case_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = case_messages.case_id
      AND (
        c.doctor_id = auth.uid()
        OR c.technician_id = auth.uid()
        OR c.designer_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
      )
  )
);

-- ============================================================
-- 6) Stop any authenticated user from inserting notifications for
--    arbitrary users (must be for themselves).
-- ============================================================
DROP POLICY IF EXISTS "notif insert auth" ON public.notifications;
CREATE POLICY "notif insert own"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());