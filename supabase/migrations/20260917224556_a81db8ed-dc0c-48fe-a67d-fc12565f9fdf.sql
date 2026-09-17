CREATE TABLE public.telegram_outbox (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  caption text NOT NULL,
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX telegram_outbox_pending_idx ON public.telegram_outbox (status, created_at);

GRANT SELECT, INSERT ON public.telegram_outbox TO anon;
GRANT SELECT, INSERT ON public.telegram_outbox TO authenticated;
GRANT ALL ON public.telegram_outbox TO service_role;

ALTER TABLE public.telegram_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app can queue telegram messages" ON public.telegram_outbox
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "app can read telegram queue" ON public.telegram_outbox
  FOR SELECT TO anon, authenticated USING (true);