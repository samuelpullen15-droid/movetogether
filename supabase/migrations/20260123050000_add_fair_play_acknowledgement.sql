-- Add fair play acknowledgement tracking to profiles table
-- Users must acknowledge fair play rules before joining their first competition

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS fair_play_acknowledged BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS fair_play_acknowledged_at TIMESTAMPTZ DEFAULT NULL;

-- Add comments explaining the columns
COMMENT ON COLUMN profiles.fair_play_acknowledged IS 'Whether user has acknowledged fair play rules for competitions';
COMMENT ON COLUMN profiles.fair_play_acknowledged_at IS 'Timestamp when user acknowledged fair play rules';

-- Create index for quick lookup of users who haven't acknowledged
CREATE INDEX IF NOT EXISTS idx_profiles_fair_play_not_acknowledged
ON profiles (id)
WHERE fair_play_acknowledged = FALSE;
