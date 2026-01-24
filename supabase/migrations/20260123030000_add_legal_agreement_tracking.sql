-- Add legal agreement tracking columns to profiles table
-- This tracks when users accept Terms of Service, Privacy Policy, and Community Guidelines

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS guidelines_accepted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS legal_agreement_version TEXT DEFAULT NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN profiles.terms_accepted_at IS 'Timestamp when user accepted Terms of Service';
COMMENT ON COLUMN profiles.privacy_accepted_at IS 'Timestamp when user accepted Privacy Policy';
COMMENT ON COLUMN profiles.guidelines_accepted_at IS 'Timestamp when user accepted Community Guidelines';
COMMENT ON COLUMN profiles.legal_agreement_version IS 'Version string of the legal agreements accepted (e.g., "2026.01.23")';

-- Create index for querying users who haven't accepted terms
CREATE INDEX IF NOT EXISTS idx_profiles_terms_not_accepted
ON profiles (id)
WHERE terms_accepted_at IS NULL;
