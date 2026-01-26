-- =====================================================
-- Rate Limit user_fitness Writes
-- Prevent spam/DoS attacks via unlimited inserts
-- =====================================================

-- 1. Create rate limit tracking for user_fitness
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_fitness_rate_limits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  insert_count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_insert_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.user_fitness_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_fitness_rate_limits FORCE ROW LEVEL SECURITY;

-- Only service_role can access (managed by triggers)
CREATE POLICY "Service role manages fitness rate limits"
ON public.user_fitness_rate_limits FOR ALL TO service_role
USING (true) WITH CHECK (true);

REVOKE ALL ON public.user_fitness_rate_limits FROM authenticated;
REVOKE ALL ON public.user_fitness_rate_limits FROM anon;
GRANT ALL ON public.user_fitness_rate_limits TO service_role;

-- 2. Create rate limit check function
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_user_fitness_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_inserts_per_hour INTEGER := 60;  -- Max 60 inserts per hour (1 per minute average)
  v_max_inserts_per_day INTEGER := 500;  -- Max 500 inserts per day
  v_current_count INTEGER;
  v_window_start TIMESTAMPTZ;
  v_one_hour_ago TIMESTAMPTZ := NOW() - INTERVAL '1 hour';
  v_one_day_ago TIMESTAMPTZ := NOW() - INTERVAL '24 hours';
BEGIN
  -- Get or create rate limit record
  SELECT insert_count, window_start
  INTO v_current_count, v_window_start
  FROM public.user_fitness_rate_limits
  WHERE user_id = NEW.user_id;

  IF NOT FOUND THEN
    -- First insert - create rate limit record
    INSERT INTO public.user_fitness_rate_limits (user_id, insert_count, window_start, last_insert_at)
    VALUES (NEW.user_id, 1, NOW(), NOW());
    RETURN NEW;
  END IF;

  -- Reset counter if window has expired (1 hour)
  IF v_window_start < v_one_hour_ago THEN
    UPDATE public.user_fitness_rate_limits
    SET insert_count = 1, window_start = NOW(), last_insert_at = NOW()
    WHERE user_id = NEW.user_id;
    RETURN NEW;
  END IF;

  -- Check hourly rate limit
  IF v_current_count >= v_max_inserts_per_hour THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum % fitness data updates per hour', v_max_inserts_per_hour
      USING ERRCODE = 'P0001';
  END IF;

  -- Increment counter
  UPDATE public.user_fitness_rate_limits
  SET insert_count = insert_count + 1, last_insert_at = NOW()
  WHERE user_id = NEW.user_id;

  RETURN NEW;
END;
$$;

-- 3. Create trigger on user_fitness for rate limiting
-- =====================================================
DROP TRIGGER IF EXISTS check_user_fitness_rate_limit_trigger ON public.user_fitness;
CREATE TRIGGER check_user_fitness_rate_limit_trigger
  BEFORE INSERT ON public.user_fitness
  FOR EACH ROW EXECUTE FUNCTION public.check_user_fitness_rate_limit();

-- 4. Also rate limit updates (prevent rapid updates)
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_user_fitness_update_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_update TIMESTAMPTZ;
  v_min_update_interval INTERVAL := INTERVAL '1 second';  -- Min 1 second between updates
BEGIN
  -- Get last insert/update time
  SELECT last_insert_at
  INTO v_last_update
  FROM public.user_fitness_rate_limits
  WHERE user_id = NEW.user_id;

  -- If record exists and last update was too recent, block
  IF FOUND AND v_last_update IS NOT NULL AND v_last_update > NOW() - v_min_update_interval THEN
    RAISE EXCEPTION 'Rate limit exceeded: Please wait before updating fitness data again'
      USING ERRCODE = 'P0001';
  END IF;

  -- Update last insert time
  INSERT INTO public.user_fitness_rate_limits (user_id, insert_count, window_start, last_insert_at)
  VALUES (NEW.user_id, 0, NOW(), NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET last_insert_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_user_fitness_update_rate_limit_trigger ON public.user_fitness;
CREATE TRIGGER check_user_fitness_update_rate_limit_trigger
  BEFORE UPDATE ON public.user_fitness
  FOR EACH ROW EXECUTE FUNCTION public.check_user_fitness_update_rate_limit();

-- 5. Cleanup function for old rate limit records
-- =====================================================
CREATE OR REPLACE FUNCTION public.cleanup_fitness_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete records older than 7 days with no activity
  DELETE FROM public.user_fitness_rate_limits
  WHERE last_insert_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_fitness_rate_limits() TO service_role;
