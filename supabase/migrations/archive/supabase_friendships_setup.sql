-- ============================================
-- Friendships Table Setup
-- ============================================

-- Drop everything first to ensure clean recreation
DROP POLICY IF EXISTS "Users can view own friendships" ON public.friendships;
DROP POLICY IF EXISTS "Users can create own friend requests" ON public.friendships;
DROP POLICY IF EXISTS "Users can accept friend requests sent to them" ON public.friendships;
DROP POLICY IF EXISTS "Users can delete own friendships" ON public.friendships;

DROP TRIGGER IF EXISTS update_friendships_updated_at ON public.friendships;
DROP FUNCTION IF EXISTS trigger_update_friendships_updated_at();

DROP FUNCTION IF EXISTS public.create_friendship(UUID, UUID);
DROP FUNCTION IF EXISTS public.accept_friendship(UUID, UUID);
DROP FUNCTION IF EXISTS public.remove_friendship(UUID, UUID);

DROP INDEX IF EXISTS idx_friendships_user_id;
DROP INDEX IF EXISTS idx_friendships_friend_id;
DROP INDEX IF EXISTS idx_friendships_status;
DROP INDEX IF EXISTS idx_friendships_user_friend;

DROP TABLE IF EXISTS public.friendships CASCADE;

-- Create friendships table
CREATE TABLE public.friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_friendship UNIQUE (user_id, friend_id),
    CONSTRAINT no_self_friendship CHECK (user_id != friend_id)
);

-- Create indexes
CREATE INDEX idx_friendships_user_id ON public.friendships(user_id);
CREATE INDEX idx_friendships_friend_id ON public.friendships(friend_id);
CREATE INDEX idx_friendships_status ON public.friendships(status);
CREATE INDEX idx_friendships_user_friend ON public.friendships(user_id, friend_id, status);

-- Function to create a friendship (send friend request)
CREATE OR REPLACE FUNCTION public.create_friendship(user_id_param UUID, friend_id_param UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    friendship_id UUID;
BEGIN
    -- Check if friendship already exists (in either direction)
    SELECT f.id INTO friendship_id
    FROM public.friendships f
    WHERE (f.user_id = user_id_param AND f.friend_id = friend_id_param)
       OR (f.user_id = friend_id_param AND f.friend_id = user_id_param)
    LIMIT 1;

    IF friendship_id IS NOT NULL THEN
        RETURN friendship_id;
    END IF;

    -- Create new friendship (pending status for friend requests)
    INSERT INTO public.friendships (user_id, friend_id, status)
    VALUES (user_id_param, friend_id_param, 'pending')
    RETURNING id INTO friendship_id;

    RETURN friendship_id;
END;
$$;

-- Function to accept a friendship request
CREATE OR REPLACE FUNCTION public.accept_friendship(user_id_param UUID, friend_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.friendships f
    SET status = 'accepted',
        updated_at = NOW()
    WHERE f.user_id = friend_id_param
      AND f.friend_id = user_id_param
      AND f.status = 'pending';

    RETURN FOUND;
END;
$$;

-- Function to remove a friendship (unfriend)
CREATE OR REPLACE FUNCTION public.remove_friendship(user_id_param UUID, friend_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.friendships f
    WHERE (f.user_id = user_id_param AND f.friend_id = friend_id_param)
       OR (f.user_id = friend_id_param AND f.friend_id = user_id_param);

    RETURN FOUND;
END;
$$;

-- Enable Row Level Security
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own friendships"
    ON public.friendships
    FOR SELECT
    USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can create own friend requests"
    ON public.friendships
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can accept friend requests sent to them"
    ON public.friendships
    FOR UPDATE
    USING (auth.uid() = friend_id AND status = 'pending')
    WITH CHECK (auth.uid() = friend_id);

CREATE POLICY "Users can delete own friendships"
    ON public.friendships
    FOR DELETE
    USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION trigger_update_friendships_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER update_friendships_updated_at
    BEFORE UPDATE ON public.friendships
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_friendships_updated_at();
