ALTER TABLE public.slot_cases
  ADD COLUMN IF NOT EXISTS temporary_delivered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doctor_decision text,
  ADD COLUMN IF NOT EXISTS revision_notes text,
  ADD COLUMN IF NOT EXISTS revision_design_file_path text,
  ADD COLUMN IF NOT EXISTS revision_design_file_name text,
  ADD COLUMN IF NOT EXISTS revision_design_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revision_approved_by_tech boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permanent_fabrication_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permanent_shipped_to_secretary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permanent_delivered_to_doctor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS final_archived boolean NOT NULL DEFAULT false;