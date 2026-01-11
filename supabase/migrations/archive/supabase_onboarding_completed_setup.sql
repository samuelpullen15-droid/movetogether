-- Add onboarding_completed field to profiles table
-- This field tracks when a user has completed onboarding
-- If true, the user should be taken directly to the home screen on sign-in

-- Add the column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'onboarding_completed'
  ) THEN
    ALTER TABLE profiles ADD COLUMN onboarding_completed BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed 
ON profiles(onboarding_completed) 
WHERE onboarding_completed = true;

-- Add comment to column
COMMENT ON COLUMN profiles.onboarding_completed IS 'Whether the user has completed onboarding. If true, they should be taken directly to the home screen on sign-in.';
