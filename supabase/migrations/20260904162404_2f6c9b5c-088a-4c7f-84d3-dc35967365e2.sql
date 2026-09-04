CREATE TABLE public.case_revision_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  case_code text,
  patient_name text,
  doctor_slot integer,
  doctor_name text,
  round integer NOT NULL DEFAULT 1,
  doctor_notes text,
  shade text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  rar_path text,
  rar_name text,
  rar_sent_at timestamptz,
  html_path text,
  html_name text,
  html_sent_at timestamptz
);
CREATE INDEX case_revision_rounds_case_idx ON public.case_revision_rounds (case_id, round);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_revision_rounds TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_revision_rounds TO authenticated;
GRANT ALL ON public.case_revision_rounds TO service_role;
ALTER TABLE public.case_revision_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "revision rounds open" ON public.case_revision_rounds FOR ALL USING (true) WITH CHECK (true);