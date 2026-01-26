-- =====================================================
-- Extended Secure Read Functions (Part 2)
-- Per security rules: Frontend should NEVER use .select() directly
-- All reads must go through SECURITY DEFINER RPC functions
-- =====================================================

-- =====================================================
-- DROP EXISTING FUNCTIONS (to allow changing return types)
-- =====================================================
DROP FUNCTION IF EXISTS public.get_competition_full(uuid);
DROP FUNCTION IF EXISTS public.get_competition_participants_with_profiles(uuid);
DROP FUNCTION IF EXISTS public.get_competition_pending_invitations(uuid);
DROP FUNCTION IF EXISTS public.get_my_competition_ids();
DROP FUNCTION IF EXISTS public.get_my_participant_record(uuid);
DROP FUNCTION IF EXISTS public.get_competition_scoring_info(uuid);
DROP FUNCTION IF EXISTS public.get_my_competition_daily_data(uuid, text, text);
DROP FUNCTION IF EXISTS public.get_competition_creator(uuid);
DROP FUNCTION IF EXISTS public.get_competition_name(uuid);
DROP FUNCTION IF EXISTS public.check_username_available(text);
DROP FUNCTION IF EXISTS public.get_user_fitness_goals(uuid);
DROP FUNCTION IF EXISTS public.get_user_activity_for_date(uuid, text);
DROP FUNCTION IF EXISTS public.get_user_competition_daily_data_for_date(uuid, text);
DROP FUNCTION IF EXISTS public.get_user_competition_stats(uuid);
DROP FUNCTION IF EXISTS public.get_user_recent_activity(uuid, integer);
DROP FUNCTION IF EXISTS public.get_user_achievement_progress(uuid);
DROP FUNCTION IF EXISTS public.get_my_chat_messages(uuid, integer, integer);
DROP FUNCTION IF EXISTS public.get_chat_participants(uuid);
DROP FUNCTION IF EXISTS public.get_activity_reactions(uuid);
DROP FUNCTION IF EXISTS public.get_my_invitations();
DROP FUNCTION IF EXISTS public.get_my_blocked_users();
DROP FUNCTION IF EXISTS public.get_blocked_user_count();
DROP FUNCTION IF EXISTS public.get_my_fair_play_status();
DROP FUNCTION IF EXISTS public.get_my_coach_intro_status();
DROP FUNCTION IF EXISTS public.get_my_phone_verified();
DROP FUNCTION IF EXISTS public.get_my_primary_device();
DROP FUNCTION IF EXISTS public.search_users(text, integer);

-- =====================================================
-- 1. COMPETITION FUNCTIONS
-- =====================================================

