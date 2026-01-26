-- =====================================================
-- Fix Competition Visibility Checks
-- Security Issue: get_competition_creator and get_competition_name
-- allow any authenticated user to access private competition info
-- =====================================================

-- =====================================================
-- 1. FIX get_competition_creator
-- Now requires: participant, creator, OR public competition
-- =====================================================

DROP FUNCTION IF EXISTS public.get_competition_creator(uuid);

CREATE OR REPLACE FUNCTION public.get_competition_creator(p_competition_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_creator_id uuid;
  v_is_public boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get competition info with visibility check
  SELECT c.creator_id, c.is_public
  INTO v_creator_id, v_is_public
  FROM competitions c
  WHERE c.id = p_competition_id;

  -- If not found, return null
  IF v_creator_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check visibility: public, creator, or participant
  IF NOT v_is_public
     AND v_creator_id != v_user_id
     AND NOT EXISTS (
       SELECT 1 FROM competition_participants cp
       WHERE cp.competition_id = p_competition_id AND cp.user_id = v_user_id
     ) THEN
    -- User doesn't have access - return null instead of raising exception
    -- to not reveal existence of private competition
    RETURN NULL;
  END IF;

  RETURN v_creator_id;
END;
$$;

-- =====================================================
-- 2. FIX get_competition_name
-- Now requires: participant, creator, OR public competition
-- =====================================================

DROP FUNCTION IF EXISTS public.get_competition_name(uuid);

CREATE OR REPLACE FUNCTION public.get_competition_name(p_competition_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text;
  v_creator_id uuid;
  v_is_public boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get competition info with visibility check
  SELECT c.name, c.creator_id, c.is_public
  INTO v_name, v_creator_id, v_is_public
  FROM competitions c
  WHERE c.id = p_competition_id;

  -- If not found, return null
  IF v_name IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check visibility: public, creator, or participant
  IF NOT COALESCE(v_is_public, false)
     AND v_creator_id != v_user_id
     AND NOT EXISTS (
       SELECT 1 FROM competition_participants cp
       WHERE cp.competition_id = p_competition_id AND cp.user_id = v_user_id
     ) THEN
    -- User doesn't have access - return null instead of raising exception
    -- to not reveal existence of private competition
    RETURN NULL;
  END IF;

  RETURN v_name;
END;
$$;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

REVOKE EXECUTE ON FUNCTION public.get_competition_creator(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_competition_creator(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_competition_name(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_competition_name(uuid) TO authenticated;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON FUNCTION public.get_competition_creator IS
'Returns the creator ID of a competition. Requires the caller to be a participant,
the creator, or the competition to be public. Returns NULL if not accessible.';

COMMENT ON FUNCTION public.get_competition_name IS
'Returns the name of a competition. Requires the caller to be a participant,
the creator, or the competition to be public. Returns NULL if not accessible.';
