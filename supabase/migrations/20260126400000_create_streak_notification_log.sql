-- ============================================================================
-- STREAK NOTIFICATION LOG TABLE
-- ============================================================================
-- Tracks sent streak notifications to prevent duplicate notifications
-- within the same day.

-- Create the streak_notification_log table
CREATE TABLE IF NOT EXISTS public.streak_notification_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL CHECK (notification_type IN (
        'first_warning',
        'second_warning',
        'final_warning',
        'milestone_approaching'
    )),
    sent_date DATE NOT NULL DEFAULT CURRENT_DATE,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,

    -- Constraints
    CONSTRAINT unique_notification_per_day UNIQUE (user_id, notification_type, sent_date)
);

-- Add comments
COMMENT ON TABLE public.streak_notification_log IS 'Tracks streak reminder notifications sent to users to prevent duplicates';
COMMENT ON COLUMN public.streak_notification_log.notification_type IS 'Type of notification: first_warning (6 PM), second_warning (8 PM), final_warning (9 PM), milestone_approaching';
COMMENT ON COLUMN public.streak_notification_log.sent_date IS 'Date the notification was sent (used for daily deduplication)';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index for checking if notification was already sent today
CREATE INDEX IF NOT EXISTS idx_streak_notification_log_user_type_date
ON public.streak_notification_log(user_id, notification_type, sent_date);

-- Index for cleanup queries (delete old records)
CREATE INDEX IF NOT EXISTS idx_streak_notification_log_sent_date
ON public.streak_notification_log(sent_date);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.streak_notification_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own notification history
CREATE POLICY "Users can view own notification log"
ON public.streak_notification_log
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Only service role can insert (Edge Functions)
CREATE POLICY "Service role can insert notifications"
ON public.streak_notification_log
FOR INSERT
TO service_role
WITH CHECK (true);

-- Only service role can delete (for cleanup)
CREATE POLICY "Service role can delete notifications"
ON public.streak_notification_log
FOR DELETE
TO service_role
USING (true);

-- ============================================================================
-- CLEANUP FUNCTION
-- ============================================================================

-- Function to clean up old notification logs (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_streak_notification_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.streak_notification_log
    WHERE sent_date < CURRENT_DATE - INTERVAL '30 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RAISE NOTICE 'Cleaned up % old streak notification log entries', deleted_count;
    RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_old_streak_notification_logs() IS 'Removes notification log entries older than 30 days';

-- ============================================================================
-- OPTIONAL: CRON JOB SETUP
-- ============================================================================
-- The send-streak-notifications Edge Function should be scheduled to run
-- every hour from 5 PM to 11 PM UTC (to cover all timezones).
--
-- Example cron schedule using pg_cron (if enabled):
--
-- SELECT cron.schedule(
--     'send-streak-notifications',
--     '0 17-23 * * *',  -- Every hour from 5 PM to 11 PM UTC
--     $$
--     SELECT net.http_post(
--         url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-streak-notifications',
--         headers := jsonb_build_object(
--             'Content-Type', 'application/json',
--             'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
--         ),
--         body := '{}'::jsonb
--     );
--     $$
-- );
--
-- Or use Supabase Dashboard > Database > Extensions > pg_cron
-- Or use an external scheduler like GitHub Actions, AWS EventBridge, etc.
