DROP POLICY IF EXISTS "doctor_messages insert public" ON public.doctor_messages;
DROP POLICY IF EXISTS "doctor_messages read public" ON public.doctor_messages;
DROP POLICY IF EXISTS "doctor_messages update public" ON public.doctor_messages;
DROP POLICY IF EXISTS "doctor_files delete public" ON public.doctor_files;
COMMENT ON TABLE public.doctor_messages IS 'DEPRECATED: replaced by chat_conversations/chat_messages; browser access removed.';