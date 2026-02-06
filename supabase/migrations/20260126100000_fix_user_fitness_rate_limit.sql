-- =====================================================
-- Fix user_fitness rate limit - 1 second is too aggressive
-- Reduce to 100ms for updates to allow normal app operation
-- =====================================================

-- Replace the update rate limit function with a less aggressive interval
CREATE OR REPLACE FUNCTION public.check_user_fitness_update_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_update TIMESTAMPTZ;
  v_min_update_interval INTERVAL := INTERVAL '100 milliseconds';  -- Reduced from 1 second to 100ms
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

-- Also reset the rate limit for any users currently blocked
-- This clears the last_insert_at so they can make immediate updates
UPDATE public.user_fitness_rate_limits
SET last_insert_at = NOW() - INTERVAL '1 minute';
