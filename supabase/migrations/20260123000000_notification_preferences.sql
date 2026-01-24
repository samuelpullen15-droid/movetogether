-- Create notification_preferences table
-- Stores user notification preferences for push and email notifications

CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Competition Updates
    competition_push BOOLEAN NOT NULL DEFAULT true,
    competition_email BOOLEAN NOT NULL DEFAULT true,

    -- Friend Activity
    friends_push BOOLEAN NOT NULL DEFAULT true,
    friends_email BOOLEAN NOT NULL DEFAULT true,

    -- Achievements & Milestones
    achievements_push BOOLEAN NOT NULL DEFAULT true,

    -- Coach Spark (AI Coach)
    coach_push BOOLEAN NOT NULL DEFAULT true,

    -- Account & Security
    account_push BOOLEAN NOT NULL DEFAULT true,
    account_email BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    -- Ensure one row per user
    CONSTRAINT notification_preferences_user_unique UNIQUE (user_id)
);

-- Create index for fast lookups by user_id
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON public.notification_preferences(user_id);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only read/write their own preferences
CREATE POLICY "Users can view own notification preferences"
    ON public.notification_preferences
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification preferences"
    ON public.notification_preferences
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences"
    ON public.notification_preferences
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notification preferences"
    ON public.notification_preferences
    FOR DELETE
    USING (auth.uid() = user_id);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER trigger_notification_preferences_updated_at
    BEFORE UPDATE ON public.notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_preferences_updated_at();

-- Function to create default preferences for new users
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.notification_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create default preferences when a new profile is created
-- This ensures every user has notification preferences
CREATE TRIGGER trigger_create_default_notification_preferences
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_default_notification_preferences();
