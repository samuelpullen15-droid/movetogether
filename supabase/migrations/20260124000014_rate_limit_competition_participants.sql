-- =====================================================
-- Rate Limit competition_participants Writes
-- Prevent competition join spam/DoS attacks
-- =====================================================

-- 1. Add rate limiting trigger for participant inserts
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_competition_participants_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_joins_per_hour INTEGER := 10;  -- Max 10 competition joins per hour
  v_max_active_competitions INTEGER := 20;  -- Max 20 active competitions at a time
  v_hourly_count INTEGER;
  v_active_count INTEGER;
  v_last_join TIMESTAMPTZ;
  v_min_interval INTERVAL := INTERVAL '5 seconds';  -- Min 5 seconds between joins
BEGIN
  -- Check hourly rate limit
  SELECT COUNT(*), MAX(joined_at)
  INTO v_hourly_count, v_last_join
  FROM public.competition_participants
  WHERE user_id = NEW.user_id
    AND joined_at > NOW() - INTERVAL '1 hour';

  IF v_hourly_count >= v_max_joins_per_hour THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum % competition joins per hour', v_max_joins_per_hour
      USING ERRCODE = 'P0001';
  END IF;

  -- Check if joining too quickly
  IF v_last_join IS NOT NULL AND v_last_join > NOW() - v_min_interval THEN
    RAISE EXCEPTION 'Rate limit exceeded: Please wait before joining another competition'
      USING ERRCODE = 'P0001';
  END IF;

  -- Check active competitions limit
  SELECT COUNT(*)
  INTO v_active_count
  FROM public.competition_participants cp
  JOIN public.competitions c ON c.id = cp.competition_id
  WHERE cp.user_id = NEW.user_id
    AND c.status IN ('pending', 'active');

  IF v_active_count >= v_max_active_competitions THEN
    RAISE EXCEPTION 'Rate limit exceeded: You are in too many active competitions. Please complete or leave some first.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Create trigger
-- =====================================================
DROP TRIGGER IF EXISTS check_competition_participants_rate_limit_trigger ON public.competition_participants;
CREATE TRIGGER check_competition_participants_rate_limit_trigger
  BEFORE INSERT ON public.competition_participants
  FOR EACH ROW EXECUTE FUNCTION public.check_competition_participants_rate_limit();
