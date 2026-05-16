ALTER TABLE public.slot_cases
  ADD COLUMN IF NOT EXISTS permanent_received_by_secretary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permanent_installed_by_doctor boolean NOT NULL DEFAULT false;