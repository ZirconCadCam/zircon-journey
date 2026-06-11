ALTER TABLE public.slot_cases
  ADD COLUMN IF NOT EXISTS shade_confirmed_doctor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shade_confirmed_designer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shade_confirmed_technician boolean NOT NULL DEFAULT false;