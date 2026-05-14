
ALTER TABLE public.slot_cases
  ADD COLUMN IF NOT EXISTS teeth_count text,
  ADD COLUMN IF NOT EXISTS design_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS design_file_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fabrication_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fabrication_file_sent boolean NOT NULL DEFAULT false;
