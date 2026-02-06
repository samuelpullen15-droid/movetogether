-- ============================================================================
-- ENABLE pg_cron AND SCHEDULE AUTOMATED JOBS
-- ============================================================================
-- Enables the pg_cron extension for scheduling recurring database tasks.
-- Schedules three jobs:
--   1. update-competition-statuses (every 15 min)
--   2. send-streak-notifications (hourly, 5-11PM UTC)
--   3. cleanup-streak-notification-logs (weekly, Sunday 3AM UTC)
--
-- PREREQUISITES:
--   - pg_net extension must be enabled (already done in earlier migration)
--   - Database app settings must be configured:
--       ALTER DATABASE postgres SET app.settings.supabase_url = 'https://<project-ref>.supabase.co';
--       ALTER DATABASE postgres SET app.settings.service_role_key = '<service-role-key>';
--     Set these via Supabase Dashboard → Settings → Database → App Config
--     BEFORE applying this migration.

-- ============================================================================
-- STEP 1: Enable pg_cron extension
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant permissions to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- ============================================================================
-- STEP 2: Schedule update-competition-statuses (every 15 minutes)
-- ============================================================================
-- Transitions competitions through their lifecycle:
--   upcoming → active (when start_date is reached)
--   active → completed (when end_date + timezone buffer passes)
-- Also force-locks scores for inactive participants.

SELECT cron.schedule(
    'update-competition-statuses',
    '*/15 * * * *',
    $$
    SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/update-competition-statuses',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);

-- ============================================================================
-- STEP 3: Schedule send-streak-notifications (hourly, 5PM–11PM UTC)
-- ============================================================================
-- Sends escalating push notifications to users whose daily streaks are at risk.
-- Three urgency levels based on user's local time:
--   first_warning  (5-7 PM local)
--   second_warning (7-9 PM local)
--   final_warning  (9-11 PM local)
-- Running hourly from 5-11PM UTC covers all major timezones.

SELECT cron.schedule(
    'send-streak-notifications',
    '0 17-23 * * *',
    $$
    SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/send-streak-notifications',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);

-- ============================================================================
-- STEP 4: Schedule notification log cleanup (weekly, Sunday 3AM UTC)
-- ============================================================================
-- Uses the existing cleanup_old_streak_notification_logs() function
-- to remove entries older than 30 days from streak_notification_log.

SELECT cron.schedule(
    'cleanup-streak-notification-logs',
    '0 3 * * 0',
    $$ SELECT cleanup_old_streak_notification_logs(); $$
);
