ALTER TABLE public.slot_cases
  ADD COLUMN IF NOT EXISTS extra_zip_path text,
  ADD COLUMN IF NOT EXISTS extra_zip_name text,
  ADD COLUMN IF NOT EXISTS extra_zip_mime text,
  ADD COLUMN IF NOT EXISTS extra_zip_size bigint;