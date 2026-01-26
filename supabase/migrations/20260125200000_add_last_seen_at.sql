-- =====================================================
-- Add last_seen_at column to profiles table
-- This tracks when users were last active on the app
-- =====================================================

-- 1. Add last_seen_at column
-- =====================================================
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Create index for efficient queries
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at
ON public.profiles(last_seen_at DESC);

-- 3. Add comment for documentation
-- =====================================================
COMMENT ON COLUMN public.profiles.last_seen_at IS 'Timestamp of when the user was last active on the app';
