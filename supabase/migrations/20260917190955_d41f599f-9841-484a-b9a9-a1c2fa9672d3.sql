CREATE TABLE public.accounting_report_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope TEXT NOT NULL,
  doctor_slot INTEGER,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  ok BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX accounting_report_deliveries_uniq
  ON public.accounting_report_deliveries (scope, year, month, COALESCE(doctor_slot, -1));

GRANT SELECT ON public.accounting_report_deliveries TO authenticated, anon;
GRANT ALL ON public.accounting_report_deliveries TO service_role;

ALTER TABLE public.accounting_report_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read accounting deliveries"
  ON public.accounting_report_deliveries FOR SELECT TO anon, authenticated USING (true);

CREATE TRIGGER update_accounting_report_deliveries_updated_at
  BEFORE UPDATE ON public.accounting_report_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();