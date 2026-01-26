-- Chat Message Reactions Table
-- Stores reactions for competition group chat messages

-- Create the chat message reactions table
CREATE TABLE IF NOT EXISTS competition_chat_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES competition_chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Ensure one reaction type per user per message
  UNIQUE(message_id, user_id, reaction_type)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON competition_chat_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_user ON competition_chat_reactions(user_id);

-- Enable Row Level Security
ALTER TABLE competition_chat_reactions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read reactions from messages in competitions they participate in
CREATE POLICY "Users can read reactions from their competition chats" ON competition_chat_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM competition_chat_messages ccm
      JOIN competition_participants cp ON cp.competition_id = ccm.competition_id
      WHERE ccm.id = competition_chat_reactions.message_id
      AND cp.user_id = auth.uid()
    )
  );

-- Policy: Users can add reactions to messages in competitions they participate in
CREATE POLICY "Users can add reactions to their competition chats" ON competition_chat_reactions
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM competition_chat_messages ccm
      JOIN competition_participants cp ON cp.competition_id = ccm.competition_id
      WHERE ccm.id = competition_chat_reactions.message_id
      AND cp.user_id = auth.uid()
    )
  );

-- Policy: Users can delete their own reactions
CREATE POLICY "Users can delete their own reactions" ON competition_chat_reactions
  FOR DELETE USING (user_id = auth.uid());

-- Enable realtime for the table
ALTER PUBLICATION supabase_realtime ADD TABLE competition_chat_reactions;
