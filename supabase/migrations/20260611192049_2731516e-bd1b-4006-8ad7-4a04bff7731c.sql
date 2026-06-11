ALTER TABLE public.doctor_profiles DROP CONSTRAINT IF EXISTS doctor_profiles_slot_check;
ALTER TABLE public.doctor_profiles ADD CONSTRAINT doctor_profiles_slot_check CHECK (slot >= 1);