
CREATE TABLE public.slot_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_slot integer NOT NULL,
  case_code text NOT NULL DEFAULT (('ZJ-' || to_char(now(),'YYMMDD') || '-' || substr(gen_random_uuid()::text,1,4))),
  patient_name text NOT NULL,
  patient_phone text,
  patient_age integer,
  patient_gender text,
  tooth_number text,
  shade text,
  case_type text,
  notes text,
  scan_path text,
  scan_name text,
  scan_size bigint,
  scan_mime text,
  status text NOT NULL DEFAULT 'new',
  created_by text NOT NULL DEFAULT 'doctor',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.slot_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slot_cases read public" ON public.slot_cases FOR SELECT USING (true);
CREATE POLICY "slot_cases insert public" ON public.slot_cases FOR INSERT WITH CHECK (true);
CREATE POLICY "slot_cases update public" ON public.slot_cases FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "slot_cases delete public" ON public.slot_cases FOR DELETE USING (true);

CREATE INDEX slot_cases_slot_idx ON public.slot_cases(doctor_slot, created_at DESC);
