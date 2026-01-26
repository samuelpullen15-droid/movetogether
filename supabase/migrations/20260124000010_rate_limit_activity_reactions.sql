-- =====================================================
-- Rate Limit activity_reactions Writes
-- Prevent reaction spam/DoS attacks
-- =====================================================

-- 1. Add rate limiting trigger for activity_reactions
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_activity_reactions_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_reactions_per_hour INTEGER := 100;  -- Max 100 reactions per hour
  v_max_per_activity INTEGER := 5;  -- Max 5 reactions per activity (different emojis)
  v_hourly_count INTEGER;
  v_activity_count INTEGER;
  v_last_reaction TIMESTAMPTZ;
  v_min_interval INTERVAL := INTERVAL '1 second';  -- Min 1 second between reactions
BEGIN
  -- Check hourly rate limit
  SELECT COUNT(*), MAX(created_at)
  INTO v_hourly_count, v_last_reaction
  FROM public.activity_reactions
  WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '1 hour';

  IF v_hourly_count >= v_max_reactions_per_hour THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum % reactions per hour', v_max_reactions_per_hour
      USING ERRCODE = 'P0001';
  END IF;

  -- Check if reacting too quickly
  IF v_last_reaction IS NOT NULL AND v_last_reaction > NOW() - v_min_interval THEN
    RAISE EXCEPTION 'Rate limit exceeded: Please wait before adding another reaction'
      USING ERRCODE = 'P0001';
  END IF;

  -- Check reactions per activity limit
  SELECT COUNT(*)
  INTO v_activity_count
  FROM public.activity_reactions
  WHERE user_id = NEW.user_id
    AND activity_id = NEW.activity_id;

  IF v_activity_count >= v_max_per_activity THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum % reactions per activity', v_max_per_activity
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Create trigger (only if table exists)
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'activity_reactions') THEN
    DROP TRIGGER IF EXISTS check_activity_reactions_rate_limit_trigger ON public.activity_reactions;
    CREATE TRIGGER check_activity_reactions_rate_limit_trigger
      BEFORE INSERT ON public.activity_reactions
      FOR EACH ROW EXECUTE FUNCTION public.check_activity_reactions_rate_limit();
  END IF;
END $$;
