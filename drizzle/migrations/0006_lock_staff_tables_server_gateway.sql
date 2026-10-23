-- Staff screens now reach these tables only through verified server functions.
DROP POLICY IF EXISTS "slot_cases read public" ON public.slot_cases;
DROP POLICY IF EXISTS "slot_cases insert public" ON public.slot_cases;
DROP POLICY IF EXISTS "slot_cases update public" ON public.slot_cases;
DROP POLICY IF EXISTS "slot_cases delete public" ON public.slot_cases;
CREATE POLICY "slot_cases admin users" ON public.slot_cases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "chat_conversations read public" ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_conversations insert public" ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_conversations update public" ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_conversations delete public" ON public.chat_conversations;

DROP POLICY IF EXISTS "chat_messages read public" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages insert public" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages update public" ON public.chat_messages;

DROP POLICY IF EXISTS "doctor_files read public" ON public.doctor_files;
DROP POLICY IF EXISTS "doctor_files insert public" ON public.doctor_files;
DROP POLICY IF EXISTS "doctor_files update public" ON public.doctor_files;

DROP POLICY IF EXISTS "file_activity read public" ON public.file_activity;
DROP POLICY IF EXISTS "file_activity insert public" ON public.file_activity;

DROP POLICY IF EXISTS "read telegram file links" ON public.telegram_file_links;
DROP POLICY IF EXISTS "app_settings readable" ON public.app_settings;
DROP POLICY IF EXISTS "avatar_overrides read public" ON public.avatar_overrides;

-- Browser uploads now use server-issued signed upload tokens.
DROP POLICY IF EXISTS "chat-attachments insert" ON storage.objects;
DROP POLICY IF EXISTS "doctor-files anon insert" ON storage.objects;
DROP POLICY IF EXISTS "doctor-files auth write" ON storage.objects;

-- Passwords are checked and changed on the server only.
REVOKE EXECUTE ON FUNCTION public.get_staff_password(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_staff_secrets() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_doctor_secrets() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_staff_secret(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_doctor_secret(integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_doctor(integer, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_doctor_active(integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_doctor_login(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_password(text), public.list_staff_secrets(), public.list_doctor_secrets(),
  public.set_staff_secret(text, text), public.set_doctor_secret(integer, text), public.upsert_doctor(integer, text, text, boolean),
  public.set_doctor_active(integer, boolean), public.verify_doctor_login(text) TO service_role;