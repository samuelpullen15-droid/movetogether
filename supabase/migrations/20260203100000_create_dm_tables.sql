-- ============================================================================
-- DIRECT MESSAGES (1-on-1 Private Messaging)
-- ============================================================================
-- Friends-only private messaging between users. Separate from competition
-- group chat (competition_chat_messages) because DMs have different access
-- patterns: no competition context, read receipts, global unread counts.
--
-- Three tables: dm_conversations, dm_messages, dm_reactions.
-- Canonical ordering trigger ensures one conversation row per user pair.

-- ============================================================================
-- STEP 1: dm_conversations table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.dm_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user2_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT dm_conversations_no_self CHECK (user1_id <> user2_id),
    CONSTRAINT dm_conversations_unique_pair UNIQUE (user1_id, user2_id)
);

COMMENT ON TABLE public.dm_conversations
    IS '1-on-1 conversation between two users. user1_id < user2_id enforced by trigger.';

-- Canonical ordering trigger: always store user1_id < user2_id (UUID lexicographic)
CREATE OR REPLACE FUNCTION enforce_dm_conversation_order()
RETURNS TRIGGER AS $$
DECLARE
    tmp UUID;
BEGIN
    IF NEW.user1_id > NEW.user2_id THEN
        tmp := NEW.user1_id;
        NEW.user1_id := NEW.user2_id;
        NEW.user2_id := tmp;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_dm_conversation_order
    BEFORE INSERT ON public.dm_conversations
    FOR EACH ROW
    EXECUTE FUNCTION enforce_dm_conversation_order();

-- Indexes for conversation lookups by either user
CREATE INDEX IF NOT EXISTS idx_dm_conversations_user1
    ON public.dm_conversations(user1_id);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_user2
    ON public.dm_conversations(user2_id);

-- ============================================================================
-- STEP 2: dm_messages table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.dm_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message_content TEXT NOT NULL,
    read_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.dm_messages
    IS 'Direct messages within a conversation. read_at tracks read receipts.';
COMMENT ON COLUMN public.dm_messages.read_at
    IS 'Timestamp when the recipient read this message. NULL = unread.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation
    ON public.dm_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation_created
    ON public.dm_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_messages_unread
    ON public.dm_messages(conversation_id, read_at)
    WHERE read_at IS NULL;

-- ============================================================================
-- STEP 3: dm_reactions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.dm_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.dm_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reaction_type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(message_id, user_id, reaction_type)
);

COMMENT ON TABLE public.dm_reactions
    IS 'Emoji reactions on DM messages. Same 6 types as competition chat.';

CREATE INDEX IF NOT EXISTS idx_dm_reactions_message
    ON public.dm_reactions(message_id);

-- ============================================================================
-- STEP 4: Triggers for updated_at
-- ============================================================================

-- Auto-update updated_at on dm_conversations when modified directly
CREATE OR REPLACE FUNCTION update_dm_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_dm_conversations_updated_at
    BEFORE UPDATE ON public.dm_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_dm_conversations_updated_at();

-- Auto-update dm_conversations.updated_at when a new message is inserted
-- (for sorting conversation list by most recent activity)
CREATE OR REPLACE FUNCTION update_dm_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.dm_conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_dm_conversation_on_message
    AFTER INSERT ON public.dm_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_dm_conversation_on_message();

-- ============================================================================
-- STEP 5: Row Level Security
-- ============================================================================

ALTER TABLE public.dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_reactions ENABLE ROW LEVEL SECURITY;

-- dm_conversations: users can read conversations they are part of
CREATE POLICY "Users can read own conversations"
    ON public.dm_conversations FOR SELECT TO authenticated
    USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can insert own conversations"
    ON public.dm_conversations FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Service role full access
CREATE POLICY "Service role full access to dm_conversations"
    ON public.dm_conversations FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- dm_messages: users can read/insert messages in their conversations
CREATE POLICY "Users can read messages in own conversations"
    ON public.dm_messages FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.dm_conversations c
            WHERE c.id = dm_messages.conversation_id
            AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
        )
    );

CREATE POLICY "Users can send messages in own conversations"
    ON public.dm_messages FOR INSERT TO authenticated
    WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.dm_conversations c
            WHERE c.id = dm_messages.conversation_id
            AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
        )
    );

CREATE POLICY "Users can mark messages as read"
    ON public.dm_messages FOR UPDATE TO authenticated
    USING (
        sender_id <> auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.dm_conversations c
            WHERE c.id = dm_messages.conversation_id
            AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
        )
    )
    WITH CHECK (sender_id <> auth.uid());

-- Service role full access
CREATE POLICY "Service role full access to dm_messages"
    ON public.dm_messages FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- dm_reactions: access verified through conversation membership chain
CREATE POLICY "Users can read reactions in own conversations"
    ON public.dm_reactions FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.dm_messages m
            JOIN public.dm_conversations c ON c.id = m.conversation_id
            WHERE m.id = dm_reactions.message_id
            AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
        )
    );

CREATE POLICY "Users can add reactions in own conversations"
    ON public.dm_reactions FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.dm_messages m
            JOIN public.dm_conversations c ON c.id = m.conversation_id
            WHERE m.id = dm_reactions.message_id
            AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
        )
    );

CREATE POLICY "Users can delete own reactions"
    ON public.dm_reactions FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- Service role full access
CREATE POLICY "Service role full access to dm_reactions"
    ON public.dm_reactions FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ============================================================================
-- STEP 6: Enable Realtime
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_reactions;

-- ============================================================================
-- STEP 7: Add notification preference column
-- ============================================================================

ALTER TABLE public.notification_preferences
ADD COLUMN IF NOT EXISTS direct_message_push BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.notification_preferences.direct_message_push
    IS 'Whether to send push notifications for new direct messages';
