-- =====================================================
-- Fix competition participant rate limit:
-- 1. Add service_role bypass (for edge functions)
-- 2. Exempt competition creators from rate limit when
--    joining their own competition
-- =====================================================

CREATE OR REPLACE FUNCTION public.check_competition_participants_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_joins_per_hour INTEGER := 10;
  v_max_active_competitions INTEGER := 20;
  v_hourly_count INTEGER;
  v_active_count INTEGER;
  v_last_join TIMESTAMPTZ;
  v_min_interval INTERVAL := INTERVAL '5 seconds';
  v_is_creator BOOLEAN;
BEGIN
  -- Bypass rate limit for service_role (used by edge functions)
  IF current_setting('role') = 'service_role' OR current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  -- Bypass rate limit if user is the creator of this competition
  SELECT EXISTS(
    SELECT 1 FROM public.competitions
    WHERE id = NEW.competition_id AND creator_id = NEW.user_id
  ) INTO v_is_creator;

  IF v_is_creator THEN
    RETURN NEW;
  END IF;

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
