-- Migration: Add timezone column to profiles for smart competition locking
-- This allows us to calculate the latest timezone among competition participants
-- and only wait until that timezone's midnight instead of assuming Hawaii (UTC-10)

-- Add timezone column to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT NULL;

-- Add index for efficient timezone queries
CREATE INDEX IF NOT EXISTS idx_profiles_timezone ON profiles(timezone) WHERE timezone IS NOT NULL;

-- Comment explaining the column
COMMENT ON COLUMN profiles.timezone IS
'User timezone in IANA format (e.g., "America/New_York", "America/Los_Angeles"). Used for competition score locking.';

-- Create a helper function to get UTC offset from IANA timezone name
-- Returns the offset in hours (negative for west of UTC)
CREATE OR REPLACE FUNCTION get_timezone_offset_hours(tz_name TEXT)
RETURNS INTEGER AS $$
DECLARE
  offset_interval INTERVAL;
BEGIN
  IF tz_name IS NULL THEN
    RETURN -10; -- Default to Hawaii (most conservative US timezone)
  END IF;

  -- Get the current UTC offset for this timezone
  SELECT (EXTRACT(TIMEZONE FROM (NOW() AT TIME ZONE tz_name)) / 3600)::INTEGER INTO offset_interval;

  RETURN offset_interval;
EXCEPTION
  WHEN OTHERS THEN
    RETURN -10; -- Default to Hawaii on error
END;
$$ LANGUAGE plpgsql STABLE;

-- Create function to get the latest (westernmost) timezone offset among competition participants
CREATE OR REPLACE FUNCTION get_competition_latest_timezone_offset(comp_id UUID)
RETURNS INTEGER AS $$
DECLARE
  min_offset INTEGER;
BEGIN
  -- Find the minimum (most negative/westernmost) timezone offset among participants
  SELECT MIN(get_timezone_offset_hours(p.timezone))
  INTO min_offset
  FROM competition_participants cp
  JOIN profiles p ON cp.user_id = p.id
  WHERE cp.competition_id = comp_id;

  -- Default to Hawaii (UTC-10) if no timezones found
  RETURN COALESCE(min_offset, -10);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_timezone_offset_hours(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_timezone_offset_hours(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_competition_latest_timezone_offset(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_competition_latest_timezone_offset(UUID) TO service_role;
