DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounting_report_deliveries',
    'accounting_reviews',
    'case_revision_rounds',
    'doctor_point_withdrawals',
    'staff_month_settlements',
    'telegram_outbox'
  ] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "case-files read auth" ON storage.objects;
DROP POLICY IF EXISTS "case-files read anon" ON storage.objects;
DROP POLICY IF EXISTS "case-files delete auth" ON storage.objects;
DROP POLICY IF EXISTS "case-files delete anon" ON storage.objects;
DROP POLICY IF EXISTS "chat-attachments read" ON storage.objects;
DROP POLICY IF EXISTS "chat-attachments read auth" ON storage.objects;
DROP POLICY IF EXISTS "chat-attachments read anon" ON storage.objects;
DROP POLICY IF EXISTS "chat-attachments select" ON storage.objects;
DROP POLICY IF EXISTS "chat-attachments delete" ON storage.objects;
DROP POLICY IF EXISTS "chat-attachments delete auth" ON storage.objects;
DROP POLICY IF EXISTS "chat-attachments delete anon" ON storage.objects;