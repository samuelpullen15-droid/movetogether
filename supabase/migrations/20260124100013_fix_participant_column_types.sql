-- =====================================================
-- Fix get_competition_participants_with_profiles column types
--
-- Error: "Returned type integer does not match expected type numeric in column 6"
--
-- Actual competition_participants columns types:
-- - total_points: numeric(10,2) ✓
-- - move_calories: INTEGER (not numeric!)
-- - exercise_minutes: INTEGER (not numeric!)
-- - stand_hours: INTEGER (not numeric!)
-- - step_count: INTEGER (not numeric!)
-- - move_progress: numeric(5,4) ✓
-- - exercise_progress: numeric(5,4) ✓
-- - stand_progress: numeric(5,4) ✓
-- =====================================================

DROP FUNCTION IF EXISTS public.get_competition_participants_with_profiles(uuid);

CREATE OR REPLACE FUNCTION public.get_competition_participants_with_profiles(p_competition_id uuid)
RETURNS TABLE (
  participant_id uuid,
  user_id uuid,
  joined_at timestamptz,
  last_sync_at timestamptz,
  total_points numeric,
  move_calories integer,
  exercise_minutes integer,
  stand_hours integer,
  step_count integer,
  move_progress numeric,
  exercise_progress numeric,
  stand_progress numeric,
  username text,
  full_name text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- User must be a participant or the competition must be public
  IF NOT EXISTS (
    SELECT 1 FROM competitions c
    WHERE c.id = p_competition_id
      AND (c.is_public = true OR c.creator_id = v_user_id
           OR EXISTS (SELECT 1 FROM competition_participants cp WHERE cp.competition_id = c.id AND cp.user_id = v_user_id))
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    cp.id as participant_id,
    cp.user_id,
    cp.joined_at,
    cp.last_sync_at,
    cp.total_points,
    cp.move_calories,
    cp.exercise_minutes,
    cp.stand_hours,
    cp.step_count,
    cp.move_progress,
    cp.exercise_progress,
    cp.stand_progress,
    p.username,
    p.full_name,
    p.avatar_url
  FROM competition_participants cp
  INNER JOIN profiles p ON p.id = cp.user_id
  WHERE cp.competition_id = p_competition_id
  ORDER BY cp.total_points DESC NULLS LAST;
END;
$$;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

REVOKE EXECUTE ON FUNCTION public.get_competition_participants_with_profiles(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_competition_participants_with_profiles(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_competition_participants_with_profiles(uuid) IS
'Returns competition participants with their profile info. Accessible by participants or if competition is public.
Columns: participant_id, user_id, joined_at, last_sync_at, total_points (numeric),
move_calories/exercise_minutes/stand_hours/step_count (integer),
move_progress/exercise_progress/stand_progress (numeric), username, full_name, avatar_url';
