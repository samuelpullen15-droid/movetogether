-- =====================================================
-- Fix has_active_suspension function
-- Was using non-existent columns: is_active, expires_at
-- Should use: lifted_at, ends_at, starts_at
-- =====================================================

DROP FUNCTION IF EXISTS public.has_active_suspension(uuid);

CREATE OR REPLACE FUNCTION public.has_active_suspension(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
BEGIN
  -- SECURITY: Only allow checking own suspension
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_auth_uid != p_user_id THEN
    RAISE EXCEPTION 'Cannot check suspension for another user';
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM account_suspensions
    WHERE user_id = p_user_id
      AND lifted_at IS NULL
      AND (ends_at IS NULL OR ends_at > NOW())
      AND starts_at <= NOW()
  );
END;
$$;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

REVOKE EXECUTE ON FUNCTION public.has_active_suspension(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_active_suspension(uuid) TO authenticated;
