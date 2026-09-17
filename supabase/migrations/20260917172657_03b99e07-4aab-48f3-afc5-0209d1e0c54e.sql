ALTER TABLE public.slot_cases ADD COLUMN IF NOT EXISTS remaining_amount numeric;

CREATE TABLE public.doctor_point_withdrawals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_slot integer NOT NULL,
  points integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctor_point_withdrawals TO anon, authenticated;
GRANT ALL ON public.doctor_point_withdrawals TO service_role;
ALTER TABLE public.doctor_point_withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dpw read public" ON public.doctor_point_withdrawals FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "dpw insert public" ON public.doctor_point_withdrawals FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "dpw update public" ON public.doctor_point_withdrawals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "dpw delete public" ON public.doctor_point_withdrawals FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE public.staff_month_settlements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope text NOT NULL CHECK (scope IN ('designer','technician')),
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  settled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, year, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_month_settlements TO anon, authenticated;
GRANT ALL ON public.staff_month_settlements TO service_role;
ALTER TABLE public.staff_month_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms read public" ON public.staff_month_settlements FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "sms insert public" ON public.staff_month_settlements FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "sms update public" ON public.staff_month_settlements FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sms delete public" ON public.staff_month_settlements FOR DELETE TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER dpw_updated_at BEFORE UPDATE ON public.doctor_point_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER sms_updated_at BEFORE UPDATE ON public.staff_month_settlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();