-- Get full competition details
CREATE OR REPLACE FUNCTION public.get_competition_full(p_competition_id uuid)
RETURNS TABLE (
  id uuid,
  creator_id uuid,
  name text,
  description text,
  start_date date,
  end_date date,
  type text,
  status text,
  scoring_type text,
  scoring_config jsonb,
  is_public boolean,
  repeat_option text,
  created_at timestamptz,
  updated_at timestamptz
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

  RETURN QUERY
  SELECT
    c.id, c.creator_id, c.name, c.description,
    c.start_date, c.end_date, c.type, c.status,
    c.scoring_type, c.scoring_config, c.is_public,
    c.repeat_option, c.created_at, c.updated_at
  FROM competitions c
  WHERE c.id = p_competition_id
    AND (
      c.is_public = true
      OR c.creator_id = v_user_id
      OR EXISTS (
        SELECT 1 FROM competition_participants cp
        WHERE cp.competition_id = c.id AND cp.user_id = v_user_id
      )
    );
END;
$$;

-- Get competition participants with profiles
CREATE OR REPLACE FUNCTION public.get_competition_participants_with_profiles(p_competition_id uuid)
RETURNS TABLE (
  participant_id uuid,
  user_id uuid,
  joined_at timestamptz,
  last_sync_at timestamptz,
  total_points numeric,
  move_calories numeric,
  exercise_minutes numeric,
  stand_hours numeric,
  step_count numeric,
  move_progress numeric,
  exercise_progress numeric,
  stand_progress numeric,
  username text,
  full_name text,
  avatar_url text
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
  ORDER BY cp.total_points DESC;
END;
$$;

-- Get pending invitations for a competition (creator only)
CREATE OR REPLACE FUNCTION public.get_competition_pending_invitations(p_competition_id uuid)
RETURNS TABLE (
  invitation_id uuid,
  invitee_id uuid,
  invited_at timestamptz,
  invitee_username text,
  invitee_full_name text,
  invitee_avatar_url text
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

  -- Only creator can see pending invitations
  IF NOT EXISTS (
    SELECT 1 FROM competitions c
    WHERE c.id = p_competition_id AND c.creator_id = v_user_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ci.id as invitation_id,
    ci.invitee_id,
    ci.invited_at,
    p.username as invitee_username,
    p.full_name as invitee_full_name,
    p.avatar_url as invitee_avatar_url
  FROM competition_invitations ci
  INNER JOIN profiles p ON p.id = ci.invitee_id
  WHERE ci.competition_id = p_competition_id
    AND ci.status = 'pending'
  ORDER BY ci.invited_at DESC;
END;
$$;

-- Get current user's competition IDs
CREATE OR REPLACE FUNCTION public.get_my_competition_ids()
RETURNS TABLE (competition_id uuid)
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

  RETURN QUERY
  SELECT cp.competition_id
  FROM competition_participants cp
  WHERE cp.user_id = v_user_id;
END;
$$;

-- Get current user's participant record for a competition
CREATE OR REPLACE FUNCTION public.get_my_participant_record(p_competition_id uuid)
RETURNS TABLE (
  participant_id uuid,
  competition_id uuid,
  user_id uuid,
  joined_at timestamptz,
  total_points numeric
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

  RETURN QUERY
  SELECT
    cp.id as participant_id,
    cp.competition_id,
    cp.user_id,
    cp.joined_at,
    cp.total_points
  FROM competition_participants cp
  WHERE cp.competition_id = p_competition_id
    AND cp.user_id = v_user_id;
END;
$$;

-- Get competition scoring info
CREATE OR REPLACE FUNCTION public.get_competition_scoring_info(p_competition_id uuid)
RETURNS TABLE (
  scoring_type text,
  scoring_config jsonb
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

  RETURN QUERY
  SELECT c.scoring_type, c.scoring_config
  FROM competitions c
  WHERE c.id = p_competition_id
    AND (c.is_public = true OR c.creator_id = v_user_id
         OR EXISTS (SELECT 1 FROM competition_participants cp WHERE cp.competition_id = c.id AND cp.user_id = v_user_id));
END;
$$;

-- Get current user's daily data for a competition
CREATE OR REPLACE FUNCTION public.get_my_competition_daily_data(
  p_competition_id uuid,
  p_start_date text,
  p_end_date text
)
RETURNS TABLE (
  id uuid,
  date date,
  move_calories numeric,
  exercise_minutes numeric,
  stand_hours numeric,
  step_count numeric,
  distance_meters numeric,
  workouts_completed integer,
  points numeric,
  synced_at timestamptz
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

  RETURN QUERY
  SELECT
    cdd.id,
    cdd.date,
    cdd.move_calories,
    cdd.exercise_minutes,
    cdd.stand_hours,
    cdd.step_count,
    cdd.distance_meters,
    cdd.workouts_completed,
    cdd.points,
    cdd.synced_at
  FROM competition_daily_data cdd
  WHERE cdd.competition_id = p_competition_id
    AND cdd.user_id = v_user_id
    AND cdd.date >= p_start_date::date
    AND cdd.date <= p_end_date::date
  ORDER BY cdd.date;
END;
$$;

-- Get competition creator (for delete permission check)
CREATE OR REPLACE FUNCTION public.get_competition_creator(p_competition_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_creator_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT c.creator_id INTO v_creator_id
  FROM competitions c
  WHERE c.id = p_competition_id;

  RETURN v_creator_id;
END;
$$;

-- Get competition name (for notifications)
CREATE OR REPLACE FUNCTION public.get_competition_name(p_competition_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT c.name INTO v_name
  FROM competitions c
  WHERE c.id = p_competition_id;

  RETURN v_name;
END;
$$;

-- =====================================================
-- 2. USER PROFILE FUNCTIONS
-- =====================================================

-- Check if username is available
CREATE OR REPLACE FUNCTION public.check_username_available(p_username text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No auth check needed - anyone can check username availability
  RETURN NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE username = lower(p_username)
  );
END;
$$;

-- Get user's fitness goals (for viewing friend profiles)
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

  -- Can view own goals or friend's goals
  IF p_user_id != v_user_id AND NOT EXISTS (
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
      AND ((user_id = v_user_id AND friend_id = p_user_id)
        OR (user_id = p_user_id AND friend_id = v_user_id))
  ) THEN
    -- Not a friend, return null/empty
    RETURN;
  END IF;

  RETURN QUERY
  SELECT uf.move_goal, uf.exercise_goal, uf.stand_goal
  FROM user_fitness uf
  WHERE uf.user_id = p_user_id;
END;
$$;

-- Get user's activity for a specific date
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

  -- Can view own activity or friend's activity
  IF p_user_id != v_user_id AND NOT EXISTS (
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
      AND ((user_id = v_user_id AND friend_id = p_user_id)
        OR (user_id = p_user_id AND friend_id = v_user_id))
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT ua.move_calories, ua.exercise_minutes, ua.stand_hours, ua.workouts_completed
  FROM user_activity ua
  WHERE ua.user_id = p_user_id
    AND ua.date = p_date::date;
END;
$$;

-- Get user's competition daily data for a date (fallback for activity)
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

  -- Can view own data or friend's data
  IF p_user_id != v_user_id AND NOT EXISTS (
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
      AND ((user_id = v_user_id AND friend_id = p_user_id)
        OR (user_id = p_user_id AND friend_id = v_user_id))
  ) THEN
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

-- Get user's competition stats
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

  -- Can view own stats or friend's stats
  IF p_user_id != v_user_id AND NOT EXISTS (
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
      AND ((user_id = v_user_id AND friend_id = p_user_id)
        OR (user_id = p_user_id AND friend_id = v_user_id))
  ) THEN
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

-- Get user's recent activity for streak calculation
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

  -- Can view own activity or friend's activity
  IF p_user_id != v_user_id AND NOT EXISTS (
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
      AND ((user_id = v_user_id AND friend_id = p_user_id)
        OR (user_id = p_user_id AND friend_id = v_user_id))
  ) THEN
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

-- Get user's achievement progress
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

  -- Can view own achievements or friend's achievements
  IF p_user_id != v_user_id AND NOT EXISTS (
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
      AND ((user_id = v_user_id AND friend_id = p_user_id)
        OR (user_id = p_user_id AND friend_id = v_user_id))
  ) THEN
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
-- 3. CHAT FUNCTIONS
-- =====================================================

-- Get chat messages
CREATE OR REPLACE FUNCTION public.get_my_chat_messages(
  p_competition_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  competition_id uuid,
  user_id uuid,
  message_type text,
  content text,
  metadata jsonb,
  created_at timestamptz,
  sender_username text,
  sender_full_name text,
  sender_avatar_url text
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

  -- User must be a participant
  IF NOT EXISTS (
    SELECT 1 FROM competition_participants cp
    WHERE cp.competition_id = p_competition_id AND cp.user_id = v_user_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    cm.id,
    cm.competition_id,
    cm.user_id,
    cm.message_type,
    cm.content,
    cm.metadata,
    cm.created_at,
    p.username as sender_username,
    p.full_name as sender_full_name,
    p.avatar_url as sender_avatar_url
  FROM chat_messages cm
  INNER JOIN profiles p ON p.id = cm.user_id
  WHERE cm.competition_id = p_competition_id
  ORDER BY cm.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Get chat participants (profiles for a competition)
CREATE OR REPLACE FUNCTION public.get_chat_participants(p_competition_id uuid)
RETURNS TABLE (
  user_id uuid,
  username text,
  full_name text,
  avatar_url text
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

  -- User must be a participant
  IF NOT EXISTS (
    SELECT 1 FROM competition_participants cp
    WHERE cp.competition_id = p_competition_id AND cp.user_id = v_user_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id as user_id, p.username, p.full_name, p.avatar_url
  FROM competition_participants cp
  INNER JOIN profiles p ON p.id = cp.user_id
  WHERE cp.competition_id = p_competition_id;
END;
$$;

-- =====================================================
-- 4. ACTIVITY FEED FUNCTIONS
-- =====================================================

-- Get reactions for an activity
CREATE OR REPLACE FUNCTION public.get_activity_reactions(p_activity_id uuid)
RETURNS TABLE (
  id uuid,
  activity_id uuid,
  user_id uuid,
  reaction_type text,
  comment text,
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

  RETURN QUERY
  SELECT ar.id, ar.activity_id, ar.user_id, ar.reaction_type, ar.comment, ar.created_at
  FROM activity_reactions ar
  WHERE ar.activity_id = p_activity_id
  ORDER BY ar.created_at DESC;
END;
$$;

-- =====================================================
-- 5. INVITATION FUNCTIONS
-- =====================================================

-- Get current user's pending invitations
CREATE OR REPLACE FUNCTION public.get_my_invitations()
RETURNS TABLE (
  invitation_id uuid,
  competition_id uuid,
  inviter_id uuid,
  invited_at timestamptz,
  status text,
  competition_name text,
  competition_description text,
  competition_start_date date,
  competition_end_date date,
  competition_type text,
  competition_status text,
  competition_scoring_type text,
  inviter_username text,
  inviter_full_name text,
  inviter_avatar_url text
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

  RETURN QUERY
  SELECT
    ci.id as invitation_id,
    ci.competition_id,
    ci.inviter_id,
    ci.invited_at,
    ci.status,
    c.name as competition_name,
    c.description as competition_description,
    c.start_date as competition_start_date,
    c.end_date as competition_end_date,
    c.type as competition_type,
    c.status as competition_status,
    c.scoring_type as competition_scoring_type,
    p.username as inviter_username,
    p.full_name as inviter_full_name,
    p.avatar_url as inviter_avatar_url
  FROM competition_invitations ci
  INNER JOIN competitions c ON c.id = ci.competition_id
  INNER JOIN profiles p ON p.id = ci.inviter_id
  WHERE ci.invitee_id = v_user_id
    AND ci.status = 'pending'
  ORDER BY ci.invited_at DESC;
END;
$$;

-- =====================================================
-- 6. BLOCKED USERS FUNCTIONS
-- =====================================================

-- Get current user's blocked users
CREATE OR REPLACE FUNCTION public.get_my_blocked_users()
RETURNS TABLE (
  block_id uuid,
  blocked_user_id uuid,
  blocked_at timestamptz,
  blocked_username text,
  blocked_full_name text,
  blocked_avatar_url text
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

  RETURN QUERY
  SELECT
    ub.id as block_id,
    ub.blocked_user_id,
    ub.blocked_at,
    p.username as blocked_username,
    p.full_name as blocked_full_name,
    p.avatar_url as blocked_avatar_url
  FROM user_blocks ub
  INNER JOIN profiles p ON p.id = ub.blocked_user_id
  WHERE ub.blocker_user_id = v_user_id
  ORDER BY ub.blocked_at DESC;
END;
$$;

-- Get count of blocked users
CREATE OR REPLACE FUNCTION public.get_blocked_user_count()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM user_blocks
  WHERE blocker_user_id = v_user_id;

  RETURN v_count;
END;
$$;

-- =====================================================
-- 7. MISC USER SETTINGS FUNCTIONS
-- =====================================================

-- Get fair play acknowledgment status
CREATE OR REPLACE FUNCTION public.get_my_fair_play_status()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_acknowledged boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT fair_play_acknowledged INTO v_acknowledged
  FROM profiles
  WHERE id = v_user_id;

  RETURN COALESCE(v_acknowledged, false);
END;
$$;

-- Get coach intro seen status
CREATE OR REPLACE FUNCTION public.get_my_coach_intro_status()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_seen boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT coach_spark_intro_seen INTO v_seen
  FROM profiles
  WHERE id = v_user_id;

  RETURN COALESCE(v_seen, false);
END;
$$;

-- Get phone verified status
CREATE OR REPLACE FUNCTION public.get_my_phone_verified()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_verified boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT phone_verified INTO v_verified
  FROM profiles
  WHERE id = v_user_id;

  RETURN COALESCE(v_verified, false);
END;
$$;

-- Get primary device
CREATE OR REPLACE FUNCTION public.get_my_primary_device()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_device text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT primary_device INTO v_device
  FROM profiles
  WHERE id = v_user_id;

  RETURN v_device;
END;
$$;

-- =====================================================
-- 8. USER SEARCH FUNCTION
-- =====================================================

-- Search users by username, name, email, or phone
CREATE OR REPLACE FUNCTION public.search_users(
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  email text,
  subscription_tier text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_query text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_query := '%' || lower(p_query) || '%';

  RETURN QUERY
  SELECT p.id, p.username, p.full_name, p.avatar_url, p.email, p.subscription_tier
  FROM profiles p
  WHERE p.id != v_user_id
    AND (
      lower(p.username) LIKE v_query
      OR lower(p.full_name) LIKE v_query
      OR lower(p.email) LIKE v_query
      OR p.phone_number LIKE v_query
    )
  LIMIT p_limit;
END;
$$;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Competition functions
REVOKE EXECUTE ON FUNCTION public.get_competition_full(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_competition_full(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_competition_participants_with_profiles(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_competition_participants_with_profiles(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_competition_pending_invitations(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_competition_pending_invitations(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_competition_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_competition_ids() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_participant_record(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_participant_record(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_competition_scoring_info(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_competition_scoring_info(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_competition_daily_data(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_competition_daily_data(uuid, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_competition_creator(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_competition_creator(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_competition_name(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_competition_name(uuid) TO authenticated;

-- User profile functions
REVOKE EXECUTE ON FUNCTION public.check_username_available(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO authenticated;

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

-- Chat functions
REVOKE EXECUTE ON FUNCTION public.get_my_chat_messages(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_chat_messages(uuid, integer, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_chat_participants(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_chat_participants(uuid) TO authenticated;

-- Activity feed functions
REVOKE EXECUTE ON FUNCTION public.get_activity_reactions(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_activity_reactions(uuid) TO authenticated;

-- Invitation functions
REVOKE EXECUTE ON FUNCTION public.get_my_invitations() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_invitations() TO authenticated;

-- Blocked users functions
REVOKE EXECUTE ON FUNCTION public.get_my_blocked_users() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_blocked_users() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_blocked_user_count() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_blocked_user_count() TO authenticated;

-- Settings functions
REVOKE EXECUTE ON FUNCTION public.get_my_fair_play_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_fair_play_status() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_coach_intro_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_coach_intro_status() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_phone_verified() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_phone_verified() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_primary_device() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_primary_device() TO authenticated;

-- Search function
REVOKE EXECUTE ON FUNCTION public.search_users(text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_users(text, integer) TO authenticated;
