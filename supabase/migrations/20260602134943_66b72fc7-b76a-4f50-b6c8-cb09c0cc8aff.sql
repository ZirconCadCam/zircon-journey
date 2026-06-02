-- Part 2: per-case file activity log (uploads/downloads)
CREATE TABLE public.file_activity (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id uuid NOT NULL,
  action text NOT NULL,            -- 'upload' | 'download'
  file_name text NOT NULL,
  status text NOT NULL DEFAULT 'done', -- 'done' | 'failed' | 'canceled'
  actor text,
  actor_role text,
  size_bytes bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_file_activity_case_id ON public.file_activity (case_id, created_at DESC);

GRANT SELECT, INSERT ON public.file_activity TO anon, authenticated;
GRANT ALL ON public.file_activity TO service_role;

ALTER TABLE public.file_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "file_activity read public"
ON public.file_activity FOR SELECT
USING (true);

CREATE POLICY "file_activity insert public"
ON public.file_activity FOR INSERT
WITH CHECK (true);

-- Part 3: idempotency for case saves — prevent duplicate submissions of the same payload
ALTER TABLE public.slot_cases ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS slot_cases_idempotency_key_uidx
ON public.slot_cases (idempotency_key)
WHERE idempotency_key IS NOT NULL;