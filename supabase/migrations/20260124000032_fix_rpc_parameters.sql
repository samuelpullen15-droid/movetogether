-- =====================================================
-- Fix RPC Function Parameters
-- Match actual table column names
-- =====================================================

-- 1. Fix notification_preferences RPC
-- =====================================================
DROP FUNCTION IF EXISTS public.upsert_my_notification_preferences;

CREATE OR REPLACE FUNCTION public.upsert_my_notification_preferences(
  p_competition_push boolean DEFAULT NULL,
  p_competition_email boolean DEFAULT NULL,
  p_friends_push boolean DEFAULT NULL,
  p_friends_email boolean DEFAULT NULL,
  p_achievements_push boolean DEFAULT NULL,
  p_coach_push boolean DEFAULT NULL,
  p_account_push boolean DEFAULT NULL,
  p_account_email boolean DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO notification_preferences (
    user_id, competition_push, competition_email, friends_push, friends_email,
    achievements_push, coach_push, account_push, account_email
  )
  VALUES (
    v_user_id,
    COALESCE(p_competition_push, true),
    COALESCE(p_competition_email, true),
    COALESCE(p_friends_push, true),
    COALESCE(p_friends_email, true),
    COALESCE(p_achievements_push, true),
    COALESCE(p_coach_push, true),
    COALESCE(p_account_push, true),
    COALESCE(p_account_email, true)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    competition_push = COALESCE(p_competition_push, notification_preferences.competition_push),
    competition_email = COALESCE(p_competition_email, notification_preferences.competition_email),
    friends_push = COALESCE(p_friends_push, notification_preferences.friends_push),
    friends_email = COALESCE(p_friends_email, notification_preferences.friends_email),
    achievements_push = COALESCE(p_achievements_push, notification_preferences.achievements_push),
    coach_push = COALESCE(p_coach_push, notification_preferences.coach_push),
    account_push = COALESCE(p_account_push, notification_preferences.account_push),
    account_email = COALESCE(p_account_email, notification_preferences.account_email),
    updated_at = NOW()
  WHERE notification_preferences.user_id = v_user_id
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_my_notification_preferences FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_my_notification_preferences TO authenticated;


-- 2. Fix privacy_settings RPC
-- =====================================================
DROP FUNCTION IF EXISTS public.upsert_my_privacy_settings;

CREATE OR REPLACE FUNCTION public.upsert_my_privacy_settings(
  p_profile_visibility text DEFAULT NULL,
  p_show_real_name_on_leaderboards boolean DEFAULT NULL,
  p_allow_find_by_email boolean DEFAULT NULL,
  p_show_activity_in_feed boolean DEFAULT NULL,
  p_show_on_public_leaderboards boolean DEFAULT NULL,
  p_show_detailed_stats boolean DEFAULT NULL,
  p_visible_metrics jsonb DEFAULT NULL,
  p_friend_request_visibility text DEFAULT NULL,
  p_competition_invite_visibility text DEFAULT NULL,
  p_analytics_opt_in boolean DEFAULT NULL
)
RETURNS uuid
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

  INSERT INTO privacy_settings (
    user_id, profile_visibility, show_real_name_on_leaderboards, allow_find_by_email,
    show_activity_in_feed, show_on_public_leaderboards, show_detailed_stats,
    visible_metrics, friend_request_visibility, competition_invite_visibility, analytics_opt_in
  )
  VALUES (
    v_user_id,
    COALESCE(p_profile_visibility, 'public')::profile_visibility_type,
    COALESCE(p_show_real_name_on_leaderboards, false),
    COALESCE(p_allow_find_by_email, true),
    COALESCE(p_show_activity_in_feed, true),
    COALESCE(p_show_on_public_leaderboards, true),
    COALESCE(p_show_detailed_stats, true),
    COALESCE(p_visible_metrics, '{"steps": true, "calories": true, "distance": true, "workouts": true, "active_minutes": true}'::jsonb),
    COALESCE(p_friend_request_visibility, 'everyone')::friend_request_visibility_type,
    COALESCE(p_competition_invite_visibility, 'everyone')::competition_invite_visibility_type,
    COALESCE(p_analytics_opt_in, true)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    profile_visibility = COALESCE(p_profile_visibility::profile_visibility_type, privacy_settings.profile_visibility),
    show_real_name_on_leaderboards = COALESCE(p_show_real_name_on_leaderboards, privacy_settings.show_real_name_on_leaderboards),
    allow_find_by_email = COALESCE(p_allow_find_by_email, privacy_settings.allow_find_by_email),
    show_activity_in_feed = COALESCE(p_show_activity_in_feed, privacy_settings.show_activity_in_feed),
    show_on_public_leaderboards = COALESCE(p_show_on_public_leaderboards, privacy_settings.show_on_public_leaderboards),
    show_detailed_stats = COALESCE(p_show_detailed_stats, privacy_settings.show_detailed_stats),
    visible_metrics = COALESCE(p_visible_metrics, privacy_settings.visible_metrics),
    friend_request_visibility = COALESCE(p_friend_request_visibility::friend_request_visibility_type, privacy_settings.friend_request_visibility),
    competition_invite_visibility = COALESCE(p_competition_invite_visibility::competition_invite_visibility_type, privacy_settings.competition_invite_visibility),
    analytics_opt_in = COALESCE(p_analytics_opt_in, privacy_settings.analytics_opt_in),
    updated_at = NOW()
  WHERE privacy_settings.user_id = v_user_id
  RETURNING user_id INTO v_user_id;

  RETURN v_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_my_privacy_settings FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_my_privacy_settings TO authenticated;


-- 3. Fix activity_reactions RPC (add emoji parameter name)
-- =====================================================
DROP FUNCTION IF EXISTS public.add_reaction(uuid, text);

CREATE OR REPLACE FUNCTION public.add_reaction(
  p_activity_id uuid,
  p_reaction_type text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_id uuid;
  v_activity_owner uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify activity exists and is viewable (check activity_feed, not user_activity)
  SELECT user_id INTO v_activity_owner
  FROM activity_feed
  WHERE id = p_activity_id;

  IF v_activity_owner IS NULL THEN
    RAISE EXCEPTION 'Activity not found';
  END IF;

  -- Allow reactions to own posts or friends' posts
  IF v_activity_owner != v_user_id AND NOT can_view_profile(v_user_id, v_activity_owner) THEN
    RAISE EXCEPTION 'Cannot react to this activity';
  END IF;

  -- Upsert reaction (update if same user+activity+reaction_type exists)
  INSERT INTO activity_reactions (activity_id, user_id, reaction_type)
  VALUES (p_activity_id, v_user_id, p_reaction_type)
  ON CONFLICT (activity_id, user_id, reaction_type) DO UPDATE SET
    created_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_reaction(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_reaction(uuid, text) TO authenticated;


-- 4. Fix remove_reaction to match app usage
-- =====================================================
DROP FUNCTION IF EXISTS public.remove_reaction(uuid);

CREATE OR REPLACE FUNCTION public.remove_reaction(
  p_activity_id uuid,
  p_reaction_type text
)
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

  DELETE FROM activity_reactions
  WHERE activity_id = p_activity_id
    AND user_id = v_user_id
    AND reaction_type = p_reaction_type;

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.remove_reaction(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.remove_reaction(uuid, text) TO authenticated;


-- 5. Add comment function
-- =====================================================
CREATE OR REPLACE FUNCTION public.add_comment(
  p_activity_id uuid,
  p_comment text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_id uuid;
  v_activity_owner uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify activity exists
  SELECT user_id INTO v_activity_owner
  FROM activity_feed
  WHERE id = p_activity_id;

  IF v_activity_owner IS NULL THEN
    RAISE EXCEPTION 'Activity not found';
  END IF;

  -- Allow comments to own posts or friends' posts
  IF v_activity_owner != v_user_id AND NOT can_view_profile(v_user_id, v_activity_owner) THEN
    RAISE EXCEPTION 'Cannot comment on this activity';
  END IF;

  INSERT INTO activity_reactions (activity_id, user_id, comment)
  VALUES (p_activity_id, v_user_id, p_comment)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_comment(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_comment(uuid, text) TO authenticated;
