-- ============================================================================
-- DORMANT USER RE-ENGAGEMENT NOTIFICATION SYSTEM
-- ============================================================================
-- Sends escalating push notifications to users who haven't opened the app
-- in 3+ days. Four tiers: day_3, day_7, day_14, day_30.
-- Stops after 60 days of inactivity (user considered churned).
-- Deduplicates per dormancy "session" using last_seen_at snapshot.

-- ============================================================================
-- STEP 1: Create dormant_notification_log table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.dormant_notification_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    dormancy_tier TEXT NOT NULL CHECK (dormancy_tier IN (
        'day_3',
        'day_7',
        'day_14',
        'day_30'
    )),
    dormancy_days INTEGER NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    last_seen_at TIMESTAMPTZ NOT NULL,

    -- Each tier fires once per dormancy session (identified by last_seen_at)
    CONSTRAINT unique_dormant_notification_per_session
        UNIQUE (user_id, dormancy_tier, last_seen_at)
);

COMMENT ON TABLE public.dormant_notification_log
    IS 'Tracks dormant user re-engagement notifications to prevent duplicate sends';
COMMENT ON COLUMN public.dormant_notification_log.dormancy_tier
    IS 'Inactivity milestone: day_3, day_7, day_14, day_30';
COMMENT ON COLUMN public.dormant_notification_log.dormancy_days
    IS 'Actual number of days since last_seen_at when notification was sent';
COMMENT ON COLUMN public.dormant_notification_log.last_seen_at
    IS 'Snapshot of profiles.last_seen_at — used to detect session reset on re-engagement';

-- ============================================================================
-- STEP 2: Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_dormant_notification_log_user_tier
ON public.dormant_notification_log(user_id, dormancy_tier);

CREATE INDEX IF NOT EXISTS idx_dormant_notification_log_sent_at
ON public.dormant_notification_log(sent_at);

-- ============================================================================
-- STEP 3: Row Level Security
-- ============================================================================

ALTER TABLE public.dormant_notification_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own notification history
CREATE POLICY "Users can view own dormant notification log"
ON public.dormant_notification_log
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Service role can insert (Edge Function sends)
CREATE POLICY "Service role can insert dormant notifications"
ON public.dormant_notification_log
FOR INSERT
TO service_role
WITH CHECK (true);

-- Service role can delete (cleanup job)
CREATE POLICY "Service role can delete dormant notifications"
ON public.dormant_notification_log
FOR DELETE
TO service_role
USING (true);

-- ============================================================================
-- STEP 4: Cleanup function
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_dormant_notification_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.dormant_notification_log
    WHERE sent_at < NOW() - INTERVAL '90 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Cleaned up % old dormant notification log entries', deleted_count;
    RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_old_dormant_notification_logs()
    IS 'Removes dormant notification log entries older than 90 days';

-- ============================================================================
-- STEP 5: Schedule pg_cron jobs
-- ============================================================================

-- Run twice daily: 10 AM and 6 PM UTC to cover global timezones.
-- The Edge Function itself checks each user's local time (9 AM–8 PM window).
SELECT cron.schedule(
    'send-dormant-notifications',
    '0 10,18 * * *',
    $$
    SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/send-dormant-notifications',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);

-- Weekly cleanup: Sunday 4 AM UTC (after streak log cleanup at 3 AM)
SELECT cron.schedule(
    'cleanup-dormant-notification-logs',
    '0 4 * * 0',
    $$ SELECT cleanup_old_dormant_notification_logs(); $$
);
