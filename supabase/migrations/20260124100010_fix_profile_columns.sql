-- =====================================================
-- Fix get_my_profile to match actual schema
-- Errors: bio, phone, phone_verified don't exist
-- =====================================================

DROP FUNCTION IF EXISTS public.get_my_profile();

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  avatar_url text,
  username text,
  phone_number text,
  primary_device text,
  subscription_tier text,
  ai_messages_used integer,
  ai_messages_reset_at timestamptz,
  onboarding_completed boolean,
  pronouns text,
  terms_accepted_at timestamptz,
  privacy_accepted_at timestamptz,
  guidelines_accepted_at timestamptz,
  legal_agreement_version text,
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
    p.id,
    p.email,
    p.full_name,
    p.avatar_url,
    p.username,
    p.phone_number,
    p.primary_device,
    p.subscription_tier,
    p.ai_messages_used,
    p.ai_messages_reset_at,
    p.onboarding_completed,
    p.pronouns,
    p.terms_accepted_at,
    p.privacy_accepted_at,
    p.guidelines_accepted_at,
    p.legal_agreement_version,
    p.created_at,
    p.updated_at
  FROM profiles p
  WHERE p.id = v_user_id;
END;
$$;

-- =====================================================
-- Fix get_competition_participants - ensure numeric types
-- Still getting integer vs numeric error
-- =====================================================

DROP FUNCTION IF EXISTS public.get_competition_participants(uuid);

CREATE OR REPLACE FUNCTION public.get_competition_participants(p_competition_id uuid)
RETURNS TABLE (
  id uuid,
  competition_id uuid,
  user_id uuid,
  joined_at timestamptz,
  total_points numeric,
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
    SELECT 1 FROM competition_participants cp
    WHERE cp.competition_id = p_competition_id
      AND cp.user_id = v_user_id
  ) INTO v_is_participant;

  SELECT c.is_public INTO v_is_public
  FROM competitions c WHERE c.id = p_competition_id;

  IF NOT v_is_participant AND NOT COALESCE(v_is_public, false) THEN
    RAISE EXCEPTION 'Competition not accessible';
  END IF;

  RETURN QUERY
  SELECT
    cp.id,
    cp.competition_id,
    cp.user_id,
    cp.joined_at,
    cp.total_points::numeric,
    cp.rank,
    pr.full_name as user_full_name,
    pr.avatar_url as user_avatar_url,
    pr.username as user_username
  FROM competition_participants cp
  INNER JOIN profiles pr ON cp.user_id = pr.id
  WHERE cp.competition_id = p_competition_id
  ORDER BY cp.rank ASC NULLS LAST, cp.total_points DESC;
END;
$$;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_competition_participants(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_competition_participants(uuid) TO authenticated;
