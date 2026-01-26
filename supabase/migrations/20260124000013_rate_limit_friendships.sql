-- =====================================================
-- Rate Limit friendships Writes
-- Prevent friend request spam/DoS attacks
-- =====================================================

-- 1. Add rate limiting trigger for friendship inserts
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_friendships_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_requests_per_hour INTEGER := 20;  -- Max 20 friend requests per hour
  v_max_pending INTEGER := 50;  -- Max 50 pending outbound requests at a time
  v_hourly_count INTEGER;
  v_pending_count INTEGER;
  v_last_request TIMESTAMPTZ;
  v_min_interval INTERVAL := INTERVAL '5 seconds';  -- Min 5 seconds between requests
BEGIN
  -- Check hourly rate limit
  SELECT COUNT(*), MAX(created_at)
  INTO v_hourly_count, v_last_request
  FROM public.friendships
  WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '1 hour';

  IF v_hourly_count >= v_max_requests_per_hour THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum % friend requests per hour', v_max_requests_per_hour
      USING ERRCODE = 'P0001';
  END IF;

  -- Check if sending requests too quickly
  IF v_last_request IS NOT NULL AND v_last_request > NOW() - v_min_interval THEN
    RAISE EXCEPTION 'Rate limit exceeded: Please wait before sending another friend request'
      USING ERRCODE = 'P0001';
  END IF;

  -- Check pending outbound requests limit
  SELECT COUNT(*)
  INTO v_pending_count
  FROM public.friendships
  WHERE user_id = NEW.user_id
    AND status = 'pending';

  IF v_pending_count >= v_max_pending THEN
    RAISE EXCEPTION 'Rate limit exceeded: You have too many pending friend requests. Please wait for responses or cancel some.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Create trigger
-- =====================================================
DROP TRIGGER IF EXISTS check_friendships_rate_limit_trigger ON public.friendships;
CREATE TRIGGER check_friendships_rate_limit_trigger
  BEFORE INSERT ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.check_friendships_rate_limit();
