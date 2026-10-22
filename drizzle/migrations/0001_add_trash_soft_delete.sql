ALTER TABLE public.slot_cases ADD COLUMN IF NOT EXISTS trashed_at timestamp with time zone;
ALTER TABLE public.doctor_files ADD COLUMN IF NOT EXISTS trashed_at timestamp with time zone;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS trashed_at timestamp with time zone;
CREATE INDEX IF NOT EXISTS slot_cases_trashed_idx ON public.slot_cases (trashed_at) WHERE trashed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS doctor_files_trashed_idx ON public.doctor_files (trashed_at) WHERE trashed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS expenses_trashed_idx ON public.expenses (trashed_at) WHERE trashed_at IS NOT NULL;
COMMENT ON COLUMN public.slot_cases.trashed_at IS 'Soft delete: row lives in the recycle bin until purged 7 days after this timestamp.';
COMMENT ON COLUMN public.doctor_files.trashed_at IS 'Soft delete: row lives in the recycle bin until purged 7 days after this timestamp.';
COMMENT ON COLUMN public.expenses.trashed_at IS 'Soft delete: row lives in the recycle bin until purged 7 days after this timestamp.';