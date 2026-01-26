-- =====================================================
-- Consolidate INSERT Policies
-- Remove duplicate policies that bypass validation
-- =====================================================

-- 1. friendships - keep only the one with full validation
DROP POLICY IF EXISTS "Users can create own friend requests" ON public.friendships;
DROP POLICY IF EXISTS "Users can insert friendships" ON public.friendships;
DROP POLICY IF EXISTS "Users can send friend requests with privacy check" ON public.friendships;

CREATE POLICY "Users can send friend requests"
ON public.friendships FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND user_id <> friend_id
  AND public.can_send_friend_request(user_id, friend_id)
);

-- 2. user_fitness - ensure TO authenticated is set
DROP POLICY IF EXISTS "Users can insert own fitness data" ON public.user_fitness;

CREATE POLICY "Users can insert own fitness data"
ON public.user_fitness FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 3. privacy_settings - ensure TO authenticated is set
DROP POLICY IF EXISTS "Users can insert own privacy settings" ON public.privacy_settings;

CREATE POLICY "Users can insert own privacy settings"
ON public.privacy_settings FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 4. activity_reactions - add validation that the activity exists and is viewable
DROP POLICY IF EXISTS "Users can add reactions" ON public.activity_reactions;

CREATE POLICY "Users can add reactions"
ON public.activity_reactions FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.user_activity ua
    WHERE ua.id = activity_id
    AND (ua.user_id = auth.uid() OR public.can_view_profile(auth.uid(), ua.user_id))
  )
);
