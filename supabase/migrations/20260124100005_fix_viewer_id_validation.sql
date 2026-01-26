-- =====================================================
-- Fix Viewer ID Parameter Validation
-- Security Issue: Functions accepting p_viewer_id without
-- validating it matches auth.uid() allow users to see
-- data as if they were other users.
-- =====================================================

-- =====================================================
-- 1. FIX get_user_privacy_summary
-- ISSUE: Allows checking what user B can see about user C
-- FIX: Require p_viewer_id = auth.uid()
-- =====================================================

DROP FUNCTION IF EXISTS public.get_user_privacy_summary(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_user_privacy_summary(p_viewer_id UUID, p_target_id UUID)
RETURNS TABLE (
    can_view_profile BOOLEAN,
    can_see_real_name BOOLEAN,
    can_see_detailed_stats BOOLEAN,
    can_see_activity BOOLEAN,
    can_send_friend_request BOOLEAN,
    can_send_competition_invite BOOLEAN,
    visible_metrics JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth_uid uuid := auth.uid();
    ps privacy_settings%ROWTYPE;
    is_self BOOLEAN;
    is_friend BOOLEAN;
BEGIN
    -- SECURITY: Validate that p_viewer_id matches the authenticated user
    IF v_auth_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_viewer_id != v_auth_uid THEN
        RAISE EXCEPTION 'Cannot check privacy summary for another viewer';
    END IF;

    is_self := p_viewer_id = p_target_id;
    is_friend := are_friends(p_viewer_id, p_target_id);

    -- Get target's privacy settings
    SELECT * INTO ps
    FROM privacy_settings
    WHERE user_id = p_target_id;

    RETURN QUERY
    SELECT
        -- can_view_profile
        is_self OR is_friend OR COALESCE(ps.profile_visibility::text, 'public') = 'public',
        -- can_see_real_name (on leaderboards)
        is_self OR COALESCE(ps.show_real_name_on_leaderboards, false),
        -- can_see_detailed_stats
        is_self OR (is_friend AND COALESCE(ps.show_detailed_stats, true)),
        -- can_see_activity
        is_self OR (
            is_friend
            AND COALESCE(ps.show_activity_in_feed, true)
        ),
        -- can_send_friend_request
        NOT is_self AND NOT is_friend AND can_send_friend_request(p_viewer_id, p_target_id),
        -- can_send_competition_invite
        NOT is_self AND can_send_competition_invite(p_viewer_id, p_target_id),
        -- visible_metrics
        CASE
            WHEN is_self THEN '{"steps": true, "calories": true, "active_minutes": true, "distance": true, "workouts": true}'::jsonb
            WHEN NOT is_friend THEN '{"steps": false, "calories": false, "active_minutes": false, "distance": false, "workouts": false}'::jsonb
            WHEN NOT COALESCE(ps.show_detailed_stats, true) THEN '{"steps": false, "calories": false, "active_minutes": false, "distance": false, "workouts": false}'::jsonb
            ELSE COALESCE(ps.visible_metrics, '{"steps": true, "calories": true, "active_minutes": true, "distance": true, "workouts": true}'::jsonb)
        END;
END;
$$;

-- =====================================================
-- 2. FIX get_competition_leaderboard
-- ISSUE: Allows seeing leaderboard as if you were another user
-- FIX: Require p_viewer_id = auth.uid()
-- =====================================================

DROP FUNCTION IF EXISTS public.get_competition_leaderboard(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_competition_leaderboard(
    p_competition_id UUID,
    p_viewer_id UUID
)
RETURNS TABLE (
    rank BIGINT,
    user_id UUID,
    display_name TEXT,
    avatar_url TEXT,
    score NUMERIC,
    steps INTEGER,
    calories INTEGER,
    active_minutes INTEGER,
    distance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth_uid uuid := auth.uid();
BEGIN
    -- SECURITY: Validate that p_viewer_id matches the authenticated user
    IF v_auth_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_viewer_id != v_auth_uid THEN
        RAISE EXCEPTION 'Cannot view leaderboard as another user';
    END IF;

    RETURN QUERY
    WITH ranked_participants AS (
        SELECT
            ROW_NUMBER() OVER (ORDER BY cp.total_points DESC, cp.joined_at ASC) AS rn,
            cp.user_id AS cp_user_id,
            p.full_name,
            p.username,
            p.avatar_url AS p_avatar_url,
            cp.total_points AS cp_score,
            cp.step_count AS cp_steps,
            cp.move_calories AS cp_calories,
            cp.exercise_minutes AS cp_active_minutes,
            COALESCE((
                SELECT SUM(ua.distance_meters)
                FROM user_activity ua
                JOIN competitions c ON c.id = p_competition_id
                WHERE ua.user_id = cp.user_id
                  AND ua.date >= c.start_date
                  AND ua.date <= c.end_date
            ), 0) AS cp_distance,
            ps.show_real_name_on_leaderboards,
            ps.show_detailed_stats,
            ps.show_on_public_leaderboards,
            ps.visible_metrics
        FROM competition_participants cp
        JOIN profiles p ON p.id = cp.user_id
        LEFT JOIN privacy_settings ps ON ps.user_id = cp.user_id
        WHERE cp.competition_id = p_competition_id
    )
    SELECT
        rp.rn AS rank,
        rp.cp_user_id AS user_id,
        CASE
            WHEN rp.cp_user_id = p_viewer_id THEN COALESCE(rp.full_name, rp.username, 'Anonymous')
            WHEN COALESCE(rp.show_real_name_on_leaderboards, false) THEN COALESCE(rp.full_name, rp.username, 'Anonymous')
            ELSE COALESCE(rp.username, 'Anonymous')
        END AS display_name,
        rp.p_avatar_url AS avatar_url,
        rp.cp_score AS score,
        CASE
            WHEN rp.cp_user_id = p_viewer_id THEN rp.cp_steps
            WHEN NOT COALESCE(rp.show_detailed_stats, true) THEN NULL
            WHEN NOT COALESCE((rp.visible_metrics->>'steps')::boolean, true) THEN NULL
            ELSE rp.cp_steps
        END AS steps,
        CASE
            WHEN rp.cp_user_id = p_viewer_id THEN rp.cp_calories
            WHEN NOT COALESCE(rp.show_detailed_stats, true) THEN NULL
            WHEN NOT COALESCE((rp.visible_metrics->>'calories')::boolean, true) THEN NULL
            ELSE rp.cp_calories
        END AS calories,
        CASE
            WHEN rp.cp_user_id = p_viewer_id THEN rp.cp_active_minutes
            WHEN NOT COALESCE(rp.show_detailed_stats, true) THEN NULL
            WHEN NOT COALESCE((rp.visible_metrics->>'active_minutes')::boolean, true) THEN NULL
            ELSE rp.cp_active_minutes
        END AS active_minutes,
        CASE
            WHEN rp.cp_user_id = p_viewer_id THEN rp.cp_distance
            WHEN NOT COALESCE(rp.show_detailed_stats, true) THEN NULL
            WHEN NOT COALESCE((rp.visible_metrics->>'distance')::boolean, true) THEN NULL
            ELSE rp.cp_distance
        END AS distance
    FROM ranked_participants rp
    WHERE
        rp.cp_user_id = p_viewer_id
        OR COALESCE(rp.show_on_public_leaderboards, true) = true
    ORDER BY rp.rn;
END;
$$;

-- =====================================================
-- 3. FIX get_activity_feed (the one with p_viewer_id)
-- NOTE: This may conflict with our newer get_activity_feed(integer)
-- Drop the vulnerable version if it exists
-- =====================================================

-- Check if the vulnerable 3-param version exists and drop it
DROP FUNCTION IF EXISTS public.get_activity_feed(uuid, integer, integer);

-- Create a secure version that uses auth.uid() internally
CREATE OR REPLACE FUNCTION public.get_privacy_filtered_activity_feed(
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    activity_id UUID,
    user_id UUID,
    display_name TEXT,
    username TEXT,
    avatar_url TEXT,
    activity_date DATE,
    move_calories INTEGER,
    exercise_minutes INTEGER,
    stand_hours INTEGER,
    step_count INTEGER,
    distance_meters NUMERIC,
    workouts_completed INTEGER,
    synced_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_viewer_id uuid := auth.uid();
BEGIN
    IF v_viewer_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    RETURN QUERY
    SELECT
        ua.id AS activity_id,
        ua.user_id,
        COALESCE(p.full_name, p.username, 'Anonymous') AS display_name,
        p.username,
        p.avatar_url,
        ua.date AS activity_date,
        ua.move_calories,
        ua.exercise_minutes,
        ua.stand_hours,
        ua.step_count,
        ua.distance_meters,
        ua.workouts_completed,
        ua.synced_at
    FROM user_activity ua
    JOIN profiles p ON p.id = ua.user_id
    LEFT JOIN privacy_settings ps ON ps.user_id = ua.user_id
    WHERE
        -- Always include viewer's own activity
        ua.user_id = v_viewer_id
        OR (
            -- Check show_activity_in_feed (default true)
            COALESCE(ps.show_activity_in_feed, true) = true
            AND (
                -- Check profile_visibility
                CASE COALESCE(ps.profile_visibility::text, 'public')
                    WHEN 'public' THEN true
                    WHEN 'friends_only' THEN are_friends(v_viewer_id, ua.user_id)
                    WHEN 'private' THEN are_friends(v_viewer_id, ua.user_id)
                    ELSE true
                END
            )
            -- Exclude blocked users
            AND NOT EXISTS (
                SELECT 1
                FROM friendships f
                WHERE f.status = 'blocked'
                  AND f.user_id = ua.user_id
                  AND f.friend_id = v_viewer_id
            )
        )
    ORDER BY ua.synced_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- =====================================================
-- 4. FIX can_view_profile helper
-- This is used internally but should still validate auth
-- when called directly
-- NOTE: Cannot DROP - used by RLS policies on activity_reactions
-- =====================================================

CREATE OR REPLACE FUNCTION public.can_view_profile(p_viewer_id UUID, p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_auth_uid uuid := auth.uid();
    v_privacy RECORD;
BEGIN
    -- SECURITY: When called directly, validate p_viewer_id matches auth.uid()
    -- This function may be called internally from other SECURITY DEFINER functions
    -- In that case, auth.uid() will still be set correctly
    IF v_auth_uid IS NOT NULL AND p_viewer_id != v_auth_uid THEN
        RAISE EXCEPTION 'Cannot check profile visibility for another viewer';
    END IF;

    -- Users can always view their own profile
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
    CASE v_privacy.profile_visibility::text
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

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

REVOKE EXECUTE ON FUNCTION public.get_user_privacy_summary(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_privacy_summary(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_competition_leaderboard(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_competition_leaderboard(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_privacy_filtered_activity_feed(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_privacy_filtered_activity_feed(integer, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_view_profile(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_profile(uuid, uuid) TO authenticated;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON FUNCTION public.get_user_privacy_summary IS
'Returns privacy summary for what the authenticated user can see about a target user.
SECURITY: p_viewer_id MUST match auth.uid() - prevents users from checking what
other users can see about third parties.';

COMMENT ON FUNCTION public.get_competition_leaderboard IS
'Returns privacy-filtered competition leaderboard.
SECURITY: p_viewer_id MUST match auth.uid() - prevents users from viewing
the leaderboard as if they were another user.';

COMMENT ON FUNCTION public.get_privacy_filtered_activity_feed IS
'Returns privacy-filtered activity feed for the authenticated user.
SECURITY: Uses auth.uid() internally - no viewer parameter to prevent spoofing.';

COMMENT ON FUNCTION public.can_view_profile IS
'Checks if a viewer can access a profile based on privacy settings.
SECURITY: When called directly, p_viewer_id MUST match auth.uid().';
