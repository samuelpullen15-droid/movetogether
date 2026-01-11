-- ============================================
-- Add primary_device column to profiles table
-- ============================================

-- Add the primary_device column
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS primary_device TEXT;

-- Add comment
COMMENT ON COLUMN public.profiles.primary_device IS 'Primary fitness device: apple_watch, fitbit, garmin, whoop, oura, iphone, other';

-- Add index for faster queries (optional)
CREATE INDEX IF NOT EXISTS idx_profiles_primary_device 
ON public.profiles(primary_device);
