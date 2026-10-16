ALTER TABLE public.telegram_outbox ADD COLUMN IF NOT EXISTS docs_total integer;
UPDATE public.telegram_outbox SET docs_total = COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(documents::jsonb)='array' THEN documents::jsonb ELSE '[]'::jsonb END),0) WHERE docs_total IS NULL;
CREATE TABLE public.telegram_outbox_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL,
  action text NOT NULL,
  actor text,
  result text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telegram_outbox_log_outbox_idx ON public.telegram_outbox_log(outbox_id, created_at DESC);
GRANT ALL ON public.telegram_outbox_log TO service_role;
ALTER TABLE public.telegram_outbox_log ENABLE ROW LEVEL SECURITY;