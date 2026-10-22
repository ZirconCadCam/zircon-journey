CREATE TABLE public.telegram_file_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_path text NOT NULL,
  bucket text,
  file_name text NOT NULL,
  chat_id text NOT NULL,
  message_id bigint NOT NULL,
  link text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telegram_file_links_path_idx ON public.telegram_file_links (object_path);
GRANT SELECT ON public.telegram_file_links TO anon, authenticated;
GRANT ALL ON public.telegram_file_links TO service_role;
ALTER TABLE public.telegram_file_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read telegram file links" ON public.telegram_file_links FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.slot_cases ADD COLUMN files_purged_at timestamptz;