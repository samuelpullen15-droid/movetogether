-- =====================================================
-- Column-Level Security
-- Secure functions that hide sensitive columns when
-- viewing other users' data
-- =====================================================

-- 1. Secure function to get a user's public profile
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_user_profile(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  subscription_tier text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Own profile - return all public fields
  IF p_user_id = auth.uid() THEN
    RETURN QUERY
    SELECT
      p.id,
      p.username,
      p.full_name,
      p.avatar_url,
      p.subscription_tier,
      p.created_at
    FROM profiles p
    WHERE p.id = p_user_id;
  -- Friend's profile - only if can view
  ELSIF can_view_profile(auth.uid(), p_user_id) THEN
    RETURN QUERY
    SELECT
      p.id,
      p.username,
      p.full_name,
      p.avatar_url,
      p.subscription_tier,
      p.created_at
    FROM profiles p
    WHERE p.id = p_user_id;
  END IF;
  -- Returns empty if not authorized
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_profile(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_profile(uuid) TO authenticated;


-- 2. Secure function to get own full profile (includes sensitive data)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id uuid,
  email text,
  username text,
  full_name text,
  phone_number text,
  avatar_url text,
  subscription_tier text,
  ai_messages_used integer,
  ai_messages_reset_at timestamptz,
  onboarding_completed boolean,
  phone_verified boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.username,
    p.full_name,
    p.phone_number,
    p.avatar_url,
    p.subscription_tier,
    p.ai_messages_used,
    p.ai_messages_reset_at,
    p.onboarding_completed,
    p.phone_verified,
    p.created_at,
    p.updated_at
  FROM profiles p
  WHERE p.id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;


-- 3. Secure function to get a user's fitness goals (public portion only)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_user_fitness_public(p_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  move_goal integer,
  exercise_goal integer,
  stand_goal integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Own data or friend's data
  IF p_user_id = auth.uid() OR can_view_profile(auth.uid(), p_user_id) THEN
    RETURN QUERY
    SELECT
      uf.user_id,
      uf.move_goal,
      uf.exercise_goal,
      uf.stand_goal
    FROM user_fitness uf
    WHERE uf.user_id = p_user_id;
  END IF;
  -- Returns empty if not authorized
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_fitness_public(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_fitness_public(uuid) TO authenticated;


-- 4. Secure function to get own full fitness data (includes sensitive)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_my_fitness()
RETURNS TABLE (
  user_id uuid,
  move_goal integer,
  exercise_goal integer,
  stand_goal integer,
  height numeric,
  weight numeric,
  target_weight numeric,
  start_weight numeric,
  age integer,
  gender text,
  pronouns text,
  birthday date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    uf.user_id,
    uf.move_goal,
    uf.exercise_goal,
    uf.stand_goal,
    uf.height,
    uf.weight,
    uf.target_weight,
    uf.start_weight,
    uf.age,
    uf.gender,
    uf.pronouns,
    uf.birthday
  FROM user_fitness uf
  WHERE uf.user_id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_fitness() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_fitness() TO authenticated;


-- 5. Update profiles RLS to be more restrictive
-- Users should use get_user_profile() for friend data
-- =====================================================
DROP POLICY IF EXISTS "Users can view profiles with privacy check" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can check usernames" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Only allow viewing own profile directly
-- Friend profiles should go through get_user_profile()
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid());

-- Service role can view all (for edge functions)
CREATE POLICY "Service role can view all profiles"
ON public.profiles FOR SELECT TO service_role
USING (true);


-- 6. Update user_fitness RLS to be more restrictive
-- =====================================================
DROP POLICY IF EXISTS "Users can view own fitness data" ON public.user_fitness;
DROP POLICY IF EXISTS "Users can view own fitness" ON public.user_fitness;

-- Only allow viewing own data directly
-- Friend fitness should go through get_user_fitness_public()
CREATE POLICY "Users can view own fitness data"
ON public.user_fitness FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Service role can view all
CREATE POLICY "Service role can view all fitness data"
ON public.user_fitness FOR SELECT TO service_role
USING (true);
