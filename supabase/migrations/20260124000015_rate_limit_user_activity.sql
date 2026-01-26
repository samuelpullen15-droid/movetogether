-- =====================================================
-- Rate Limit user_activity Writes
-- Prevent activity data spam/DoS attacks
-- =====================================================

-- 1. Add rate limiting trigger for activity inserts
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_user_activity_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_inserts_per_hour INTEGER := 100;  -- Max 100 activity records per hour
  v_max_per_day INTEGER := 500;  -- Max 500 activity records per day
  v_hourly_count INTEGER;
  v_daily_count INTEGER;
  v_last_insert TIMESTAMPTZ;
  v_min_interval INTERVAL := INTERVAL '1 second';  -- Min 1 second between inserts
BEGIN
  -- Check hourly rate limit
  SELECT COUNT(*), MAX(created_at)
  INTO v_hourly_count, v_last_insert
  FROM public.user_activity
  WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '1 hour';

  IF v_hourly_count >= v_max_inserts_per_hour THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum % activity records per hour', v_max_inserts_per_hour
      USING ERRCODE = 'P0001';
  END IF;

  -- Check if inserting too quickly
  IF v_last_insert IS NOT NULL AND v_last_insert > NOW() - v_min_interval THEN
    RAISE EXCEPTION 'Rate limit exceeded: Please wait before adding another activity record'
      USING ERRCODE = 'P0001';
  END IF;

  -- Check daily rate limit
  SELECT COUNT(*)
  INTO v_daily_count
  FROM public.user_activity
  WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '1 day';

  IF v_daily_count >= v_max_per_day THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum % activity records per day', v_max_per_day
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Add rate limiting trigger for activity updates
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_user_activity_update_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_interval INTERVAL := INTERVAL '1 second';  -- Min 1 second between updates
BEGIN
  -- Check if updating too quickly
  IF OLD.updated_at IS NOT NULL AND OLD.updated_at > NOW() - v_min_interval THEN
    RAISE EXCEPTION 'Rate limit exceeded: Please wait before updating activity data again'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Create triggers
-- =====================================================
DROP TRIGGER IF EXISTS check_user_activity_rate_limit_trigger ON public.user_activity;
CREATE TRIGGER check_user_activity_rate_limit_trigger
  BEFORE INSERT ON public.user_activity
  FOR EACH ROW EXECUTE FUNCTION public.check_user_activity_rate_limit();

DROP TRIGGER IF EXISTS check_user_activity_update_rate_limit_trigger ON public.user_activity;
CREATE TRIGGER check_user_activity_update_rate_limit_trigger
  BEFORE UPDATE ON public.user_activity
  FOR EACH ROW EXECUTE FUNCTION public.check_user_activity_update_rate_limit();
