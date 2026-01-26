-- =====================================================
-- Function to get a user's unlocked achievements
-- For displaying on friend profiles
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_user_achievements(p_user_id uuid)
RETURNS TABLE (
  achievement_id text,
  current_progress integer,
  bronze_unlocked_at timestamptz,
  silver_unlocked_at timestamptz,
  gold_unlocked_at timestamptz,
  platinum_unlocked_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow if viewing own data OR can view profile
  IF p_user_id = auth.uid() OR can_view_profile(auth.uid(), p_user_id) THEN
    RETURN QUERY
    SELECT
      uap.achievement_id,
      uap.current_progress,
      uap.bronze_unlocked_at,
      uap.silver_unlocked_at,
      uap.gold_unlocked_at,
      uap.platinum_unlocked_at
    FROM user_achievement_progress uap
    WHERE uap.user_id = p_user_id
      AND (
        uap.bronze_unlocked_at IS NOT NULL
        OR uap.silver_unlocked_at IS NOT NULL
        OR uap.gold_unlocked_at IS NOT NULL
        OR uap.platinum_unlocked_at IS NOT NULL
      );
  ELSE
    -- Return empty if not authorized
    RETURN;
  END IF;
END;
$$;

-- Grant execute to authenticated only
REVOKE EXECUTE ON FUNCTION public.get_user_achievements(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_achievements(uuid) TO authenticated;
