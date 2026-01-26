-- =====================================================
-- Comprehensive Secure Read Functions
-- Per security rules: Frontend should NEVER use .select() directly
-- All reads must go through SECURITY DEFINER RPC functions
-- =====================================================

-- =====================================================
-- DROP EXISTING FUNCTIONS (to allow changing return types)
-- =====================================================
DROP FUNCTION IF EXISTS public.get_my_profile();
DROP FUNCTION IF EXISTS public.get_user_profile(uuid);
DROP FUNCTION IF EXISTS public.get_my_fitness();
DROP FUNCTION IF EXISTS public.get_my_activity_feed(integer, integer);
DROP FUNCTION IF EXISTS public.get_user_activity(uuid, integer, integer);
DROP FUNCTION IF EXISTS public.get_my_competitions();
DROP FUNCTION IF EXISTS public.get_competition_details(uuid);
DROP FUNCTION IF EXISTS public.get_competition_participants(uuid);
DROP FUNCTION IF EXISTS public.get_my_friends();
DROP FUNCTION IF EXISTS public.get_pending_friend_requests();
DROP FUNCTION IF EXISTS public.get_my_achievements();
DROP FUNCTION IF EXISTS public.check_are_friends(uuid);
DROP FUNCTION IF EXISTS public.get_sent_friend_requests();

-- =====================================================
-- 1. PROFILE FUNCTIONS
-- =====================================================

-- Get current user's own profile
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  avatar_url text,
  username text,
  bio text,
  pronouns text,
  phone text,
  phone_verified boolean,
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
    p.id, p.email, p.full_name, p.avatar_url, p.username,
    p.bio, p.pronouns, p.phone, p.phone_verified,
    p.created_at, p.updated_at
  FROM profiles p
  WHERE p.id = v_user_id;
END;
$$;

-- Get another user's public profile (respects privacy settings)
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
    RAISE EXCEPTION 'Profile not accessible';
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
-- 2. USER FITNESS FUNCTIONS
-- =====================================================

-- Get current user's fitness data
CREATE OR REPLACE FUNCTION public.get_my_fitness()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  move_goal integer,
  exercise_goal integer,
  stand_goal integer,
  height numeric,
  weight numeric,
  target_weight numeric,
  start_weight numeric,
  age integer,
  gender text,
  pronouns text,
  birthday date,
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
    uf.id, uf.user_id, uf.move_goal, uf.exercise_goal, uf.stand_goal,
    uf.height, uf.weight, uf.target_weight, uf.start_weight,
    uf.age, uf.gender, uf.pronouns, uf.birthday,
    uf.created_at, uf.updated_at
  FROM user_fitness uf
  WHERE uf.user_id = v_user_id;
END;
$$;

-- =====================================================
-- 3. ACTIVITY FUNCTIONS
-- =====================================================

