-- =====================================================
-- Migration: Add block enforcement to can_view_profile
-- =====================================================
-- Adds bidirectional block check to the can_view_profile function.
-- If either user has blocked the other, profile access is denied.
-- This runs BEFORE privacy settings checks for early rejection.
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

    -- Block check: if either user has blocked the other, deny access
    IF EXISTS (
        SELECT 1 FROM friendships
        WHERE status = 'blocked'
        AND (
            (user_id = p_viewer_id AND friend_id = p_profile_id)
            OR (user_id = p_profile_id AND friend_id = p_viewer_id)
        )
    ) THEN
        RETURN false;
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
