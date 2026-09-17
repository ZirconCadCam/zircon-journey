UPDATE public.accounting_report_deliveries SET doctor_slot = -1 WHERE doctor_slot IS NULL;
ALTER TABLE public.accounting_report_deliveries
  ALTER COLUMN doctor_slot SET DEFAULT -1,
  ALTER COLUMN doctor_slot SET NOT NULL;
DROP INDEX IF EXISTS accounting_report_deliveries_uniq;
CREATE UNIQUE INDEX accounting_report_deliveries_uniq
  ON public.accounting_report_deliveries (scope, year, month, doctor_slot);