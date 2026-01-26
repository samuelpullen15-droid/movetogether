-- =====================================================
-- Additional Secure Read Functions (Part 3)
-- Per security rules: Frontend should NEVER use .select() directly
-- All reads must go through SECURITY DEFINER RPC functions
-- =====================================================

-- =====================================================
-- DROP EXISTING FUNCTIONS (to allow recreation)
-- =====================================================
DROP FUNCTION IF EXISTS public.get_activity_feed(integer);
DROP FUNCTION IF EXISTS public.get_activity_feed_profiles(uuid[]);
DROP FUNCTION IF EXISTS public.get_activity_feed_reactions(uuid[]);
DROP FUNCTION IF EXISTS public.get_activity_owner(uuid);
DROP FUNCTION IF EXISTS public.search_users_by_emails(text[]);
DROP FUNCTION IF EXISTS public.search_users_by_phones(text[]);
DROP FUNCTION IF EXISTS public.get_invitation_competition_id(uuid);
DROP FUNCTION IF EXISTS public.get_existing_invitation_invitees(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.get_inviter_info(uuid);

-- =====================================================
-- 1. ACTIVITY FEED FUNCTIONS
-- =====================================================

-- Get activity feed items
CREATE OR REPLACE FUNCTION public.get_activity_feed(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  activity_type text,
  title text,
  subtitle text,
  metadata jsonb,
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
    af.id,
    af.user_id,
    af.activity_type,
    af.title,
    af.subtitle,
    af.metadata,
    af.created_at
  FROM activity_feed af
  ORDER BY af.created_at DESC
  LIMIT p_limit;
END;
$$;

-- Get profiles for activity feed user IDs
CREATE OR REPLACE FUNCTION public.get_activity_feed_profiles(p_user_ids uuid[])
RETURNS TABLE (
  id uuid,
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

  RETURN QUERY
  SELECT p.id, p.username, p.full_name, p.avatar_url
  FROM profiles p
  WHERE p.id = ANY(p_user_ids);
END;
$$;

-- Get reactions for multiple activities
CREATE OR REPLACE FUNCTION public.get_activity_feed_reactions(p_activity_ids uuid[])
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
  WHERE ar.activity_id = ANY(p_activity_ids)
  ORDER BY ar.created_at DESC;
END;
$$;

-- Get activity owner (for notifications)
CREATE OR REPLACE FUNCTION public.get_activity_owner(p_activity_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT af.user_id INTO v_owner_id
  FROM activity_feed af
  WHERE af.id = p_activity_id;

  RETURN v_owner_id;
END;
$$;

-- =====================================================
-- 2. USER SEARCH FUNCTIONS
-- =====================================================

-- Search users by multiple emails
CREATE OR REPLACE FUNCTION public.search_users_by_emails(
  p_emails text[],
  p_limit integer DEFAULT 50
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.full_name, p.avatar_url, p.email, p.subscription_tier
  FROM profiles p
  WHERE p.id != v_user_id
    AND lower(p.email) = ANY(
      SELECT lower(unnest(p_emails))
    )
  LIMIT p_limit;
END;
$$;

-- Search users by multiple phone numbers
CREATE OR REPLACE FUNCTION public.search_users_by_phones(
  p_phones text[],
  p_limit integer DEFAULT 50
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.full_name, p.avatar_url, p.email, p.subscription_tier
  FROM profiles p
  WHERE p.id != v_user_id
    AND p.phone_number = ANY(p_phones)
  LIMIT p_limit;
END;
$$;

-- =====================================================
-- 3. INVITATION FUNCTIONS
-- =====================================================

-- Get competition_id from an invitation (before accepting)
CREATE OR REPLACE FUNCTION public.get_invitation_competition_id(p_invitation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_competition_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- User must be the invitee
  SELECT ci.competition_id INTO v_competition_id
  FROM competition_invitations ci
  WHERE ci.id = p_invitation_id
    AND ci.invitee_id = v_user_id;

  RETURN v_competition_id;
END;
$$;

-- Get existing invitation invitees for a competition (for dedup)
CREATE OR REPLACE FUNCTION public.get_existing_invitation_invitees(
  p_competition_id uuid,
  p_invitee_ids uuid[]
)
RETURNS TABLE (invitee_id uuid)
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

  -- User must be a participant or creator
  IF NOT EXISTS (
    SELECT 1 FROM competitions c
    WHERE c.id = p_competition_id
      AND (c.creator_id = v_user_id OR EXISTS (
        SELECT 1 FROM competition_participants cp
        WHERE cp.competition_id = c.id AND cp.user_id = v_user_id
      ))
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT ci.invitee_id
  FROM competition_invitations ci
  WHERE ci.competition_id = p_competition_id
    AND ci.invitee_id = ANY(p_invitee_ids);
END;
$$;

-- Get inviter info (for notifications)
CREATE OR REPLACE FUNCTION public.get_inviter_info(p_user_id uuid)
RETURNS TABLE (
  full_name text,
  username text
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
  SELECT p.full_name, p.username
  FROM profiles p
  WHERE p.id = p_user_id;
END;
$$;

-- =====================================================
-- 4. BLOCKED USERS (via friendships table)
-- =====================================================

DROP FUNCTION IF EXISTS public.get_my_blocked_friendships();

-- Get blocked users from friendships table
CREATE OR REPLACE FUNCTION public.get_my_blocked_friendships()
RETURNS TABLE (
  friendship_id uuid,
  friend_id uuid,
  blocked_at timestamptz,
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

  RETURN QUERY
  SELECT
    f.id as friendship_id,
    f.friend_id,
    f.created_at as blocked_at,
    p.id as user_id,
    p.username,
    p.full_name,
    p.avatar_url
  FROM friendships f
  INNER JOIN profiles p ON p.id = f.friend_id
  WHERE f.user_id = v_user_id
    AND f.status = 'blocked'
  ORDER BY f.created_at DESC;
END;
$$;

-- =====================================================
-- 5. USER FITNESS FUNCTIONS
-- =====================================================

DROP FUNCTION IF EXISTS public.get_my_fitness_goals();
DROP FUNCTION IF EXISTS public.get_my_weight_settings();
DROP FUNCTION IF EXISTS public.check_activity_exists_today(text);

-- Get current user's fitness goals
CREATE OR REPLACE FUNCTION public.get_my_fitness_goals()
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

  RETURN QUERY
  SELECT uf.move_goal, uf.exercise_goal, uf.stand_goal
  FROM user_fitness uf
  WHERE uf.user_id = v_user_id;
END;
$$;

-- Get current user's weight goal
CREATE OR REPLACE FUNCTION public.get_my_weight_settings()
RETURNS TABLE (
  target_weight numeric,
  start_weight numeric
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
  SELECT uf.target_weight, uf.start_weight
  FROM user_fitness uf
  WHERE uf.user_id = v_user_id;
END;
$$;

-- Check if activity of a type exists today
CREATE OR REPLACE FUNCTION public.check_activity_exists_today(p_activity_type text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_exists boolean;
  v_today_start timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_today_start := date_trunc('day', now());

  SELECT EXISTS (
    SELECT 1 FROM activity_feed af
    WHERE af.user_id = v_user_id
      AND af.activity_type = p_activity_type
      AND af.created_at >= v_today_start
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;

-- Check if streak milestone activity exists
CREATE OR REPLACE FUNCTION public.check_streak_milestone_exists(p_streak_days integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM activity_feed af
    WHERE af.user_id = v_user_id
      AND af.activity_type = 'streak_milestone'
      AND af.metadata->>'streakDays' = p_streak_days::text
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Activity feed functions
REVOKE EXECUTE ON FUNCTION public.get_activity_feed(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_activity_feed(integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_activity_feed_profiles(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_activity_feed_profiles(uuid[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_activity_feed_reactions(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_activity_feed_reactions(uuid[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_activity_owner(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_activity_owner(uuid) TO authenticated;

-- User search functions
REVOKE EXECUTE ON FUNCTION public.search_users_by_emails(text[], integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_users_by_emails(text[], integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.search_users_by_phones(text[], integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_users_by_phones(text[], integer) TO authenticated;

-- Invitation functions
REVOKE EXECUTE ON FUNCTION public.get_invitation_competition_id(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_invitation_competition_id(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_existing_invitation_invitees(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_existing_invitation_invitees(uuid, uuid[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_inviter_info(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_inviter_info(uuid) TO authenticated;

-- Blocked users (friendships) functions
REVOKE EXECUTE ON FUNCTION public.get_my_blocked_friendships() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_blocked_friendships() TO authenticated;

-- User fitness functions
REVOKE EXECUTE ON FUNCTION public.get_my_fitness_goals() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_fitness_goals() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_weight_settings() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_weight_settings() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.check_activity_exists_today(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_activity_exists_today(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.check_streak_milestone_exists(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_streak_milestone_exists(integer) TO authenticated;
