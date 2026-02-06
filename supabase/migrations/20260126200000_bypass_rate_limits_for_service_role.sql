-- =====================================================
-- Bypass rate limits for service_role
-- Service_role is used by edge functions which have their own rate limiting
-- =====================================================

-- Fix INSERT rate limit function to bypass for service_role
CREATE OR REPLACE FUNCTION public.check_user_fitness_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_inserts_per_hour INTEGER := 60;
  v_current_count INTEGER;
  v_window_start TIMESTAMPTZ;
  v_one_hour_ago TIMESTAMPTZ := NOW() - INTERVAL '1 hour';
BEGIN
  -- Bypass rate limit for service_role (used by edge functions)
  IF current_setting('role') = 'service_role' OR current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  -- Get or create rate limit record
  SELECT insert_count, window_start
  INTO v_current_count, v_window_start
  FROM public.user_fitness_rate_limits
  WHERE user_id = NEW.user_id;

  IF NOT FOUND THEN
    INSERT INTO public.user_fitness_rate_limits (user_id, insert_count, window_start, last_insert_at)
    VALUES (NEW.user_id, 1, NOW(), NOW());
    RETURN NEW;
  END IF;

  IF v_window_start < v_one_hour_ago THEN
    UPDATE public.user_fitness_rate_limits
    SET insert_count = 1, window_start = NOW(), last_insert_at = NOW()
    WHERE user_id = NEW.user_id;
    RETURN NEW;
  END IF;

  IF v_current_count >= v_max_inserts_per_hour THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum % fitness data updates per hour', v_max_inserts_per_hour
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.user_fitness_rate_limits
  SET insert_count = insert_count + 1, last_insert_at = NOW()
  WHERE user_id = NEW.user_id;

  RETURN NEW;
END;
$$;

-- Fix UPDATE rate limit function to bypass for service_role
CREATE OR REPLACE FUNCTION public.check_user_fitness_update_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_update TIMESTAMPTZ;
  v_min_update_interval INTERVAL := INTERVAL '100 milliseconds';
BEGIN
  -- Bypass rate limit for service_role (used by edge functions)
  IF current_setting('role') = 'service_role' OR current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  SELECT last_insert_at
  INTO v_last_update
  FROM public.user_fitness_rate_limits
  WHERE user_id = NEW.user_id;

  IF FOUND AND v_last_update IS NOT NULL AND v_last_update > NOW() - v_min_update_interval THEN
    RAISE EXCEPTION 'Rate limit exceeded: Please wait before updating fitness data again'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.user_fitness_rate_limits (user_id, insert_count, window_start, last_insert_at)
  VALUES (NEW.user_id, 0, NOW(), NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET last_insert_at = NOW();

  RETURN NEW;
END;
$$;
