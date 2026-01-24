-- Privacy Enforcement Policies
-- Enforces privacy_settings across the application
-- Depends on: 20260123010000_create_privacy_settings.sql

-- ============================================================================
-- 1. RLS Policy for Friend Requests (friendships table with status='pending')
-- ============================================================================

-- Drop existing insert policy if it exists and create new one with privacy check
DROP POLICY IF EXISTS "Users can send friend requests" ON public.friendships;

CREATE POLICY "Users can send friend requests with privacy check"
    ON public.friendships
    FOR INSERT
    WITH CHECK (
        -- Must be the sender
        auth.uid() = user_id
        -- Must not be a self-friendship (already enforced by constraint, but double-check)
        AND user_id <> friend_id
        -- Check recipient's privacy settings
        AND can_send_friend_request(user_id, friend_id)
    );

-- ============================================================================
-- 2. RLS Policy for Competition Invitations
-- ============================================================================

-- Drop existing insert policy if it exists and create new one with privacy check
DROP POLICY IF EXISTS "Users can create competition invitations" ON public.competition_invitations;
DROP POLICY IF EXISTS "Users can invite to competitions" ON public.competition_invitations;

CREATE POLICY "Users can invite to competitions with privacy check"
    ON public.competition_invitations
    FOR INSERT
    WITH CHECK (
        -- Must be the inviter
        auth.uid() = inviter_id
        -- Must not invite yourself
        AND inviter_id <> invitee_id
        -- Check recipient's privacy settings
        AND can_send_competition_invite(inviter_id, invitee_id)
    );

-- ============================================================================
-- 3. Helper Function: Check if two users are friends
-- ============================================================================

