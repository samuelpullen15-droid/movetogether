-- =====================================================
-- Rate Limit notification_preferences Updates
-- Table already has UNIQUE(user_id) preventing insert spam
-- Only need to prevent rapid-fire update spam
-- =====================================================

-- 1. Add rate limiting trigger for updates
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_notification_preferences_update_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_interval INTERVAL := INTERVAL '5 seconds';  -- Min 5 seconds between updates
BEGIN
  -- Check if updating too quickly
  IF OLD.updated_at IS NOT NULL AND OLD.updated_at > NOW() - v_min_interval THEN
    RAISE EXCEPTION 'Rate limit exceeded: Please wait before updating preferences again'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Create trigger (only if table exists)
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notification_preferences') THEN
    DROP TRIGGER IF EXISTS check_notification_preferences_update_rate_limit_trigger ON public.notification_preferences;
    CREATE TRIGGER check_notification_preferences_update_rate_limit_trigger
      BEFORE UPDATE ON public.notification_preferences
      FOR EACH ROW EXECUTE FUNCTION public.check_notification_preferences_update_rate_limit();
  END IF;
END $$;
