-- Competition Chat Messages Table
-- Stores messages for competition group chats with real-time sync

-- Create the chat messages table
CREATE TABLE IF NOT EXISTS competition_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message_content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_competition ON competition_chat_messages(competition_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON competition_chat_messages(competition_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE competition_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read messages from competitions they are participating in
CREATE POLICY "Users can read messages from their competitions" ON competition_chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM competition_participants
      WHERE competition_participants.competition_id = competition_chat_messages.competition_id
      AND competition_participants.user_id = auth.uid()
    )
  );

-- Policy: Users can insert messages to competitions they are participating in
CREATE POLICY "Users can send messages to their competitions" ON competition_chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM competition_participants
      WHERE competition_participants.competition_id = competition_chat_messages.competition_id
      AND competition_participants.user_id = auth.uid()
    )
  );

-- Enable realtime for the table
ALTER PUBLICATION supabase_realtime ADD TABLE competition_chat_messages;
