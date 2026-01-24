-- Public Competition Discovery
-- Adds function to efficiently fetch public competitions for discovery

-- Add composite index for efficient public competition queries
CREATE INDEX IF NOT EXISTS idx_competitions_public_discovery
ON public.competitions (is_public, status, start_date DESC)
WHERE is_public = true AND status IN ('upcoming', 'active');

-- Function to fetch discoverable public competitions
-- Excludes competitions user is already participating in
CREATE OR REPLACE FUNCTION "public"."get_public_competitions"(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  start_date DATE,
  end_date DATE,
  type TEXT,
  status TEXT,
  scoring_type TEXT,
  participant_count BIGINT,
  creator_name TEXT,
  creator_avatar TEXT
)
LANGUAGE "plpgsql"
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.description,
    c.start_date,
    c.end_date,
    c.type,
    c.status,
    c.scoring_type,
    (SELECT COUNT(*) FROM public.competition_participants cp WHERE cp.competition_id = c.id) as participant_count,
    p.display_name as creator_name,
    p.avatar_url as creator_avatar
  FROM public.competitions c
  LEFT JOIN public.profiles p ON p.id = c.creator_id
  WHERE c.is_public = true
    AND c.status IN ('upcoming', 'active')
    AND NOT EXISTS (
      SELECT 1 FROM public.competition_participants cp2
      WHERE cp2.competition_id = c.id AND cp2.user_id = p_user_id
    )
  ORDER BY
    CASE WHEN c.status = 'active' THEN 0 ELSE 1 END,
    c.start_date ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION "public"."get_public_competitions"(UUID, INTEGER, INTEGER) TO authenticated;
