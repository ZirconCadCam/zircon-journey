CREATE TABLE public.accounting_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope text NOT NULL,
  doctor_slot integer NOT NULL DEFAULT -1,
  year integer NOT NULL,
  month integer NOT NULL,
  reviewed boolean NOT NULL DEFAULT true,
  reviewed_by text,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, doctor_slot, year, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_reviews TO anon, authenticated;
GRANT ALL ON public.accounting_reviews TO service_role;

ALTER TABLE public.accounting_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounting_reviews readable" ON public.accounting_reviews FOR SELECT USING (true);
CREATE POLICY "accounting_reviews insertable" ON public.accounting_reviews FOR INSERT WITH CHECK (true);
CREATE POLICY "accounting_reviews updatable" ON public.accounting_reviews FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "accounting_reviews deletable" ON public.accounting_reviews FOR DELETE USING (true);

CREATE TRIGGER accounting_reviews_touch BEFORE UPDATE ON public.accounting_reviews
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();