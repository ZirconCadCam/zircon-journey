ALTER TABLE public.slot_cases
  ADD COLUMN IF NOT EXISTS notes_image_comments jsonb NOT NULL DEFAULT '[]'::jsonb;