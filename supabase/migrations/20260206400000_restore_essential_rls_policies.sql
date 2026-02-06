-- ============================================================================
-- RESTORE ESSENTIAL RLS POLICIES
-- ============================================================================
-- The drop_all_rls_policies migration broke the auth flow because:
-- 1. The app still uses direct Supabase queries for some operations
-- 2. Without policies, those queries return empty results
-- 3. The app thinks the user is new and shows onboarding
--
-- This adds back the minimal policies needed for the auth flow to work.
-- ============================================================================

-- ============================================================================
-- PROFILES TABLE
-- ============================================================================
-- Users need to read/write their own profile for:
-- - Loading profile on app start
-- - Updating name, phone, avatar during onboarding
-- - Accepting legal agreements

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid());

-- Users can insert their own profile (handle_new_user trigger does this, but backup)
CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- ============================================================================
-- USER_FITNESS TABLE
-- ============================================================================
-- Users need to read/write their fitness settings for:
-- - Loading goals on app start
-- - Setting age, pronouns, birthday during onboarding

-- Users can view their own fitness data
CREATE POLICY "Users can view own fitness data"
ON public.user_fitness FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Users can insert their own fitness data
CREATE POLICY "Users can insert own fitness data"
ON public.user_fitness FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can update their own fitness data
CREATE POLICY "Users can update own fitness data"
ON public.user_fitness FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PRIVACY_SETTINGS TABLE
-- ============================================================================
-- Users need to manage their privacy settings

-- Users can view their own privacy settings
CREATE POLICY "Users can view own privacy settings"
ON public.privacy_settings FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Users can insert their own privacy settings
CREATE POLICY "Users can insert own privacy settings"
ON public.privacy_settings FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can update their own privacy settings
CREATE POLICY "Users can update own privacy settings"
ON public.privacy_settings FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- NOTIFICATION_PREFERENCES TABLE
-- ============================================================================
-- Users need to manage their notification preferences

-- Users can view their own notification preferences
CREATE POLICY "Users can view own notification preferences"
ON public.notification_preferences FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Users can insert their own notification preferences
CREATE POLICY "Users can insert own notification preferences"
ON public.notification_preferences FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can update their own notification preferences
CREATE POLICY "Users can update own notification preferences"
ON public.notification_preferences FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- USER_ACTIVITY TABLE
-- ============================================================================
-- Users need to read/write their activity data

-- Users can view their own activity
CREATE POLICY "Users can view own activity"
ON public.user_activity FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Users can insert their own activity
CREATE POLICY "Users can insert own activity"
ON public.user_activity FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can update their own activity
CREATE POLICY "Users can update own activity"
ON public.user_activity FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- SERVICE ROLE BYPASS
-- ============================================================================
-- Ensure service_role still has full access (it already does by default,
-- but this makes it explicit)

-- Note: service_role bypasses RLS by default, so no explicit policies needed