CREATE OR REPLACE FUNCTION are_friends(user_a UUID, user_b UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.friendships
        WHERE status = 'accepted'
          AND (
              (user_id = user_a AND friend_id = user_b) OR
              (user_id = user_b AND friend_id = user_a)
          )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. Function: get_competition_leaderboard
-- Returns privacy-aware leaderboard data
-- ============================================================================

CREATE OR REPLACE FUNCTION get_competition_leaderboard(
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
) AS $$
BEGIN
    RETURN QUERY
    WITH ranked_participants AS (
        SELECT
            ROW_NUMBER() OVER (ORDER BY cp.total_points DESC, cp.joined_at ASC) AS rank,
            cp.user_id,
            p.full_name,
            p.username,
            p.avatar_url,
            cp.total_points AS score,
            cp.step_count AS steps,
            cp.move_calories AS calories,
            cp.exercise_minutes AS active_minutes,
            -- Get distance from user_activity for competition period
            COALESCE((
                SELECT SUM(ua.distance_meters)
                FROM public.user_activity ua
                JOIN public.competitions c ON c.id = p_competition_id
                WHERE ua.user_id = cp.user_id
                  AND ua.date >= c.start_date
                  AND ua.date <= c.end_date
            ), 0) AS distance,
            ps.show_real_name_on_leaderboards,
            ps.show_detailed_stats,
            ps.show_on_public_leaderboards,
            ps.visible_metrics
        FROM public.competition_participants cp
        JOIN public.profiles p ON p.id = cp.user_id
        LEFT JOIN public.privacy_settings ps ON ps.user_id = cp.user_id
        WHERE cp.competition_id = p_competition_id
    )
    SELECT
        rp.rank,
        rp.user_id,
        -- Display name logic: show real name only if allowed, otherwise username
        CASE
            WHEN rp.user_id = p_viewer_id THEN COALESCE(rp.full_name, rp.username, 'Anonymous')
            WHEN COALESCE(rp.show_real_name_on_leaderboards, false) THEN COALESCE(rp.full_name, rp.username, 'Anonymous')
            ELSE COALESCE(rp.username, 'Anonymous')
        END AS display_name,
        rp.avatar_url,
        rp.score,
        -- Steps: respect show_detailed_stats and visible_metrics
        CASE
            WHEN rp.user_id = p_viewer_id THEN rp.steps
            WHEN NOT COALESCE(rp.show_detailed_stats, true) THEN NULL
            WHEN NOT COALESCE((rp.visible_metrics->>'steps')::boolean, true) THEN NULL
            ELSE rp.steps
        END AS steps,
        -- Calories: respect show_detailed_stats and visible_metrics
        CASE
            WHEN rp.user_id = p_viewer_id THEN rp.calories
            WHEN NOT COALESCE(rp.show_detailed_stats, true) THEN NULL
            WHEN NOT COALESCE((rp.visible_metrics->>'calories')::boolean, true) THEN NULL
            ELSE rp.calories
        END AS calories,
        -- Active minutes: respect show_detailed_stats and visible_metrics
        CASE
            WHEN rp.user_id = p_viewer_id THEN rp.active_minutes
            WHEN NOT COALESCE(rp.show_detailed_stats, true) THEN NULL
            WHEN NOT COALESCE((rp.visible_metrics->>'active_minutes')::boolean, true) THEN NULL
            ELSE rp.active_minutes
        END AS active_minutes,
        -- Distance: respect show_detailed_stats and visible_metrics
        CASE
            WHEN rp.user_id = p_viewer_id THEN rp.distance
            WHEN NOT COALESCE(rp.show_detailed_stats, true) THEN NULL
            WHEN NOT COALESCE((rp.visible_metrics->>'distance')::boolean, true) THEN NULL
            ELSE rp.distance
        END AS distance
    FROM ranked_participants rp
    WHERE
        -- Include if: it's the viewer, or show_on_public_leaderboards is true (default)
        rp.user_id = p_viewer_id
        OR COALESCE(rp.show_on_public_leaderboards, true) = true
    ORDER BY rp.rank;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. Function: get_activity_feed
-- Returns privacy-aware activity feed
-- ============================================================================

CREATE OR REPLACE FUNCTION get_activity_feed(
    p_viewer_id UUID,
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
) AS $$
BEGIN
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
    FROM public.user_activity ua
    JOIN public.profiles p ON p.id = ua.user_id
    LEFT JOIN public.privacy_settings ps ON ps.user_id = ua.user_id
    WHERE
        -- Always include viewer's own activity
        ua.user_id = p_viewer_id
        OR (
            -- Check show_activity_in_feed (default true)
            COALESCE(ps.show_activity_in_feed, true) = true
            AND (
                -- Check profile_visibility
                CASE COALESCE(ps.profile_visibility, 'public')
                    WHEN 'public' THEN true
                    WHEN 'friends_only' THEN are_friends(p_viewer_id, ua.user_id)
                    WHEN 'private' THEN are_friends(p_viewer_id, ua.user_id)
                    ELSE true
                END
            )
            -- Exclude blocked users (check if activity owner blocked the viewer)
            AND NOT EXISTS (
                SELECT 1
                FROM public.friendships f
                WHERE f.status = 'blocked'
                  AND f.user_id = ua.user_id
                  AND f.friend_id = p_viewer_id
            )
        )
    ORDER BY ua.synced_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. Function: search_users
-- Returns privacy-aware user search results
-- ============================================================================

CREATE OR REPLACE FUNCTION search_users(
    p_searcher_id UUID,
    p_search_term TEXT,
    p_limit INT DEFAULT 20
)
RETURNS TABLE (
    user_id UUID,
    display_name TEXT,
    username TEXT,
    avatar_url TEXT,
    is_friend BOOLEAN,
    mutual_friends_count BIGINT
) AS $$
DECLARE
    is_email_search BOOLEAN;
    search_pattern TEXT;
BEGIN
    -- Check if search term looks like an email
    is_email_search := p_search_term LIKE '%@%';

    -- Create search pattern for ILIKE
    search_pattern := '%' || p_search_term || '%';

    RETURN QUERY
    SELECT
        p.id AS user_id,
        COALESCE(p.full_name, p.username, 'Anonymous') AS display_name,
        p.username,
        p.avatar_url,
        are_friends(p_searcher_id, p.id) AS is_friend,
        -- Count mutual friends
        (
            SELECT COUNT(*)
            FROM public.friendships f1
            WHERE f1.status = 'accepted'
              AND (f1.user_id = p_searcher_id OR f1.friend_id = p_searcher_id)
              AND EXISTS (
                  SELECT 1
                  FROM public.friendships f2
                  WHERE f2.status = 'accepted'
                    AND (
                        (f1.user_id = p_searcher_id AND f1.friend_id = f2.user_id AND f2.friend_id = p.id) OR
                        (f1.user_id = p_searcher_id AND f1.friend_id = f2.friend_id AND f2.user_id = p.id) OR
                        (f1.friend_id = p_searcher_id AND f1.user_id = f2.user_id AND f2.friend_id = p.id) OR
                        (f1.friend_id = p_searcher_id AND f1.user_id = f2.friend_id AND f2.user_id = p.id)
                    )
              )
        ) AS mutual_friends_count
    FROM public.profiles p
    LEFT JOIN public.privacy_settings ps ON ps.user_id = p.id
    WHERE
        -- Don't return the searcher
        p.id <> p_searcher_id
        -- Match search criteria
        AND (
            p.username ILIKE search_pattern
            OR p.full_name ILIKE search_pattern
            -- Only search by email if it looks like an email AND user allows it
            OR (
                is_email_search
                AND COALESCE(ps.allow_find_by_email, true) = true
                AND p.email ILIKE search_pattern
            )
        )
        -- Respect profile visibility
        AND (
            CASE COALESCE(ps.profile_visibility, 'public')
                WHEN 'public' THEN true
                WHEN 'friends_only' THEN are_friends(p_searcher_id, p.id)
                WHEN 'private' THEN are_friends(p_searcher_id, p.id)
                ELSE true
            END
        )
        -- Exclude users who have blocked the searcher
        AND NOT EXISTS (
            SELECT 1
            FROM public.friendships f
            WHERE f.status = 'blocked'
              AND f.user_id = p.id
              AND f.friend_id = p_searcher_id
        )
    ORDER BY
        -- Prioritize friends
        are_friends(p_searcher_id, p.id) DESC,
        -- Then by mutual friends count
        mutual_friends_count DESC,
        -- Then by username match quality
        CASE WHEN p.username ILIKE p_search_term THEN 0 ELSE 1 END,
        p.username
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. Grant execute permissions on new functions
-- ============================================================================

GRANT EXECUTE ON FUNCTION are_friends(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_competition_leaderboard(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_activity_feed(UUID, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION search_users(UUID, TEXT, INT) TO authenticated;

-- ============================================================================
-- 8. Helper function: can_view_profile
-- Used by client to check if viewer can see a user's full profile
-- ============================================================================

CREATE OR REPLACE FUNCTION can_view_profile(p_viewer_id UUID, p_profile_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    profile_vis public.profile_visibility_type;
BEGIN
    -- Users can always view their own profile
    IF p_viewer_id = p_profile_id THEN
        RETURN true;
    END IF;

    -- Get profile visibility setting
    SELECT profile_visibility INTO profile_vis
    FROM public.privacy_settings
    WHERE user_id = p_profile_id;

    -- Default to public if no settings
    IF profile_vis IS NULL THEN
        RETURN true;
    END IF;

    CASE profile_vis
        WHEN 'public' THEN
            RETURN true;
        WHEN 'friends_only' THEN
            RETURN are_friends(p_viewer_id, p_profile_id);
        WHEN 'private' THEN
            RETURN are_friends(p_viewer_id, p_profile_id);
    END CASE;

    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION can_view_profile(UUID, UUID) TO authenticated;

-- ============================================================================
-- 9. Helper function: get_user_privacy_summary
-- Returns a summary of what a viewer can see about a user
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_privacy_summary(p_viewer_id UUID, p_target_id UUID)
RETURNS TABLE (
    can_view_profile BOOLEAN,
    can_see_real_name BOOLEAN,
    can_see_detailed_stats BOOLEAN,
    can_see_activity BOOLEAN,
    can_send_friend_request BOOLEAN,
    can_send_competition_invite BOOLEAN,
    visible_metrics JSONB
) AS $$
DECLARE
    ps public.privacy_settings%ROWTYPE;
    is_self BOOLEAN;
    is_friend BOOLEAN;
BEGIN
    is_self := p_viewer_id = p_target_id;
    is_friend := are_friends(p_viewer_id, p_target_id);

    -- Get target's privacy settings
    SELECT * INTO ps
    FROM public.privacy_settings
    WHERE user_id = p_target_id;

    RETURN QUERY
    SELECT
        -- can_view_profile
        is_self OR is_friend OR COALESCE(ps.profile_visibility, 'public') = 'public',
        -- can_see_real_name (on leaderboards)
        is_self OR COALESCE(ps.show_real_name_on_leaderboards, false),
        -- can_see_detailed_stats
        is_self OR COALESCE(ps.show_detailed_stats, true),
        -- can_see_activity
        is_self OR (
            COALESCE(ps.show_activity_in_feed, true)
            AND (is_friend OR COALESCE(ps.profile_visibility, 'public') = 'public')
        ),
        -- can_send_friend_request
        NOT is_self AND NOT is_friend AND can_send_friend_request(p_viewer_id, p_target_id),
        -- can_send_competition_invite
        NOT is_self AND can_send_competition_invite(p_viewer_id, p_target_id),
        -- visible_metrics
        CASE
            WHEN is_self THEN '{"steps": true, "calories": true, "active_minutes": true, "distance": true, "workouts": true}'::jsonb
            WHEN NOT COALESCE(ps.show_detailed_stats, true) THEN '{"steps": false, "calories": false, "active_minutes": false, "distance": false, "workouts": false}'::jsonb
            ELSE COALESCE(ps.visible_metrics, '{"steps": true, "calories": true, "active_minutes": true, "distance": true, "workouts": true}'::jsonb)
        END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_user_privacy_summary(UUID, UUID) TO authenticated;
