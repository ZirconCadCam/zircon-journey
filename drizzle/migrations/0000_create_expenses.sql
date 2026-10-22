CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor text,
  expense_date date,
  amount numeric,
  currency text,
  category text NOT NULL DEFAULT 'أخرى',
  description text,
  invoice_number text,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_mime text,
  status text NOT NULL DEFAULT 'done',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE INDEX expenses_created_idx ON public.expenses (created_at DESC);