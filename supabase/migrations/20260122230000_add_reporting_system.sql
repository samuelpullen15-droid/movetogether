-- Add reporting system tables and functions

-- Create reports table
CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    "reporter_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "reported_user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "category" text NOT NULL CHECK (category IN ('inappropriate_content', 'harassment', 'spam', 'fake_profile')),
    "description" text,
    "evidence_urls" text[] DEFAULT '{}',
    "status" text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
    "ai_analysis" jsonb,
    "moderator_notes" text,
    "reviewed_at" timestamptz,
    "reviewed_by" uuid REFERENCES auth.users(id),
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL
);

-- Create user_moderation table for tracking moderation status
CREATE TABLE IF NOT EXISTS "public"."user_moderation" (
    "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    "status" text NOT NULL DEFAULT 'good_standing' CHECK (status IN ('good_standing', 'warned', 'suspended', 'banned')),
    "warning_count" integer DEFAULT 0,
    "total_reports_received" integer DEFAULT 0,
    "suspension_ends_at" timestamptz,
    "ban_reason" text,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL
);

-- Create report_rate_limits table
CREATE TABLE IF NOT EXISTS "public"."report_rate_limits" (
    "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "report_count" integer DEFAULT 0,
    "window_start" timestamptz DEFAULT now() NOT NULL,
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_moderation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."report_rate_limits" ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reports (users can only see their own reports as reporter)
CREATE POLICY "Users can view their own submitted reports" ON "public"."reports"
    FOR SELECT USING (auth.uid() = reporter_id);

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role full access to reports" ON "public"."reports"
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- RLS for user_moderation (users can see their own moderation status)
CREATE POLICY "Users can view their own moderation status" ON "public"."user_moderation"
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to user_moderation" ON "public"."user_moderation"
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- RLS for report_rate_limits
CREATE POLICY "Service role full access to report_rate_limits" ON "public"."report_rate_limits"
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Function to check report rate limit
CREATE OR REPLACE FUNCTION check_report_rate_limit(checking_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    max_reports_per_day integer := 10;
    current_count integer := 0;
    window_start_time timestamptz;
    one_day_ago timestamptz := now() - interval '24 hours';
BEGIN
    -- Get or create rate limit record
    SELECT report_count, window_start INTO current_count, window_start_time
    FROM report_rate_limits
    WHERE user_id = checking_user_id;

    IF NOT FOUND THEN
        -- Create new record
        INSERT INTO report_rate_limits (user_id, report_count, window_start)
        VALUES (checking_user_id, 0, now());

        RETURN jsonb_build_object(
            'allowed', true,
            'remaining', max_reports_per_day,
            'reason', null
        );
    END IF;

    -- Reset counter if window has expired
    IF window_start_time < one_day_ago THEN
        UPDATE report_rate_limits
        SET report_count = 0, window_start = now()
        WHERE user_id = checking_user_id;

        RETURN jsonb_build_object(
            'allowed', true,
            'remaining', max_reports_per_day,
            'reason', null
        );
    END IF;

    -- Check if user has exceeded limit
    IF current_count >= max_reports_per_day THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'remaining', 0,
            'reason', 'You have reached your daily report limit. Please try again tomorrow.'
        );
    END IF;

    RETURN jsonb_build_object(
        'allowed', true,
        'remaining', max_reports_per_day - current_count,
        'reason', null
    );
END;
$$;

-- Function to increment report count
CREATE OR REPLACE FUNCTION increment_report_count(reporting_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO report_rate_limits (user_id, report_count, window_start)
    VALUES (reporting_user_id, 1, now())
    ON CONFLICT (user_id) DO UPDATE
    SET report_count = report_rate_limits.report_count + 1;
END;
$$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported_user_id ON reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);
CREATE INDEX IF NOT EXISTS idx_user_moderation_user_id ON user_moderation(user_id);
CREATE INDEX IF NOT EXISTS idx_user_moderation_status ON user_moderation(status);

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION check_report_rate_limit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION check_report_rate_limit(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION increment_report_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_report_count(uuid) TO service_role;
