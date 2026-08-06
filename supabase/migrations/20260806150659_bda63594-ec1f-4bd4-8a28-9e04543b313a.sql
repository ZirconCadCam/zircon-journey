ALTER TABLE public.slot_cases
  ADD COLUMN IF NOT EXISTS before_photo_path text,
  ADD COLUMN IF NOT EXISTS before_photo_name text,
  ADD COLUMN IF NOT EXISTS before_photo_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS after_photo_path text,
  ADD COLUMN IF NOT EXISTS after_photo_name text,
  ADD COLUMN IF NOT EXISTS after_photo_sent_at timestamptz;