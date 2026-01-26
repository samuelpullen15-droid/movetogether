-- =====================================================
-- Fix remaining policy inconsistencies
-- Ensure all policies explicitly target authenticated role
-- =====================================================

-- notification_preferences DELETE - add TO authenticated
DROP POLICY IF EXISTS "Users can delete own notification preferences" ON public.notification_preferences;

CREATE POLICY "Users can delete own notification preferences"
ON public.notification_preferences FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- provider_tokens - recreate to ensure consistency
DROP POLICY IF EXISTS "Users can insert own provider tokens" ON public.provider_tokens;
DROP POLICY IF EXISTS "Users can update own provider tokens" ON public.provider_tokens;
DROP POLICY IF EXISTS "Users can delete own provider tokens" ON public.provider_tokens;
DROP POLICY IF EXISTS "Users can view own provider tokens" ON public.provider_tokens;

CREATE POLICY "Users can view own provider tokens"
ON public.provider_tokens FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own provider tokens"
ON public.provider_tokens FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own provider tokens"
ON public.provider_tokens FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own provider tokens"
ON public.provider_tokens FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- notification_preferences - recreate to ensure consistency
DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can view own notification preferences" ON public.notification_preferences;

CREATE POLICY "Users can view own notification preferences"
ON public.notification_preferences FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own notification preferences"
ON public.notification_preferences FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own notification preferences"
ON public.notification_preferences FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
