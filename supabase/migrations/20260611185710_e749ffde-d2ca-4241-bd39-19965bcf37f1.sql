-- 1. cases: scope designer/technician SELECT + UPDATE to unassigned or own rows
DROP POLICY IF EXISTS "cases designer select" ON public.cases;
CREATE POLICY "cases designer select" ON public.cases FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'designer'::app_role) AND (designer_id = auth.uid() OR designer_id IS NULL));

DROP POLICY IF EXISTS "cases designer update" ON public.cases;
CREATE POLICY "cases designer update" ON public.cases FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'designer'::app_role) AND (designer_id = auth.uid() OR designer_id IS NULL))
WITH CHECK (has_role(auth.uid(), 'designer'::app_role) AND designer_id = auth.uid());

DROP POLICY IF EXISTS "cases technician select" ON public.cases;
CREATE POLICY "cases technician select" ON public.cases FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'technician'::app_role) AND (technician_id = auth.uid() OR technician_id IS NULL));

DROP POLICY IF EXISTS "cases technician update" ON public.cases;
CREATE POLICY "cases technician update" ON public.cases FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'technician'::app_role) AND (technician_id = auth.uid() OR technician_id IS NULL))
WITH CHECK (has_role(auth.uid(), 'technician'::app_role) AND technician_id = auth.uid());

-- 2. case_files: restrict SELECT to case members (align with case_messages)
DROP POLICY IF EXISTS "files select if case visible" ON public.case_files;
CREATE POLICY "files select if case member" ON public.case_files FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.cases c
  WHERE c.id = case_files.case_id
    AND (c.doctor_id = auth.uid() OR c.technician_id = auth.uid()
         OR c.designer_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
));

-- 3. profiles: remove broad authenticated read; scope to self, admin, and case co-members
DROP POLICY IF EXISTS "profiles read auth" ON public.profiles;

CREATE POLICY "profiles read own" ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

CREATE POLICY "profiles read admin" ON public.profiles FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "profiles read case comembers" ON public.profiles FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.cases c
  WHERE (c.doctor_id = auth.uid() OR c.technician_id = auth.uid() OR c.designer_id = auth.uid())
    AND (c.doctor_id = profiles.id OR c.technician_id = profiles.id OR c.designer_id = profiles.id)
));