-- Ring closure notification deduplication table
-- Tracks which ring closure notifications have been sent per user/date/ring
-- to prevent duplicate notifications during re-syncs or backfills.

CREATE TABLE IF NOT EXISTS ring_notifications_sent (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  ring_type text NOT NULL, -- 'move', 'exercise', 'stand', 'all'
  sent_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date, ring_type)
);

-- RLS enabled with deny-all by default (no policies).
-- All access goes through service_role in Edge Functions.
ALTER TABLE ring_notifications_sent ENABLE ROW LEVEL SECURITY;
