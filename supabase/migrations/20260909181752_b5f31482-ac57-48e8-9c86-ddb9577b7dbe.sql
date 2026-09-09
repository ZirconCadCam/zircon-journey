ALTER TABLE public.slot_cases
  ADD COLUMN IF NOT EXISTS archive_receipt_path text,
  ADD COLUMN IF NOT EXISTS archive_receipt_name text,
  ADD COLUMN IF NOT EXISTS archive_receipt_mime text,
  ADD COLUMN IF NOT EXISTS archive_receipt_size bigint,
  ADD COLUMN IF NOT EXISTS archive_receipt_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_request_note text,
  ADD COLUMN IF NOT EXISTS archive_approval text,
  ADD COLUMN IF NOT EXISTS archive_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_reviewed_by text,
  ADD COLUMN IF NOT EXISTS archive_reject_reason text;

CREATE INDEX IF NOT EXISTS slot_cases_archive_approval_idx ON public.slot_cases (archive_approval);