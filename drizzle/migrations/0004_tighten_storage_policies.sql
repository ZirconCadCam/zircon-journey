DROP POLICY IF EXISTS "case-files upload auth" ON storage.objects;
DROP POLICY IF EXISTS "doctor-files public read" ON storage.objects;
DROP POLICY IF EXISTS "doctor-files anon read" ON storage.objects;
DROP POLICY IF EXISTS "doctor-files auth update" ON storage.objects;
DROP POLICY IF EXISTS "doctor-files auth delete" ON storage.objects;
DROP POLICY IF EXISTS "doctor-files anon delete" ON storage.objects;