
-- Conversations: a thread linking the doctor to one or more staff roles
CREATE TABLE public.chat_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_slot integer NOT NULL REFERENCES public.doctor_profiles(slot) ON DELETE CASCADE,
  participants text[] NOT NULL,
  title text,
  archived boolean NOT NULL DEFAULT false,
  created_by text NOT NULL DEFAULT 'doctor',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_conversations_slot ON public.chat_conversations(doctor_slot);
CREATE INDEX idx_chat_conversations_participants ON public.chat_conversations USING GIN(participants);

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_conversations read public" ON public.chat_conversations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "chat_conversations insert public" ON public.chat_conversations FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "chat_conversations update public" ON public.chat_conversations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "chat_conversations delete public" ON public.chat_conversations FOR DELETE TO anon, authenticated USING (true);

CREATE TRIGGER trg_chat_conversations_touch
BEFORE UPDATE ON public.chat_conversations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Messages: belong to a conversation; attachments referenced by storage path
CREATE TABLE public.chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender text NOT NULL,
  sender_name text,
  content text NOT NULL DEFAULT '',
  message_type text NOT NULL DEFAULT 'text',
  attachment_path text,
  attachment_name text,
  attachment_size bigint,
  attachment_mime text,
  read_by text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_conv ON public.chat_messages(conversation_id, created_at);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_messages read public" ON public.chat_messages FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "chat_messages insert public" ON public.chat_messages FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "chat_messages update public" ON public.chat_messages FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Bump conversation last_message_at when a message is inserted
CREATE OR REPLACE FUNCTION public.bump_conversation_last_message()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.chat_conversations
  SET last_message_at = NEW.created_at, archived = false
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_chat_messages_bump
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_last_message();

-- Private storage bucket for chat attachments (signed URLs for security)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "chat-attachments read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'chat-attachments');
CREATE POLICY "chat-attachments insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'chat-attachments');
CREATE POLICY "chat-attachments delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'chat-attachments');
