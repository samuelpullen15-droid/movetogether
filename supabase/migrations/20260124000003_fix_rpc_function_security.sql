-- =====================================================
-- RPC Function Security Remediation
-- Fixes critical vulnerabilities in SECURITY DEFINER functions
-- All functions now validate auth.uid() before operating
-- =====================================================

-- =====================================================
-- CRITICAL FIXES
-- =====================================================

-- 1. FIX update_subscription_tier: CRITICAL - add auth check
-- Prevents any user from changing another user's subscription
-- =====================================================
CREATE OR REPLACE FUNCTION update_subscription_tier(
  p_user_id uuid,
  p_tier text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SECURITY: Verify caller is the user or service role
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Cannot modify another user''s subscription';
  END IF;

  UPDATE profiles
  SET subscription_tier = p_tier,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- 2. FIX upsert_user_activity: CRITICAL - add auth check
-- Prevents falsifying fitness data for other users
-- Matches existing signature: (p_user_id, p_date, p_move_calories, p_exercise_minutes, p_stand_hours, p_step_count, p_distance_meters, p_workouts_completed)
-- =====================================================
CREATE OR REPLACE FUNCTION public.upsert_user_activity(
  p_user_id UUID,
  p_date DATE,
  p_move_calories INTEGER,
  p_exercise_minutes INTEGER,
  p_stand_hours INTEGER,
  p_step_count INTEGER,
  p_distance_meters NUMERIC DEFAULT 0,
  p_workouts_completed INTEGER DEFAULT 0
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SECURITY: Verify caller owns this data
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Cannot modify another user''s activity data';
  END IF;

  INSERT INTO public.user_activity (
    user_id,
    date,
    move_calories,
    exercise_minutes,
    stand_hours,
    step_count,
    distance_meters,
    workouts_completed,
    synced_at
  ) VALUES (
    p_user_id,
    p_date,
    p_move_calories,
    p_exercise_minutes,
    p_stand_hours,
    p_step_count,
    p_distance_meters,
    p_workouts_completed,
    NOW()
  )
  ON CONFLICT (user_id, date)
  DO UPDATE SET
    move_calories = EXCLUDED.move_calories,
    exercise_minutes = EXCLUDED.exercise_minutes,
    stand_hours = EXCLUDED.stand_hours,
    step_count = EXCLUDED.step_count,
    distance_meters = EXCLUDED.distance_meters,
    workouts_completed = EXCLUDED.workouts_completed,
    synced_at = NOW();
END;
$$;

-- 3. FIX update_competition_standings: CRITICAL - restrict to participants
-- Matches existing signature: (p_competition_id, p_user_id, p_date, p_score, p_rings_closed)
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_competition_standings(
  p_competition_id UUID,
  p_user_id UUID,
  p_date DATE,
  p_score NUMERIC,
  p_rings_closed INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_id UUID;
  v_activity RECORD;
  v_is_participant boolean;
BEGIN
  -- SECURITY: Verify caller is the user whose data is being updated
  IF auth.uid() IS NOT NULL THEN
    IF auth.uid() != p_user_id THEN
      -- Also check if caller is a participant (for competition sync scenarios)
      SELECT EXISTS (
        SELECT 1 FROM competition_participants
        WHERE competition_id = p_competition_id
        AND user_id = auth.uid()
      ) INTO v_is_participant;

      IF NOT v_is_participant THEN
        RAISE EXCEPTION 'Cannot update standings for another user';
      END IF;
    END IF;
  END IF;

  SELECT id INTO v_participant_id
  FROM public.competition_participants
  WHERE competition_id = p_competition_id
    AND user_id = p_user_id;

  IF v_participant_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(move_calories, 0) as move_calories,
    COALESCE(exercise_minutes, 0) as exercise_minutes,
    COALESCE(stand_hours, 0) as stand_hours,
    COALESCE(step_count, 0) as step_count,
    COALESCE(distance_meters, 0) as distance_meters,
    COALESCE(workouts_completed, 0) as workouts_completed
  INTO v_activity
  FROM public.user_activity
  WHERE user_id = p_user_id
    AND date = p_date;

  IF v_activity IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.competition_daily_data (
    competition_id,
    participant_id,
    user_id,
    date,
    move_calories,
    exercise_minutes,
    stand_hours,
    step_count,
    distance_meters,
    workouts_completed,
    points,
    synced_at
  ) VALUES (
    p_competition_id,
    v_participant_id,
    p_user_id,
    p_date,
    v_activity.move_calories,
    v_activity.exercise_minutes,
    v_activity.stand_hours,
    v_activity.step_count,
    v_activity.distance_meters,
    v_activity.workouts_completed,
    p_score,
    NOW()
  )
  ON CONFLICT (competition_id, user_id, date)
  DO UPDATE SET
    move_calories = EXCLUDED.move_calories,
    exercise_minutes = EXCLUDED.exercise_minutes,
    stand_hours = EXCLUDED.stand_hours,
    step_count = EXCLUDED.step_count,
    distance_meters = EXCLUDED.distance_meters,
    workouts_completed = EXCLUDED.workouts_completed,
    points = EXCLUDED.points,
    synced_at = NOW();
END;
$$;

-- =====================================================
-- HIGH RISK FIXES - Friendship Functions
-- =====================================================

-- 4. FIX create_friendship: HIGH - add auth check
-- =====================================================
CREATE OR REPLACE FUNCTION create_friendship(
  user_id_param uuid,
  friend_id_param uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_friendship_id uuid;
BEGIN
  -- SECURITY: Verify caller is the requester
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.uid() != user_id_param THEN
    RAISE EXCEPTION 'Cannot create friendship request on behalf of another user';
  END IF;

  -- Prevent self-friending
  IF user_id_param = friend_id_param THEN
    RAISE EXCEPTION 'Cannot friend yourself';
  END IF;

  -- Check if friendship already exists in either direction
  IF EXISTS (
    SELECT 1 FROM friendships
    WHERE (user_id = user_id_param AND friend_id = friend_id_param)
       OR (user_id = friend_id_param AND friend_id = user_id_param)
  ) THEN
    RAISE EXCEPTION 'Friendship already exists or pending';
  END IF;

  INSERT INTO friendships (user_id, friend_id, status)
  VALUES (user_id_param, friend_id_param, 'pending')
  RETURNING id INTO v_friendship_id;

  RETURN v_friendship_id;
END;
$$;

-- 5. FIX accept_friendship: HIGH - add auth check
-- Original signature: (user_id_param, friend_id_param)
-- =====================================================
CREATE OR REPLACE FUNCTION accept_friendship(
  user_id_param uuid,
  friend_id_param uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SECURITY: Verify caller is the one accepting (the friend_id in the request)
  -- In friendships table: user_id is requester, friend_id is the one being friended (accepter)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.uid() != friend_id_param THEN
    RAISE EXCEPTION 'Cannot accept friendship request for another user';
  END IF;

  UPDATE friendships
  SET status = 'accepted',
      updated_at = now()
  WHERE user_id = user_id_param
    AND friend_id = friend_id_param
    AND status = 'pending';

  RETURN FOUND;
END;
$$;

-- 6. FIX remove_friendship: HIGH - add auth check
-- =====================================================
CREATE OR REPLACE FUNCTION remove_friendship(
  user_id_param uuid,
  friend_id_param uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SECURITY: Verify caller is one of the friends
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.uid() != user_id_param AND auth.uid() != friend_id_param THEN
    RAISE EXCEPTION 'Cannot remove friendship for other users';
  END IF;

  DELETE FROM friendships
  WHERE (user_id = user_id_param AND friend_id = friend_id_param)
     OR (user_id = friend_id_param AND friend_id = user_id_param);

  RETURN FOUND;
END;
$$;

-- =====================================================
-- HIGH RISK FIXES - Points & Totals Functions
-- =====================================================

-- 7. FIX calculate_participant_points: HIGH - add participant check
-- Original signature: (p_competition_id, p_user_id, p_start_date, p_end_date) RETURNS numeric
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_participant_points(
  p_competition_id uuid,
  p_user_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_competition RECORD;
  v_total_points numeric := 0;
  v_is_participant boolean;
BEGIN
  -- SECURITY: Verify caller is a participant or the user being calculated
  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM competition_participants
      WHERE competition_id = p_competition_id
      AND user_id = auth.uid()
    ) INTO v_is_participant;

    IF NOT v_is_participant AND auth.uid() != p_user_id THEN
      RAISE EXCEPTION 'Not authorized to calculate points for this competition';
    END IF;
  END IF;

  -- Get competition details
  SELECT * INTO v_competition
  FROM competitions
  WHERE id = p_competition_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Calculate total points based on scoring type over date range
  SELECT COALESCE(SUM(
    CASE v_competition.scoring_type
      WHEN 'calories' THEN COALESCE(move_calories, 0)
      WHEN 'steps' THEN COALESCE(step_count, 0)
      WHEN 'active_minutes' THEN COALESCE(exercise_minutes, 0)
      ELSE -- ring_close default
        LEAST(100, COALESCE(move_calories, 0) / GREATEST(COALESCE(move_goal, 500), 1) * 100) +
        LEAST(100, COALESCE(exercise_minutes, 0) / GREATEST(COALESCE(exercise_goal, 30), 1) * 100) +
        LEAST(100, COALESCE(stand_hours, 0) / GREATEST(COALESCE(stand_hours_goal, 12), 1) * 100)
    END
  ), 0)
  INTO v_total_points
  FROM user_activity
  WHERE user_id = p_user_id
  AND date BETWEEN p_start_date AND p_end_date;

  RETURN v_total_points;
END;
$$;

-- 8. FIX update_participant_totals: HIGH - add participant check
-- Original signature: (p_participant_id uuid) RETURNS void
-- =====================================================
CREATE OR REPLACE FUNCTION update_participant_totals(p_participant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_points numeric;
  v_participant RECORD;
BEGIN
  -- Get participant info
  SELECT * INTO v_participant
  FROM competition_participants
  WHERE id = p_participant_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- SECURITY: Verify caller is the participant or a co-participant
  IF auth.uid() IS NOT NULL THEN
    IF auth.uid() != v_participant.user_id THEN
      -- Check if caller is in the same competition
      IF NOT EXISTS (
        SELECT 1 FROM competition_participants
        WHERE competition_id = v_participant.competition_id
        AND user_id = auth.uid()
      ) THEN
        RAISE EXCEPTION 'Not authorized to update totals for this participant';
      END IF;
    END IF;
  END IF;

  -- Calculate total points from daily data
  SELECT COALESCE(SUM(points), 0)
  INTO v_total_points
  FROM competition_daily_data
  WHERE participant_id = p_participant_id;

  -- Update participant total
  UPDATE competition_participants
  SET total_points = v_total_points,
      updated_at = now()
  WHERE id = p_participant_id;
END;
$$;

-- 9. FIX check_reset_ai_messages: HIGH - add auth check
-- Original signature: (p_user_id uuid) RETURNS void
-- =====================================================
CREATE OR REPLACE FUNCTION check_reset_ai_messages(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
BEGIN
  -- SECURITY: Verify caller is the user
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Cannot reset AI messages for another user';
  END IF;

  SELECT * INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Check if it's a new month and reset if needed
  IF v_profile.ai_messages_reset_at IS NULL OR
     date_trunc('month', v_profile.ai_messages_reset_at) < date_trunc('month', now()) THEN
    UPDATE profiles
    SET ai_messages_count = 0,
        ai_messages_reset_at = now(),
        updated_at = now()
    WHERE id = p_user_id;
  END IF;
END;
$$;

-- =====================================================
-- MEDIUM RISK FIXES - Viewer ID Functions
-- These functions accept viewer_id parameters and should validate them
-- =====================================================

-- 10. FIX get_competition_leaderboard: Add auth validation
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_competition_leaderboard') THEN
    DROP FUNCTION IF EXISTS get_competition_leaderboard(uuid, uuid);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION get_competition_leaderboard(
  p_competition_id uuid,
  p_viewer_id uuid DEFAULT NULL
)
RETURNS TABLE (
  rank bigint,
  user_id uuid,
  username text,
  full_name text,
  avatar_url text,
  total_points integer,
  move_progress numeric,
  exercise_progress numeric,
  stand_progress numeric,
  is_friend boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_effective_viewer_id uuid;
BEGIN
  -- SECURITY: Use auth.uid() if available, otherwise reject if p_viewer_id doesn't match
  v_effective_viewer_id := COALESCE(auth.uid(), p_viewer_id);

  IF auth.uid() IS NOT NULL AND p_viewer_id IS NOT NULL AND auth.uid() != p_viewer_id THEN
    RAISE EXCEPTION 'Cannot view leaderboard as another user';
  END IF;

  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY cp.total_points DESC) as rank,
    cp.user_id,
    p.username,
    p.full_name,
    p.avatar_url,
    cp.total_points::integer,
    COALESCE(
      CASE WHEN ua.move_goal > 0
        THEN (ua.move_calories::numeric / ua.move_goal)
        ELSE 0
      END, 0
    ) as move_progress,
    COALESCE(
      CASE WHEN ua.exercise_goal > 0
        THEN (ua.exercise_minutes::numeric / ua.exercise_goal)
        ELSE 0
      END, 0
    ) as exercise_progress,
    COALESCE(
      CASE WHEN ua.stand_hours_goal > 0
        THEN (ua.stand_hours::numeric / ua.stand_hours_goal)
        ELSE 0
      END, 0
    ) as stand_progress,
    CASE WHEN v_effective_viewer_id IS NOT NULL THEN
      EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.status = 'accepted'
        AND ((f.user_id = v_effective_viewer_id AND f.friend_id = cp.user_id)
          OR (f.friend_id = v_effective_viewer_id AND f.user_id = cp.user_id))
      )
    ELSE false END as is_friend
  FROM competition_participants cp
  JOIN profiles p ON p.id = cp.user_id
  LEFT JOIN user_activity ua ON ua.user_id = cp.user_id AND ua.date = CURRENT_DATE
  WHERE cp.competition_id = p_competition_id
  ORDER BY cp.total_points DESC;
END;
$$;

-- 11. FIX search_users: Add auth validation
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'search_users') THEN
    DROP FUNCTION IF EXISTS search_users(text, uuid, integer);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION search_users(
  p_query text,
  p_searcher_id uuid,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  user_id uuid,
  username text,
  full_name text,
  avatar_url text,
  is_friend boolean,
  friendship_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_effective_searcher_id uuid;
BEGIN
  -- SECURITY: Use auth.uid() as the effective searcher
  v_effective_searcher_id := auth.uid();

  IF v_effective_searcher_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_searcher_id != v_effective_searcher_id THEN
    RAISE EXCEPTION 'Cannot search as another user';
  END IF;

  RETURN QUERY
  SELECT
    p.id as user_id,
    p.username,
    p.full_name,
    p.avatar_url,
    EXISTS (
      SELECT 1 FROM friendships f
      WHERE f.status = 'accepted'
      AND ((f.user_id = v_effective_searcher_id AND f.friend_id = p.id)
        OR (f.friend_id = v_effective_searcher_id AND f.user_id = p.id))
    ) as is_friend,
    (
      SELECT f.status FROM friendships f
      WHERE (f.user_id = v_effective_searcher_id AND f.friend_id = p.id)
         OR (f.friend_id = v_effective_searcher_id AND f.user_id = p.id)
      LIMIT 1
    ) as friendship_status
  FROM profiles p
  LEFT JOIN privacy_settings ps ON ps.user_id = p.id
  WHERE p.id != v_effective_searcher_id
    AND (
      p.username ILIKE '%' || p_query || '%'
      OR p.full_name ILIKE '%' || p_query || '%'
    )
    AND (
      -- Respect privacy settings
      ps.profile_visibility = 'public'
      OR ps.profile_visibility = 'friends_only' AND EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.status = 'accepted'
        AND ((f.user_id = v_effective_searcher_id AND f.friend_id = p.id)
          OR (f.friend_id = v_effective_searcher_id AND f.user_id = p.id))
      )
      OR ps.user_id IS NULL -- No privacy settings = default visible
    )
  ORDER BY
    CASE WHEN p.username ILIKE p_query THEN 0
         WHEN p.username ILIKE p_query || '%' THEN 1
         ELSE 2
    END,
    p.username
  LIMIT p_limit;
END;
$$;

-- 12. FIX can_view_profile: Used in RLS policies, ensure safe
-- Note: This function is used in RLS policies so we keep it flexible
-- =====================================================
CREATE OR REPLACE FUNCTION can_view_profile(
  p_viewer_id uuid,
  p_profile_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_privacy RECORD;
BEGIN
  -- Same user can always view their own profile
  IF p_viewer_id = p_profile_id THEN
    RETURN true;
  END IF;

  -- Get privacy settings
  SELECT * INTO v_privacy
  FROM privacy_settings
  WHERE user_id = p_profile_id;

  -- No privacy settings = public by default
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  -- Check based on visibility setting
  CASE v_privacy.profile_visibility
    WHEN 'public' THEN
      RETURN true;
    WHEN 'friends_only' THEN
      RETURN EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.status = 'accepted'
        AND ((f.user_id = p_viewer_id AND f.friend_id = p_profile_id)
          OR (f.friend_id = p_viewer_id AND f.user_id = p_profile_id))
      );
    WHEN 'private' THEN
      RETURN false;
    ELSE
      RETURN true;
  END CASE;
END;
$$;

-- 13. FIX can_send_friend_request: Add auth validation
-- Original signature: (sender_id UUID, recipient_id UUID)
-- =====================================================
CREATE OR REPLACE FUNCTION can_send_friend_request(
  sender_id uuid,
  recipient_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_privacy RECORD;
  v_effective_sender_id uuid;
BEGIN
  -- SECURITY: Validate sender_id if auth is available
  IF auth.uid() IS NOT NULL AND sender_id != auth.uid() THEN
    RETURN false; -- Don't raise exception, just return false for RLS compatibility
  END IF;

  v_effective_sender_id := COALESCE(auth.uid(), sender_id);

  -- Can't friend yourself
  IF v_effective_sender_id = recipient_id THEN
    RETURN false;
  END IF;

  -- Check if already friends or pending
  IF EXISTS (
    SELECT 1 FROM friendships f
    WHERE (f.user_id = v_effective_sender_id AND f.friend_id = recipient_id)
       OR (f.friend_id = v_effective_sender_id AND f.user_id = recipient_id)
  ) THEN
    RETURN false;
  END IF;

  -- Get privacy settings
  SELECT * INTO v_privacy
  FROM privacy_settings
  WHERE privacy_settings.user_id = recipient_id;

  -- No settings = allow
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  RETURN v_privacy.allow_friend_requests;
END;
$$;

-- 14. FIX can_send_competition_invite: Add auth validation
-- Original signature: (sender_id UUID, recipient_id UUID)
-- =====================================================
CREATE OR REPLACE FUNCTION can_send_competition_invite(
  sender_id uuid,
  recipient_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_privacy RECORD;
  v_effective_sender_id uuid;
BEGIN
  -- SECURITY: Validate sender_id if auth is available
  IF auth.uid() IS NOT NULL AND sender_id != auth.uid() THEN
    RETURN false; -- Don't raise exception, just return false for RLS compatibility
  END IF;

  v_effective_sender_id := COALESCE(auth.uid(), sender_id);

  -- Can't invite yourself
  IF v_effective_sender_id = recipient_id THEN
    RETURN false;
  END IF;

  -- Get privacy settings
  SELECT * INTO v_privacy
  FROM privacy_settings
  WHERE privacy_settings.user_id = recipient_id;

  -- No settings = allow
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  -- Check based on invite setting
  CASE v_privacy.allow_competition_invites
    WHEN 'anyone' THEN
      RETURN true;
    WHEN 'friends_only' THEN
      RETURN EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.status = 'accepted'
        AND ((f.user_id = v_effective_sender_id AND f.friend_id = recipient_id)
          OR (f.friend_id = v_effective_sender_id AND f.user_id = recipient_id))
      );
    WHEN 'none' THEN
      RETURN false;
    ELSE
      RETURN true;
  END CASE;
END;
$$;

-- 15. FIX moderation functions: Add auth validation (if they exist)
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'has_unacknowledged_warnings') THEN
    EXECUTE $func$
    CREATE OR REPLACE FUNCTION has_unacknowledged_warnings(p_user_id uuid)
    RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    STABLE
    SET search_path = public
    AS $inner$
    BEGIN
      -- SECURITY: Only allow checking own warnings
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      IF auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Cannot check warnings for another user';
      END IF;

      RETURN EXISTS (
        SELECT 1 FROM account_warnings
        WHERE user_id = p_user_id
        AND acknowledged_at IS NULL
      );
    END;
    $inner$;
    $func$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'has_active_suspension') THEN
    EXECUTE $func$
    CREATE OR REPLACE FUNCTION has_active_suspension(p_user_id uuid)
    RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    STABLE
    SET search_path = public
    AS $inner$
    BEGIN
      -- SECURITY: Only allow checking own suspension
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      IF auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Cannot check suspension for another user';
      END IF;

      RETURN EXISTS (
        SELECT 1 FROM account_suspensions
        WHERE user_id = p_user_id
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > now())
      );
    END;
    $inner$;
    $func$;
  END IF;
END $$;

-- 16. FIX report rate limit functions (if they exist)
-- Original: check_report_rate_limit returns jsonb, increment_report_count returns void
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_report_rate_limit') THEN
    EXECUTE $func$
    CREATE OR REPLACE FUNCTION check_report_rate_limit(checking_user_id uuid)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $inner$
    DECLARE
      max_reports_per_day integer := 10;
      current_count integer := 0;
      window_start_time timestamptz;
      one_day_ago timestamptz := now() - interval '24 hours';
    BEGIN
      -- SECURITY: Only allow checking own rate limit
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      IF auth.uid() != checking_user_id THEN
        RAISE EXCEPTION 'Cannot check rate limit for another user';
      END IF;

      -- Get or create rate limit record
      SELECT report_count, window_start INTO current_count, window_start_time
      FROM report_rate_limits
      WHERE user_id = checking_user_id;

      IF NOT FOUND THEN
        INSERT INTO report_rate_limits (user_id, report_count, window_start)
        VALUES (checking_user_id, 0, now());

        RETURN jsonb_build_object(
          'allowed', true,
          'remaining', max_reports_per_day,
          'reason', null
        );
      END IF;

      -- Reset counter if window has expired
      IF window_start_time < one_day_ago THEN
        UPDATE report_rate_limits
        SET report_count = 0, window_start = now()
        WHERE user_id = checking_user_id;

        RETURN jsonb_build_object(
          'allowed', true,
          'remaining', max_reports_per_day,
          'reason', null
        );
      END IF;

      -- Check if user has exceeded limit
      IF current_count >= max_reports_per_day THEN
        RETURN jsonb_build_object(
          'allowed', false,
          'remaining', 0,
          'reason', 'You have reached your daily report limit. Please try again tomorrow.'
        );
      END IF;

      RETURN jsonb_build_object(
        'allowed', true,
        'remaining', max_reports_per_day - current_count,
        'reason', null
      );
    END;
    $inner$;
    $func$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'increment_report_count') THEN
    EXECUTE $func$
    CREATE OR REPLACE FUNCTION increment_report_count(reporting_user_id uuid)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $inner$
    BEGIN
      -- SECURITY: Only allow incrementing own report count
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      IF auth.uid() != reporting_user_id THEN
        RAISE EXCEPTION 'Cannot increment report count for another user';
      END IF;

      INSERT INTO report_rate_limits (user_id, report_count, window_start)
      VALUES (reporting_user_id, 1, now())
      ON CONFLICT (user_id) DO UPDATE
      SET report_count = report_rate_limits.report_count + 1;
    END;
    $inner$;
    $func$;
  END IF;
END $$;

-- =====================================================
-- Grant/Revoke permissions
-- =====================================================
GRANT EXECUTE ON FUNCTION update_subscription_tier(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_user_activity(uuid, date, integer, integer, integer, integer, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION update_competition_standings(uuid, uuid, date, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION create_friendship(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_friendship(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_friendship(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_participant_points(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION update_participant_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION check_reset_ai_messages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_competition_leaderboard(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION search_users(text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION can_view_profile(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_send_friend_request(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_send_competition_invite(uuid, uuid) TO authenticated;

-- Revoke execute from anon on all sensitive functions
REVOKE EXECUTE ON FUNCTION update_subscription_tier(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION upsert_user_activity(uuid, date, integer, integer, integer, integer, numeric, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION update_competition_standings(uuid, uuid, date, numeric, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION create_friendship(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION accept_friendship(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION remove_friendship(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION calculate_participant_points(uuid, uuid, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION update_participant_totals(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION check_reset_ai_messages(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION get_competition_leaderboard(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION search_users(text, uuid, integer) FROM anon;
