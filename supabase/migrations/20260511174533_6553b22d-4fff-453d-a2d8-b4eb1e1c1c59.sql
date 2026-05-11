DROP POLICY IF EXISTS "doctor_profiles read all auth" ON public.doctor_profiles;
CREATE POLICY "doctor_profiles read public" ON public.doctor_profiles FOR SELECT TO anon, authenticated USING (true);