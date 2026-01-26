-- =====================================================
-- Secure Read Functions
-- Per security rules: Frontend should NEVER use .select() directly
-- All reads must go through SECURITY DEFINER RPC functions
-- =====================================================

-- 1. Get current user's privacy settings
CREATE OR REPLACE FUNCTION public.get_my_privacy_settings()
RETURNS TABLE (
  user_id uuid,
  profile_visibility text,
  show_real_name_on_leaderboards boolean,
  allow_find_by_email boolean,
  show_activity_in_feed boolean,
  show_on_public_leaderboards boolean,
  show_detailed_stats boolean,
  visible_metrics jsonb,
  friend_request_visibility text,
  competition_invite_visibility text,
  analytics_opt_in boolean,
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
    ps.user_id,
    ps.profile_visibility,
    ps.show_real_name_on_leaderboards,
    ps.allow_find_by_email,
    ps.show_activity_in_feed,
    ps.show_on_public_leaderboards,
    ps.show_detailed_stats,
    ps.visible_metrics,
    ps.friend_request_visibility,
    ps.competition_invite_visibility,
    ps.analytics_opt_in,
    ps.created_at,
    ps.updated_at
  FROM privacy_settings ps
  WHERE ps.user_id = v_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_privacy_settings() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_privacy_settings() TO authenticated;


-- 2. Get current user's notification preferences
CREATE OR REPLACE FUNCTION public.get_my_notification_preferences()
RETURNS TABLE (
  user_id uuid,
  competition_push boolean,
  competition_email boolean,
  friends_push boolean,
  friends_email boolean,
  achievements_push boolean,
  coach_push boolean,
  account_push boolean,
  account_email boolean,
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
    np.user_id,
    np.competition_push,
    np.competition_email,
    np.friends_push,
    np.friends_email,
    np.achievements_push,
    np.coach_push,
    np.account_push,
    np.account_email,
    np.created_at,
    np.updated_at
  FROM notification_preferences np
  WHERE np.user_id = v_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_notification_preferences() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_notification_preferences() TO authenticated;


-- 3. Revoke direct SELECT on these tables from authenticated users
-- (They must use the RPC functions instead)
REVOKE SELECT ON public.privacy_settings FROM authenticated;
REVOKE SELECT ON public.notification_preferences FROM authenticated;

-- Grant select back only for the functions (they use SECURITY DEFINER)
-- The functions run as the definer (postgres) so they can still read the tables
