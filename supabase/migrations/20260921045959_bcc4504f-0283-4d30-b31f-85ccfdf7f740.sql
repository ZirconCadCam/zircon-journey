CREATE POLICY "chat-attachments update for upload" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'chat-attachments')
  WITH CHECK (bucket_id = 'chat-attachments');