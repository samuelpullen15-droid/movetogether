-- Track whether user has seen the Coach Spark intro modal
-- Users must acknowledge the AI disclaimer before using Coach Spark

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS coach_spark_intro_seen BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS coach_spark_intro_seen_at TIMESTAMPTZ DEFAULT NULL;

-- Comments
COMMENT ON COLUMN profiles.coach_spark_intro_seen IS 'Whether user has seen and acknowledged the Coach Spark intro modal';
COMMENT ON COLUMN profiles.coach_spark_intro_seen_at IS 'Timestamp when user acknowledged the Coach Spark intro';

-- Create index for quick lookup
CREATE INDEX IF NOT EXISTS idx_profiles_coach_spark_intro_not_seen
ON profiles (id)
WHERE coach_spark_intro_seen = FALSE;
