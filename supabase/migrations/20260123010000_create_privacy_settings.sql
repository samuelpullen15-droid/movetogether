-- Create privacy_settings table
-- Stores user privacy preferences for profile visibility, friend requests, and data sharing

-- Create enum types for visibility settings
CREATE TYPE public.profile_visibility_type AS ENUM ('public', 'friends_only', 'private');
CREATE TYPE public.friend_request_visibility_type AS ENUM ('everyone', 'friends_of_friends', 'no_one');
CREATE TYPE public.competition_invite_visibility_type AS ENUM ('everyone', 'friends_only', 'no_one');

-- Create the privacy_settings table
CREATE TABLE IF NOT EXISTS public.privacy_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Profile visibility
    profile_visibility public.profile_visibility_type NOT NULL DEFAULT 'public',
    show_real_name_on_leaderboards BOOLEAN NOT NULL DEFAULT false,

    -- Discoverability
    allow_find_by_email BOOLEAN NOT NULL DEFAULT true,
    show_activity_in_feed BOOLEAN NOT NULL DEFAULT true,
    show_on_public_leaderboards BOOLEAN NOT NULL DEFAULT true,

    -- Stats visibility
    show_detailed_stats BOOLEAN NOT NULL DEFAULT true,
    visible_metrics JSONB NOT NULL DEFAULT '{"steps": true, "calories": true, "active_minutes": true, "distance": true, "workouts": true}'::jsonb,

    -- Social permissions
    friend_request_visibility public.friend_request_visibility_type NOT NULL DEFAULT 'everyone',
    competition_invite_visibility public.competition_invite_visibility_type NOT NULL DEFAULT 'everyone',

    -- Analytics
    analytics_opt_in BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_privacy_settings_user_id ON public.privacy_settings(user_id);

-- Enable RLS
ALTER TABLE public.privacy_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own privacy settings
CREATE POLICY "Users can view own privacy settings"
    ON public.privacy_settings
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own privacy settings
CREATE POLICY "Users can insert own privacy settings"
    ON public.privacy_settings
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own privacy settings
CREATE POLICY "Users can update own privacy settings"
    ON public.privacy_settings
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own privacy settings
CREATE POLICY "Users can delete own privacy settings"
    ON public.privacy_settings
    FOR DELETE
    USING (auth.uid() = user_id);

-- Service role can read all (for backend queries)
CREATE POLICY "Service role can read all privacy settings"
    ON public.privacy_settings
    FOR SELECT
    TO service_role
    USING (true);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_privacy_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER trigger_privacy_settings_updated_at
    BEFORE UPDATE ON public.privacy_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_privacy_settings_updated_at();

-- Function to create default privacy settings for new users
CREATE OR REPLACE FUNCTION create_default_privacy_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.privacy_settings (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create default privacy settings when a new profile is created
CREATE TRIGGER trigger_create_default_privacy_settings
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_default_privacy_settings();

-- Helper function: Check if sender can send friend request to recipient
CREATE OR REPLACE FUNCTION can_send_friend_request(sender_id UUID, recipient_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    recipient_visibility public.friend_request_visibility_type;
    has_mutual_friend BOOLEAN;
BEGIN
    -- Get recipient's friend request visibility setting
    SELECT friend_request_visibility INTO recipient_visibility
    FROM public.privacy_settings
    WHERE user_id = recipient_id;

    -- If no settings found, default to 'everyone' (allow)
    IF recipient_visibility IS NULL THEN
        RETURN true;
    END IF;

    -- Check based on visibility setting
    CASE recipient_visibility
        WHEN 'no_one' THEN
            RETURN false;
        WHEN 'everyone' THEN
            RETURN true;
        WHEN 'friends_of_friends' THEN
            -- Check if sender shares at least one mutual friend with recipient
            SELECT EXISTS (
                -- Find friends of sender
                SELECT 1
                FROM public.friendships f1
                WHERE (f1.user_id = sender_id OR f1.friend_id = sender_id)
                  AND f1.status = 'accepted'
                  AND EXISTS (
                      -- Check if any of sender's friends are also friends with recipient
                      SELECT 1
                      FROM public.friendships f2
                      WHERE f2.status = 'accepted'
                        AND (
                            -- The mutual friend from sender's perspective
                            (f1.user_id = sender_id AND f1.friend_id = f2.user_id AND f2.friend_id = recipient_id) OR
                            (f1.user_id = sender_id AND f1.friend_id = f2.friend_id AND f2.user_id = recipient_id) OR
                            (f1.friend_id = sender_id AND f1.user_id = f2.user_id AND f2.friend_id = recipient_id) OR
                            (f1.friend_id = sender_id AND f1.user_id = f2.friend_id AND f2.user_id = recipient_id)
                        )
                  )
            ) INTO has_mutual_friend;

            RETURN has_mutual_friend;
    END CASE;

    -- Default to true if something unexpected happens
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Check if sender can send competition invite to recipient
CREATE OR REPLACE FUNCTION can_send_competition_invite(sender_id UUID, recipient_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    recipient_visibility public.competition_invite_visibility_type;
    are_friends BOOLEAN;
BEGIN
    -- Get recipient's competition invite visibility setting
    SELECT competition_invite_visibility INTO recipient_visibility
    FROM public.privacy_settings
    WHERE user_id = recipient_id;

    -- If no settings found, default to 'everyone' (allow)
    IF recipient_visibility IS NULL THEN
        RETURN true;
    END IF;

    -- Check based on visibility setting
    CASE recipient_visibility
        WHEN 'no_one' THEN
            RETURN false;
        WHEN 'everyone' THEN
            RETURN true;
        WHEN 'friends_only' THEN
            -- Check if sender and recipient are friends
            SELECT EXISTS (
                SELECT 1
                FROM public.friendships
                WHERE status = 'accepted'
                  AND (
                      (user_id = sender_id AND friend_id = recipient_id) OR
                      (user_id = recipient_id AND friend_id = sender_id)
                  )
            ) INTO are_friends;

            RETURN are_friends;
    END CASE;

    -- Default to true if something unexpected happens
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on helper functions
GRANT EXECUTE ON FUNCTION can_send_friend_request(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_send_competition_invite(UUID, UUID) TO authenticated;
