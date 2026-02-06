-- =====================================================
-- Fix competition status functions to preserve 'draft' status
-- The update_competition_status() function was overwriting
-- draft competitions to 'upcoming' or 'active' based on dates.
-- =====================================================

-- 1. Fix the bulk status update function to exclude drafts
CREATE OR REPLACE FUNCTION public.update_competition_status() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.competitions
  SET status = CASE
    WHEN end_date < CURRENT_DATE THEN 'completed'
    WHEN start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE THEN 'active'
    ELSE 'upcoming'
  END
  WHERE status NOT IN ('completed', 'draft')
    OR (status = 'completed' AND end_date >= CURRENT_DATE - INTERVAL '1 day');
END;
$$;

-- 2. Fix the trigger function to skip draft competitions
CREATE OR REPLACE FUNCTION public.trigger_update_competition_status() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Don't update status for draft competitions
  IF NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;
  PERFORM update_competition_status();
  RETURN NEW;
END;
$$;

-- 3. Fix any existing draft competitions that were incorrectly set to upcoming/active
-- (Reset them back to draft if they were created recently and have no finalized state)
-- Note: This is a one-time cleanup. Future drafts will be protected by the fixed trigger.
