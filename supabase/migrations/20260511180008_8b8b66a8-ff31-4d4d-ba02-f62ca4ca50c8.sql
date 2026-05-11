
ALTER TABLE public.doctor_messages
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_mime text,
  ADD COLUMN IF NOT EXISTS attachment_size bigint,
  ADD COLUMN IF NOT EXISTS sender_name text,
  ADD COLUMN IF NOT EXISTS read_by_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_by_secretary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_by_technician boolean NOT NULL DEFAULT false;

-- Allow anonymous (doctor session) read/write since doctors authenticate via password gate, not auth.users
DROP POLICY IF EXISTS "doctor_messages insert auth" ON public.doctor_messages;
DROP POLICY IF EXISTS "doctor_messages read auth" ON public.doctor_messages;
DROP POLICY IF EXISTS "doctor_messages update auth" ON public.doctor_messages;

CREATE POLICY "doctor_messages read public" ON public.doctor_messages
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "doctor_messages insert public" ON public.doctor_messages
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "doctor_messages update public" ON public.doctor_messages
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Same for files (doctor session is unauthenticated)
DROP POLICY IF EXISTS "doctor_files read auth" ON public.doctor_files;
DROP POLICY IF EXISTS "doctor_files insert auth" ON public.doctor_files;
DROP POLICY IF EXISTS "doctor_files update auth" ON public.doctor_files;
DROP POLICY IF EXISTS "doctor_files delete auth" ON public.doctor_files;

CREATE POLICY "doctor_files read public" ON public.doctor_files
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "doctor_files insert public" ON public.doctor_files
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "doctor_files update public" ON public.doctor_files
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "doctor_files delete public" ON public.doctor_files
  FOR DELETE TO anon, authenticated USING (true);

-- Storage policies for doctor-files bucket (public bucket, allow anon ops)
DO $$ BEGIN
  CREATE POLICY "doctor-files anon read" ON storage.objects
    FOR SELECT TO anon, authenticated USING (bucket_id = 'doctor-files');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "doctor-files anon insert" ON storage.objects
    FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'doctor-files');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "doctor-files anon delete" ON storage.objects
    FOR DELETE TO anon, authenticated USING (bucket_id = 'doctor-files');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
