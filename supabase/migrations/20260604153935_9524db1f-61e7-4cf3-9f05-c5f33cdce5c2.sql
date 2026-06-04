DELETE FROM public.chat_messages cm
USING public.chat_conversations cc, public.doctor_profiles dp
WHERE cm.conversation_id = cc.id
  AND dp.slot = cc.doctor_slot
  AND (
    ('secretary_ibb' = ANY(cc.participants) AND dp.branch = 'sanaa')
    OR ('secretary_sanaa' = ANY(cc.participants) AND dp.branch = 'ibb')
  );

DELETE FROM public.chat_conversations cc
USING public.doctor_profiles dp
WHERE dp.slot = cc.doctor_slot
  AND (
    ('secretary_ibb' = ANY(cc.participants) AND dp.branch = 'sanaa')
    OR ('secretary_sanaa' = ANY(cc.participants) AND dp.branch = 'ibb')
  );