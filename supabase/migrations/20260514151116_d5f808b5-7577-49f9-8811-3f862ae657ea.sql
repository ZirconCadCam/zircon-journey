
ALTER TABLE public.slot_cases
  ADD COLUMN IF NOT EXISTS design_html_path text,
  ADD COLUMN IF NOT EXISTS design_html_name text,
  ADD COLUMN IF NOT EXISTS design_html_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS design_received_by_tech boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tech_data_sent_to_secretary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS secretary_received boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shipped_to_doctor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS received_temporary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS received_permanent boolean NOT NULL DEFAULT false;
