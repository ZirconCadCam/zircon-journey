
-- Add delivery/read tracking to chat messages for WhatsApp-style ticks
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Track per-stage delivery/read on cases (for the progress bar ticks)
ALTER TABLE public.slot_cases
  ADD COLUMN IF NOT EXISTS new_delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS new_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS design_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS design_delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS design_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS perm_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS perm_delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS perm_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS perm_ship_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS perm_ship_delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS perm_ship_read_at TIMESTAMPTZ;
