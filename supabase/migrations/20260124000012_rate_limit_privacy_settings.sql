-- =====================================================
-- Rate Limit privacy_settings Updates
-- Table already has user_id as PRIMARY KEY preventing insert spam
-- Only need to prevent rapid-fire update spam
-- =====================================================

-- 1. Add rate limiting trigger for updates
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_privacy_settings_update_rate_limit()
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
    RAISE EXCEPTION 'Rate limit exceeded: Please wait before updating privacy settings again'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Create trigger (only if table exists)
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'privacy_settings') THEN
    DROP TRIGGER IF EXISTS check_privacy_settings_update_rate_limit_trigger ON public.privacy_settings;
    CREATE TRIGGER check_privacy_settings_update_rate_limit_trigger
      BEFORE UPDATE ON public.privacy_settings
      FOR EACH ROW EXECUTE FUNCTION public.check_privacy_settings_update_rate_limit();
  END IF;
END $$;