-- Get current user's activity feed
CREATE OR REPLACE FUNCTION public.get_my_activity_feed(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  activity_type text,
  date date,
  calories integer,
  exercise_minutes integer,
  stand_hours integer,
  steps integer,
  distance numeric,
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
  SELECT
    af.id, af.user_id, af.activity_type, af.date,
    af.calories, af.exercise_minutes, af.stand_hours,
    af.steps, af.distance, af.created_at
  FROM activity_feed af
  WHERE af.user_id = v_user_id
  ORDER BY af.date DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Get user's activity (for friends/competition viewing with privacy check)
CREATE OR REPLACE FUNCTION public.get_user_activity(
  p_target_user_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  activity_type text,
  date date,
  calories integer,
  exercise_minutes integer,
  stand_hours integer,
  steps integer,
  distance numeric,
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

  -- Check if viewer can see this user's activity
  IF v_user_id != p_target_user_id AND NOT can_view_profile(v_user_id, p_target_user_id) THEN
    RAISE EXCEPTION 'Activity not accessible';
  END IF;

  RETURN QUERY
  SELECT
    af.id, af.user_id, af.activity_type, af.date,
    af.calories, af.exercise_minutes, af.stand_hours,
    af.steps, af.distance, af.created_at
  FROM activity_feed af
  WHERE af.user_id = p_target_user_id
  ORDER BY af.date DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- =====================================================
-- 4. COMPETITION FUNCTIONS
-- =====================================================

-- Get user's competitions
CREATE OR REPLACE FUNCTION public.get_my_competitions()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  competition_type text,
  start_date date,
  end_date date,
  status text,
  is_public boolean,
  max_participants integer,
  creator_id uuid,
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
  SELECT
    c.id, c.name, c.description, c.competition_type,
    c.start_date, c.end_date, c.status, c.is_public,
    c.max_participants, c.creator_id, c.created_at
  FROM competitions c
  INNER JOIN competition_participants cp ON c.id = cp.competition_id
  WHERE cp.user_id = v_user_id
  ORDER BY c.start_date DESC;
END;
$$;

-- Get competition details (if user has access)
CREATE OR REPLACE FUNCTION public.get_competition_details(p_competition_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  competition_type text,
  start_date date,
  end_date date,
  status text,
  is_public boolean,
  max_participants integer,
  creator_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_participant boolean;
  v_is_public boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user is participant
  SELECT EXISTS(
    SELECT 1 FROM competition_participants
    WHERE competition_id = p_competition_id AND user_id = v_user_id
  ) INTO v_is_participant;

  -- Check if competition is public
  SELECT c.is_public INTO v_is_public
  FROM competitions c WHERE c.id = p_competition_id;

  -- Must be participant or competition must be public
  IF NOT v_is_participant AND NOT COALESCE(v_is_public, false) THEN
    RAISE EXCEPTION 'Competition not accessible';
  END IF;

  RETURN QUERY
  SELECT
    c.id, c.name, c.description, c.competition_type,
    c.start_date, c.end_date, c.status, c.is_public,
    c.max_participants, c.creator_id, c.created_at
  FROM competitions c
  WHERE c.id = p_competition_id;
END;
$$;

-- Get competition participants
CREATE OR REPLACE FUNCTION public.get_competition_participants(p_competition_id uuid)
RETURNS TABLE (
  id uuid,
  competition_id uuid,
  user_id uuid,
  joined_at timestamptz,
  total_points integer,
  rank integer,
  user_full_name text,
  user_avatar_url text,
  user_username text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_participant boolean;
  v_is_public boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check access
  SELECT EXISTS(
    SELECT 1 FROM competition_participants
    WHERE competition_id = p_competition_id AND user_id = v_user_id
  ) INTO v_is_participant;

  SELECT c.is_public INTO v_is_public
  FROM competitions c WHERE c.id = p_competition_id;

  IF NOT v_is_participant AND NOT COALESCE(v_is_public, false) THEN
    RAISE EXCEPTION 'Competition not accessible';
  END IF;

  RETURN QUERY
  SELECT
    cp.id, cp.competition_id, cp.user_id, cp.joined_at,
    cp.total_points, cp.rank,
    p.full_name as user_full_name,
    p.avatar_url as user_avatar_url,
    p.username as user_username
  FROM competition_participants cp
  INNER JOIN profiles p ON cp.user_id = p.id
  WHERE cp.competition_id = p_competition_id
  ORDER BY cp.rank ASC NULLS LAST, cp.total_points DESC;
END;
$$;

-- =====================================================
-- 5. FRIENDSHIP FUNCTIONS
-- =====================================================

-- Get user's friends
CREATE OR REPLACE FUNCTION public.get_my_friends()
RETURNS TABLE (
  friendship_id uuid,
  friend_id uuid,
  friend_name text,
  friend_avatar text,
  friend_username text,
  status text,
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
  SELECT
    f.id as friendship_id,
    CASE WHEN f.user_id = v_user_id THEN f.friend_id ELSE f.user_id END as friend_id,
    p.full_name as friend_name,
    p.avatar_url as friend_avatar,
    p.username as friend_username,
    f.status,
    f.created_at
  FROM friendships f
  INNER JOIN profiles p ON p.id = CASE WHEN f.user_id = v_user_id THEN f.friend_id ELSE f.user_id END
  WHERE (f.user_id = v_user_id OR f.friend_id = v_user_id)
    AND f.status = 'accepted'
  ORDER BY p.full_name;
END;
$$;

-- Get pending friend requests
CREATE OR REPLACE FUNCTION public.get_pending_friend_requests()
RETURNS TABLE (
  friendship_id uuid,
  requester_id uuid,
  requester_name text,
  requester_avatar text,
  requester_username text,
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
  SELECT
    f.id as friendship_id,
    f.user_id as requester_id,
    p.full_name as requester_name,
    p.avatar_url as requester_avatar,
    p.username as requester_username,
    f.created_at
  FROM friendships f
  INNER JOIN profiles p ON p.id = f.user_id
  WHERE f.friend_id = v_user_id AND f.status = 'pending'
  ORDER BY f.created_at DESC;
END;
$$;

-- =====================================================
-- 6. ACHIEVEMENT FUNCTIONS
-- =====================================================

-- Get user's achievements (returns per-tier unlock timestamps)
CREATE OR REPLACE FUNCTION public.get_my_achievements()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  achievement_id text,
  current_progress integer,
  bronze_unlocked_at timestamptz,
  silver_unlocked_at timestamptz,
  gold_unlocked_at timestamptz,
  platinum_unlocked_at timestamptz,
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
    uap.id, uap.user_id, uap.achievement_id, uap.current_progress,
    uap.bronze_unlocked_at, uap.silver_unlocked_at,
    uap.gold_unlocked_at, uap.platinum_unlocked_at,
    uap.created_at, uap.updated_at
  FROM user_achievement_progress uap
  WHERE uap.user_id = v_user_id
  ORDER BY uap.achievement_id;
END;
$$;

-- =====================================================
-- 7. ADDITIONAL UTILITY FUNCTIONS
-- =====================================================

-- Check if two users are friends
CREATE OR REPLACE FUNCTION public.check_are_friends(p_friend_id uuid)
RETURNS boolean
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

  RETURN EXISTS(
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
      AND ((user_id = v_user_id AND friend_id = p_friend_id)
        OR (user_id = p_friend_id AND friend_id = v_user_id))
  );
END;
$$;

-- Get sent friend requests (requests BY the current user)
CREATE OR REPLACE FUNCTION public.get_sent_friend_requests()
RETURNS TABLE (
  friendship_id uuid,
  recipient_id uuid,
  recipient_name text,
  recipient_avatar text,
  recipient_username text,
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
  SELECT
    f.id as friendship_id,
    f.friend_id as recipient_id,
    p.full_name as recipient_name,
    p.avatar_url as recipient_avatar,
    p.username as recipient_username,
    f.created_at
  FROM friendships f
  INNER JOIN profiles p ON p.id = f.friend_id
  WHERE f.user_id = v_user_id AND f.status = 'pending'
  ORDER BY f.created_at DESC;
END;
$$;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Profile functions
REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_profile(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_profile(uuid) TO authenticated;

-- Fitness functions
REVOKE EXECUTE ON FUNCTION public.get_my_fitness() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_fitness() TO authenticated;

-- Activity functions
REVOKE EXECUTE ON FUNCTION public.get_my_activity_feed(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_activity_feed(integer, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_activity(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_activity(uuid, integer, integer) TO authenticated;

-- Competition functions
REVOKE EXECUTE ON FUNCTION public.get_my_competitions() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_competitions() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_competition_details(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_competition_details(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_competition_participants(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_competition_participants(uuid) TO authenticated;

-- Friendship functions
REVOKE EXECUTE ON FUNCTION public.get_my_friends() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_friends() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_pending_friend_requests() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pending_friend_requests() TO authenticated;

-- Achievement functions
REVOKE EXECUTE ON FUNCTION public.get_my_achievements() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_achievements() TO authenticated;

-- Utility functions
REVOKE EXECUTE ON FUNCTION public.check_are_friends(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_are_friends(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_sent_friend_requests() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_sent_friend_requests() TO authenticated;

-- =====================================================
-- REVOKE DIRECT TABLE ACCESS (force RPC usage)
-- =====================================================

-- Note: Only revoke SELECT if you want to FORCE all reads through RPC
-- This is the strictest interpretation of the security rules
-- Uncomment these lines to enforce strict backend-only data access:

-- REVOKE SELECT ON public.profiles FROM authenticated;
-- REVOKE SELECT ON public.user_fitness FROM authenticated;
-- REVOKE SELECT ON public.activity_feed FROM authenticated;
-- REVOKE SELECT ON public.competitions FROM authenticated;
-- REVOKE SELECT ON public.competition_participants FROM authenticated;
-- REVOKE SELECT ON public.friendships FROM authenticated;
-- REVOKE SELECT ON public.user_achievement_progress FROM authenticated;
