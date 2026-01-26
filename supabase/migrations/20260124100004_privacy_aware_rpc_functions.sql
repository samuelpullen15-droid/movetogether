-- =====================================================
-- Privacy-Aware RPC Functions
-- Strengthens authorization checks by respecting privacy settings
-- Addresses security audit finding: "p_user_id parameters need authorization"
-- =====================================================

-- =====================================================
-- 1. HELPER FUNCTION: can_view_user_data
-- Checks both profile visibility AND detailed stats permission
-- =====================================================

DROP FUNCTION IF EXISTS public.can_view_user_data(uuid, uuid);

CREATE OR REPLACE FUNCTION public.can_view_user_data(
  p_viewer_id uuid,
  p_target_id uuid
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_privacy RECORD;
  v_is_friend boolean;
BEGIN
  -- Same user can always view their own data
  IF p_viewer_id = p_target_id THEN
    RETURN true;
  END IF;

  -- Check friendship status
  SELECT EXISTS (
    SELECT 1 FROM friendships f
    WHERE f.status = 'accepted'
    AND ((f.user_id = p_viewer_id AND f.friend_id = p_target_id)
      OR (f.friend_id = p_viewer_id AND f.user_id = p_target_id))
  ) INTO v_is_friend;

  -- Get privacy settings
  SELECT * INTO v_privacy
  FROM privacy_settings
  WHERE user_id = p_target_id;

  -- No privacy settings = defaults apply (public profile, stats visible to friends)
  IF NOT FOUND THEN
    -- Default: friends can see data, non-friends cannot
    RETURN v_is_friend;
  END IF;

  -- Check profile visibility first
  CASE v_privacy.profile_visibility
    WHEN 'public' THEN
      -- Public profile + show_detailed_stats determines access
      RETURN v_privacy.show_detailed_stats OR v_is_friend;
    WHEN 'friends_only' THEN
      -- Friends only can see if they're friends AND stats are visible
      RETURN v_is_friend AND v_privacy.show_detailed_stats;
    WHEN 'private' THEN
      -- Private profile: only friends with show_detailed_stats enabled
      RETURN v_is_friend AND v_privacy.show_detailed_stats;
    ELSE
      RETURN v_is_friend;
  END CASE;
END;
$$;

-- =====================================================
-- 2. HELPER FUNCTION: can_view_user_activity
-- Specifically checks activity visibility settings
-- =====================================================

DROP FUNCTION IF EXISTS public.can_view_user_activity(uuid, uuid);

CREATE OR REPLACE FUNCTION public.can_view_user_activity(
  p_viewer_id uuid,
  p_target_id uuid
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_privacy RECORD;
  v_is_friend boolean;
BEGIN
  -- Same user can always view their own activity
  IF p_viewer_id = p_target_id THEN
    RETURN true;
  END IF;

  -- Check friendship status
  SELECT EXISTS (
    SELECT 1 FROM friendships f
    WHERE f.status = 'accepted'
    AND ((f.user_id = p_viewer_id AND f.friend_id = p_target_id)
      OR (f.friend_id = p_viewer_id AND f.user_id = p_target_id))
  ) INTO v_is_friend;

  -- Get privacy settings
  SELECT * INTO v_privacy
  FROM privacy_settings
  WHERE user_id = p_target_id;

  -- No privacy settings = defaults apply
  IF NOT FOUND THEN
    -- Default: friends can see activity
    RETURN v_is_friend;
  END IF;

  -- Must be friends AND activity visibility must be enabled
  RETURN v_is_friend AND v_privacy.show_activity_in_feed;
END;
$$;

-- =====================================================
-- 3. UPDATE get_user_fitness_goals
-- Now uses can_view_user_data for full privacy check
-- =====================================================

DROP FUNCTION IF EXISTS public.get_user_fitness_goals(uuid);

CREATE OR REPLACE FUNCTION public.get_user_fitness_goals(p_user_id uuid)
RETURNS TABLE (
  move_goal integer,
  exercise_goal integer,
  stand_goal integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Use privacy-aware check
  IF NOT can_view_user_data(v_user_id, p_user_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT uf.move_goal, uf.exercise_goal, uf.stand_goal
  FROM user_fitness uf
  WHERE uf.user_id = p_user_id;
END;
$$;

-- =====================================================
-- 4. UPDATE get_user_activity_for_date
-- Now uses can_view_user_activity for privacy check
-- =====================================================

DROP FUNCTION IF EXISTS public.get_user_activity_for_date(uuid, text);

CREATE OR REPLACE FUNCTION public.get_user_activity_for_date(p_user_id uuid, p_date text)
RETURNS TABLE (
  move_calories numeric,
  exercise_minutes numeric,
  stand_hours numeric,
  workouts_completed integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Use activity-specific privacy check
  IF NOT can_view_user_activity(v_user_id, p_user_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT ua.move_calories, ua.exercise_minutes, ua.stand_hours, ua.workouts_completed
  FROM user_activity ua
  WHERE ua.user_id = p_user_id
    AND ua.date = p_date::date;
END;
$$;

-- =====================================================
-- 5. UPDATE get_user_competition_daily_data_for_date
-- Now uses can_view_user_activity for privacy check
-- =====================================================

DROP FUNCTION IF EXISTS public.get_user_competition_daily_data_for_date(uuid, text);

CREATE OR REPLACE FUNCTION public.get_user_competition_daily_data_for_date(p_user_id uuid, p_date text)
RETURNS TABLE (
  move_calories numeric,
  exercise_minutes numeric,
  stand_hours numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Use activity-specific privacy check
  IF NOT can_view_user_activity(v_user_id, p_user_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cdd.move_calories, cdd.exercise_minutes, cdd.stand_hours
  FROM competition_daily_data cdd
  WHERE cdd.user_id = p_user_id
    AND cdd.date = p_date::date
  LIMIT 1;
END;
$$;

-- =====================================================
-- 6. UPDATE get_user_competition_stats
-- Now uses can_view_user_data for full privacy check
-- =====================================================

DROP FUNCTION IF EXISTS public.get_user_competition_stats(uuid);

CREATE OR REPLACE FUNCTION public.get_user_competition_stats(p_user_id uuid)
RETURNS TABLE (
  competitions_joined bigint,
  competitions_won bigint,
  total_points numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_joined bigint;
  v_won bigint;
  v_total_points numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Use privacy-aware check
  IF NOT can_view_user_data(v_user_id, p_user_id) THEN
    RETURN;
  END IF;

  -- Count competitions joined
  SELECT COUNT(*), COALESCE(SUM(cp.total_points), 0)
  INTO v_joined, v_total_points
  FROM competition_participants cp
  WHERE cp.user_id = p_user_id;

  -- Count competitions won (first place in completed competitions)
  SELECT COUNT(*) INTO v_won
  FROM competition_participants cp
  INNER JOIN competitions c ON c.id = cp.competition_id
  WHERE cp.user_id = p_user_id
    AND c.status = 'completed'
    AND cp.total_points = (
      SELECT MAX(cp2.total_points)
      FROM competition_participants cp2
      WHERE cp2.competition_id = cp.competition_id
    );

  RETURN QUERY SELECT v_joined, v_won, v_total_points;
END;
$$;

-- =====================================================
-- 7. UPDATE get_user_recent_activity
-- Now uses can_view_user_activity for privacy check
-- =====================================================

DROP FUNCTION IF EXISTS public.get_user_recent_activity(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_user_recent_activity(p_user_id uuid, p_days integer DEFAULT 365)
RETURNS TABLE (
  date date,
  move_calories numeric,
  exercise_minutes numeric,
  stand_hours numeric,
  workouts_completed integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_start_date date;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Use activity-specific privacy check
  IF NOT can_view_user_activity(v_user_id, p_user_id) THEN
    RETURN;
  END IF;

  v_start_date := CURRENT_DATE - (p_days || ' days')::interval;

  RETURN QUERY
  SELECT ua.date, ua.move_calories, ua.exercise_minutes, ua.stand_hours, ua.workouts_completed
  FROM user_activity ua
  WHERE ua.user_id = p_user_id
    AND ua.date >= v_start_date
  ORDER BY ua.date DESC;
END;
$$;

-- =====================================================
-- 8. UPDATE get_user_achievement_progress
-- Now uses can_view_user_data for full privacy check
-- =====================================================

DROP FUNCTION IF EXISTS public.get_user_achievement_progress(uuid);

CREATE OR REPLACE FUNCTION public.get_user_achievement_progress(p_user_id uuid)
RETURNS TABLE (
  achievement_id text,
  bronze_unlocked_at timestamptz,
  silver_unlocked_at timestamptz,
  gold_unlocked_at timestamptz,
  platinum_unlocked_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Use privacy-aware check
  IF NOT can_view_user_data(v_user_id, p_user_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT uap.achievement_id, uap.bronze_unlocked_at, uap.silver_unlocked_at,
         uap.gold_unlocked_at, uap.platinum_unlocked_at
  FROM user_achievement_progress uap
  WHERE uap.user_id = p_user_id;
END;
$$;

-- =====================================================
-- 9. UPDATE get_user_profile
-- Strengthened with proper privacy check
-- =====================================================

DROP FUNCTION IF EXISTS public.get_user_profile(uuid);

CREATE OR REPLACE FUNCTION public.get_user_profile(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  username text,
  bio text,
  pronouns text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if viewer can see this profile
  IF NOT can_view_profile(v_user_id, p_user_id) THEN
    -- Return minimal info (just username for blocked/private profiles)
    -- This allows showing "Profile not accessible" in UI
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.full_name, p.avatar_url, p.username,
    p.bio, p.pronouns, p.created_at
  FROM profiles p
  WHERE p.id = p_user_id;
END;
$$;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Helper functions (internal use, grant to authenticated)
REVOKE EXECUTE ON FUNCTION public.can_view_user_data(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_user_data(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_view_user_activity(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_user_activity(uuid, uuid) TO authenticated;

-- User data functions
REVOKE EXECUTE ON FUNCTION public.get_user_fitness_goals(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_fitness_goals(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_activity_for_date(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_activity_for_date(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_competition_daily_data_for_date(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_competition_daily_data_for_date(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_competition_stats(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_competition_stats(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_recent_activity(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_recent_activity(uuid, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_achievement_progress(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_achievement_progress(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_profile(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_profile(uuid) TO authenticated;

-- =====================================================
-- COMMENTS (Documentation)
-- =====================================================

COMMENT ON FUNCTION public.can_view_user_data IS
'Privacy-aware authorization check. Verifies the viewer can access the target user''s
detailed data by checking both profile_visibility AND show_detailed_stats settings.';

COMMENT ON FUNCTION public.can_view_user_activity IS
'Privacy-aware authorization check for activity data. Verifies the viewer can access
the target user''s activity by checking friendship AND show_activity_in_feed setting.';
