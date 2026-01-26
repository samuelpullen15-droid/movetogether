-- =====================================================
-- Privacy-Aware User Search Functions
-- Security Issue: search_users_by_emails and search_users_by_phones
-- expose users who have set profile_visibility to 'private'
-- =====================================================

-- =====================================================
-- 1. FIX search_users - respect profile visibility
-- =====================================================

DROP FUNCTION IF EXISTS public.search_users(text, integer);

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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.full_name, p.avatar_url, p.email, p.subscription_tier
  FROM profiles p
  LEFT JOIN privacy_settings ps ON ps.user_id = p.id
  WHERE p.id != v_user_id
    AND (
      lower(p.username) LIKE '%' || lower(p_query) || '%'
      OR lower(p.full_name) LIKE '%' || lower(p_query) || '%'
      OR p.phone_number LIKE '%' || p_query || '%'
    )
    -- Respect profile visibility: only show users who allow discovery
    AND (
      -- No privacy settings = public by default
      ps.user_id IS NULL
      -- Public profiles are always searchable
      OR COALESCE(ps.profile_visibility::text, 'public') = 'public'
      -- Friends-only profiles are searchable by friends
      OR (
        COALESCE(ps.profile_visibility::text, 'public') = 'friends_only'
        AND are_friends(v_user_id, p.id)
      )
      -- Private profiles are only searchable by existing friends
      OR (
        COALESCE(ps.profile_visibility::text, 'public') = 'private'
        AND are_friends(v_user_id, p.id)
      )
    )
    -- Exclude users who have blocked the searcher
    AND NOT EXISTS (
      SELECT 1 FROM friendships f
      WHERE f.user_id = p.id
        AND f.friend_id = v_user_id
        AND f.status = 'blocked'
    )
  ORDER BY
    -- Prioritize exact username matches
    CASE WHEN lower(p.username) = lower(p_query) THEN 0 ELSE 1 END,
    p.username
  LIMIT p_limit;
END;
$$;

-- =====================================================
-- 2. FIX search_users_by_emails - respect profile visibility
-- =====================================================

DROP FUNCTION IF EXISTS public.search_users_by_emails(text[], integer);

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
  LEFT JOIN privacy_settings ps ON ps.user_id = p.id
  WHERE p.id != v_user_id
    AND lower(p.email) = ANY(
      SELECT lower(unnest(p_emails))
    )
    -- Respect profile visibility
    AND (
      ps.user_id IS NULL
      OR COALESCE(ps.profile_visibility::text, 'public') = 'public'
      OR (
        COALESCE(ps.profile_visibility::text, 'public') = 'friends_only'
        AND are_friends(v_user_id, p.id)
      )
      OR (
        COALESCE(ps.profile_visibility::text, 'public') = 'private'
        AND are_friends(v_user_id, p.id)
      )
    )
    -- Exclude users who have blocked the searcher
    AND NOT EXISTS (
      SELECT 1 FROM friendships f
      WHERE f.user_id = p.id
        AND f.friend_id = v_user_id
        AND f.status = 'blocked'
    )
  LIMIT p_limit;
END;
$$;

-- =====================================================
-- 3. FIX search_users_by_phones - respect profile visibility
-- =====================================================

DROP FUNCTION IF EXISTS public.search_users_by_phones(text[], integer);

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
  LEFT JOIN privacy_settings ps ON ps.user_id = p.id
  WHERE p.id != v_user_id
    AND p.phone_number = ANY(p_phones)
    -- Respect profile visibility
    AND (
      ps.user_id IS NULL
      OR COALESCE(ps.profile_visibility::text, 'public') = 'public'
      OR (
        COALESCE(ps.profile_visibility::text, 'public') = 'friends_only'
        AND are_friends(v_user_id, p.id)
      )
      OR (
        COALESCE(ps.profile_visibility::text, 'public') = 'private'
        AND are_friends(v_user_id, p.id)
      )
    )
    -- Exclude users who have blocked the searcher
    AND NOT EXISTS (
      SELECT 1 FROM friendships f
      WHERE f.user_id = p.id
        AND f.friend_id = v_user_id
        AND f.status = 'blocked'
    )
  LIMIT p_limit;
END;
$$;

-- =====================================================
-- 4. STRENGTHEN audit function access controls
-- Ensure only service_role can access audit data
-- =====================================================

DROP FUNCTION IF EXISTS public.get_user_audit_log(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_user_audit_log(
  target_user_id UUID,
  limit_count INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  table_name TEXT,
  record_id UUID,
  action TEXT,
  old_data JSONB,
  new_data JSONB,
  changed_fields TEXT[],
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_role text;
BEGIN
  -- Get the current role
  SELECT current_setting('role', true) INTO v_current_role;

  -- Only allow service_role (used by Edge Functions and server-side code)
  -- This is more reliable than checking pg_roles
  IF v_current_role IS NULL OR v_current_role != 'service_role' THEN
    RAISE EXCEPTION 'Access denied: service_role required';
  END IF;

  RETURN QUERY
  SELECT
    al.id,
    al.table_name,
    al.record_id,
    al.action,
    al.old_data,
    al.new_data,
    al.changed_fields,
    al.created_at
  FROM audit_log al
  WHERE al.user_id = target_user_id
  ORDER BY al.created_at DESC
  LIMIT limit_count;
END;
$$;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

REVOKE EXECUTE ON FUNCTION public.search_users(text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_users(text, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.search_users_by_emails(text[], integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_users_by_emails(text[], integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.search_users_by_phones(text[], integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_users_by_phones(text[], integer) TO authenticated;

-- Audit functions - only service_role
REVOKE EXECUTE ON FUNCTION public.get_user_audit_log(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_audit_log(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_audit_log(uuid, integer) TO service_role;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON FUNCTION public.search_users(text, integer) IS
'Search for users by username, name, or phone. Respects profile_visibility privacy settings.
Private/friends-only profiles are only visible to friends.';

COMMENT ON FUNCTION public.search_users_by_emails(text[], integer) IS
'Search for users by email addresses (for contact sync). Respects profile_visibility privacy settings.
Private/friends-only profiles are only visible to friends.';

COMMENT ON FUNCTION public.search_users_by_phones(text[], integer) IS
'Search for users by phone numbers (for contact sync). Respects profile_visibility privacy settings.
Private/friends-only profiles are only visible to friends.';

COMMENT ON FUNCTION public.get_user_audit_log(uuid, integer) IS
'Returns audit log entries for a user. SERVICE_ROLE ONLY - used by Edge Functions for admin purposes.';
