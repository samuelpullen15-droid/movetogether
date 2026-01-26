-- =====================================================
-- Comprehensive RLS Lockdown
-- Enable RLS on all tables and revoke anon write access
-- =====================================================

-- 1. REVOKE ALL WRITE PERMISSIONS FROM ANON ROLE
-- =====================================================
-- This prevents any anonymous user from inserting, updating, or deleting data

DO $$
DECLARE
    tbl RECORD;
BEGIN
    -- Loop through all tables in public schema
    FOR tbl IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    LOOP
        -- Revoke INSERT, UPDATE, DELETE from anon
        EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', tbl.tablename);
    END LOOP;
END $$;

-- 2. ENABLE RLS ON ALL TABLES (if not already enabled)
-- =====================================================

DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename NOT IN ('schema_migrations') -- Skip system tables
    LOOP
        BEGIN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl.tablename);
            RAISE NOTICE 'Enabled RLS on %', tbl.tablename;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not enable RLS on % (may be a view or already enabled): %', tbl.tablename, SQLERRM;
        END;
    END LOOP;
END $$;

-- 3. FORCE RLS FOR TABLE OWNERS (prevent bypassing)
-- =====================================================

DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename NOT IN ('schema_migrations')
    LOOP
        BEGIN
            EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl.tablename);
        EXCEPTION WHEN OTHERS THEN
            -- Ignore errors for views
            NULL;
        END;
    END LOOP;
END $$;

-- 4. SPECIFIC TABLE POLICIES
-- =====================================================

-- user_activity: Users can only see own or friends' activity
DROP POLICY IF EXISTS "Users can view own activity" ON public.user_activity;
DROP POLICY IF EXISTS "Users can view friends activity" ON public.user_activity;
DROP POLICY IF EXISTS "Users can insert own activity" ON public.user_activity;
DROP POLICY IF EXISTS "Users can update own activity" ON public.user_activity;

CREATE POLICY "Users can view own activity"
ON public.user_activity FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can view friends activity"
ON public.user_activity FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
    AND ((f.user_id = auth.uid() AND f.friend_id = user_activity.user_id)
      OR (f.friend_id = auth.uid() AND f.user_id = user_activity.user_id))
  )
);

CREATE POLICY "Users can view competition participants activity"
ON public.user_activity FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.competition_participants cp1
    JOIN public.competition_participants cp2 ON cp1.competition_id = cp2.competition_id
    WHERE cp1.user_id = auth.uid()
    AND cp2.user_id = user_activity.user_id
  )
);

CREATE POLICY "Users can insert own activity"
ON public.user_activity FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own activity"
ON public.user_activity FOR UPDATE TO authenticated
USING (user_id = auth.uid());

-- user_activity_aggregates: Same pattern
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_activity_aggregates') THEN
    DROP POLICY IF EXISTS "Users can view own aggregates" ON public.user_activity_aggregates;
    DROP POLICY IF EXISTS "Users can view friends aggregates" ON public.user_activity_aggregates;
    DROP POLICY IF EXISTS "Users can insert own aggregates" ON public.user_activity_aggregates;
    DROP POLICY IF EXISTS "Users can update own aggregates" ON public.user_activity_aggregates;

    CREATE POLICY "Users can view own aggregates"
    ON public.user_activity_aggregates FOR SELECT TO authenticated
    USING (user_id = auth.uid());

    CREATE POLICY "Users can view friends aggregates"
    ON public.user_activity_aggregates FOR SELECT TO authenticated
    USING (can_view_profile(auth.uid(), user_id));

    CREATE POLICY "Users can insert own aggregates"
    ON public.user_activity_aggregates FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

    CREATE POLICY "Users can update own aggregates"
    ON public.user_activity_aggregates FOR UPDATE TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;

-- achievements table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'achievements') THEN
    DROP POLICY IF EXISTS "Users can view achievements" ON public.achievements;
    DROP POLICY IF EXISTS "Authenticated users can view achievements" ON public.achievements;
    CREATE POLICY "Authenticated users can view achievements"
    ON public.achievements FOR SELECT TO authenticated
    USING (true);
  END IF;
END $$;

-- user_achievements: Users can see own and friends' achievements
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_achievements') THEN
    DROP POLICY IF EXISTS "Users can view own achievements" ON public.user_achievements;
    DROP POLICY IF EXISTS "Users can view friends achievements" ON public.user_achievements;
    DROP POLICY IF EXISTS "Users can insert own achievements" ON public.user_achievements;
    DROP POLICY IF EXISTS "Users can update own achievements" ON public.user_achievements;

    CREATE POLICY "Users can view own achievements"
    ON public.user_achievements FOR SELECT TO authenticated
    USING (user_id = auth.uid());

    CREATE POLICY "Users can view friends achievements"
    ON public.user_achievements FOR SELECT TO authenticated
    USING (can_view_profile(auth.uid(), user_id));

    CREATE POLICY "Users can insert own achievements"
    ON public.user_achievements FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

    CREATE POLICY "Users can update own achievements"
    ON public.user_achievements FOR UPDATE TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;

-- friendships: Users can see their own friendships
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'friendships') THEN
    DROP POLICY IF EXISTS "Users can view own friendships" ON public.friendships;
    DROP POLICY IF EXISTS "Users can manage own friendships" ON public.friendships;
    DROP POLICY IF EXISTS "Users can insert friendships" ON public.friendships;
    DROP POLICY IF EXISTS "Users can update own friendships" ON public.friendships;
    DROP POLICY IF EXISTS "Users can delete own friendships" ON public.friendships;

    CREATE POLICY "Users can view own friendships"
    ON public.friendships FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR friend_id = auth.uid());

    CREATE POLICY "Users can insert friendships"
    ON public.friendships FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

    CREATE POLICY "Users can update own friendships"
    ON public.friendships FOR UPDATE TO authenticated
    USING (user_id = auth.uid() OR friend_id = auth.uid());

    CREATE POLICY "Users can delete own friendships"
    ON public.friendships FOR DELETE TO authenticated
    USING (user_id = auth.uid() OR friend_id = auth.uid());
  END IF;
END $$;

-- invitations: Users can see invitations they sent or received
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invitations') THEN
    DROP POLICY IF EXISTS "Users can view own invitations" ON public.invitations;
    DROP POLICY IF EXISTS "Users can create invitations" ON public.invitations;
    DROP POLICY IF EXISTS "Users can update own invitations" ON public.invitations;

    CREATE POLICY "Users can view own invitations"
    ON public.invitations FOR SELECT TO authenticated
    USING (inviter_id = auth.uid() OR invitee_id = auth.uid());

    CREATE POLICY "Users can create invitations"
    ON public.invitations FOR INSERT TO authenticated
    WITH CHECK (inviter_id = auth.uid());

    CREATE POLICY "Users can update own invitations"
    ON public.invitations FOR UPDATE TO authenticated
    USING (inviter_id = auth.uid() OR invitee_id = auth.uid());
  END IF;
END $$;

-- weight_goals: Users can only access their own
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'weight_goals') THEN
    DROP POLICY IF EXISTS "Users can view own weight goals" ON public.weight_goals;
    DROP POLICY IF EXISTS "Users can insert own weight goals" ON public.weight_goals;
    DROP POLICY IF EXISTS "Users can update own weight goals" ON public.weight_goals;
    DROP POLICY IF EXISTS "Users can delete own weight goals" ON public.weight_goals;

    CREATE POLICY "Users can view own weight goals"
    ON public.weight_goals FOR SELECT TO authenticated
    USING (user_id = auth.uid());

    CREATE POLICY "Users can insert own weight goals"
    ON public.weight_goals FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

    CREATE POLICY "Users can update own weight goals"
    ON public.weight_goals FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

    CREATE POLICY "Users can delete own weight goals"
    ON public.weight_goals FOR DELETE TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;

-- weight_entries: Users can only access their own
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'weight_entries') THEN
    DROP POLICY IF EXISTS "Users can view own weight entries" ON public.weight_entries;
    DROP POLICY IF EXISTS "Users can insert own weight entries" ON public.weight_entries;
    DROP POLICY IF EXISTS "Users can update own weight entries" ON public.weight_entries;
    DROP POLICY IF EXISTS "Users can delete own weight entries" ON public.weight_entries;

    CREATE POLICY "Users can view own weight entries"
    ON public.weight_entries FOR SELECT TO authenticated
    USING (user_id = auth.uid());

    CREATE POLICY "Users can insert own weight entries"
    ON public.weight_entries FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

    CREATE POLICY "Users can update own weight entries"
    ON public.weight_entries FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

    CREATE POLICY "Users can delete own weight entries"
    ON public.weight_entries FOR DELETE TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;

-- ai_coach_messages: Users can only access their own
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_coach_messages') THEN
    DROP POLICY IF EXISTS "Users can view own coach messages" ON public.ai_coach_messages;
    DROP POLICY IF EXISTS "Users can insert own coach messages" ON public.ai_coach_messages;

    CREATE POLICY "Users can view own coach messages"
    ON public.ai_coach_messages FOR SELECT TO authenticated
    USING (user_id = auth.uid());

    CREATE POLICY "Users can insert own coach messages"
    ON public.ai_coach_messages FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- notification_preferences: Users can only access their own
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notification_preferences') THEN
    DROP POLICY IF EXISTS "Users can view own notification preferences" ON public.notification_preferences;
    DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.notification_preferences;
    DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.notification_preferences;

    CREATE POLICY "Users can view own notification preferences"
    ON public.notification_preferences FOR SELECT TO authenticated
    USING (user_id = auth.uid());

    CREATE POLICY "Users can insert own notification preferences"
    ON public.notification_preferences FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

    CREATE POLICY "Users can update own notification preferences"
    ON public.notification_preferences FOR UPDATE TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;

-- push_tokens: Users can only access their own
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'push_tokens') THEN
    DROP POLICY IF EXISTS "Users can view own push tokens" ON public.push_tokens;
    DROP POLICY IF EXISTS "Users can insert own push tokens" ON public.push_tokens;
    DROP POLICY IF EXISTS "Users can update own push tokens" ON public.push_tokens;
    DROP POLICY IF EXISTS "Users can delete own push tokens" ON public.push_tokens;

    CREATE POLICY "Users can view own push tokens"
    ON public.push_tokens FOR SELECT TO authenticated
    USING (user_id = auth.uid());

    CREATE POLICY "Users can insert own push tokens"
    ON public.push_tokens FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

    CREATE POLICY "Users can update own push tokens"
    ON public.push_tokens FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

    CREATE POLICY "Users can delete own push tokens"
    ON public.push_tokens FOR DELETE TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;

-- subscriptions: Users can only access their own
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscriptions') THEN
    DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;
    DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.subscriptions;
    DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.subscriptions;

    CREATE POLICY "Users can view own subscriptions"
    ON public.subscriptions FOR SELECT TO authenticated
    USING (user_id = auth.uid());

    CREATE POLICY "Users can insert own subscriptions"
    ON public.subscriptions FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

    CREATE POLICY "Users can update own subscriptions"
    ON public.subscriptions FOR UPDATE TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;

-- chat_messages: Users can only see messages in competitions they're in
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'chat_messages') THEN
    DROP POLICY IF EXISTS "Users can view competition chat messages" ON public.chat_messages;
    DROP POLICY IF EXISTS "Users can send messages to their competitions" ON public.chat_messages;

    CREATE POLICY "Users can view competition chat messages"
    ON public.chat_messages FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.competition_participants cp
        WHERE cp.competition_id = chat_messages.competition_id
        AND cp.user_id = auth.uid()
      )
    );

    CREATE POLICY "Users can send messages to their competitions"
    ON public.chat_messages FOR INSERT TO authenticated
    WITH CHECK (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.competition_participants cp
        WHERE cp.competition_id = chat_messages.competition_id
        AND cp.user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- competition_chat_messages: Same pattern
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'competition_chat_messages') THEN
    DROP POLICY IF EXISTS "Users can view competition chat messages" ON public.competition_chat_messages;
    DROP POLICY IF EXISTS "Participants can view chat messages" ON public.competition_chat_messages;
    DROP POLICY IF EXISTS "Participants can send chat messages" ON public.competition_chat_messages;

    CREATE POLICY "Participants can view chat messages"
    ON public.competition_chat_messages FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.competition_participants cp
        WHERE cp.competition_id = competition_chat_messages.competition_id
        AND cp.user_id = auth.uid()
      )
    );

    CREATE POLICY "Participants can send chat messages"
    ON public.competition_chat_messages FOR INSERT TO authenticated
    WITH CHECK (
      sender_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.competition_participants cp
        WHERE cp.competition_id = competition_chat_messages.competition_id
        AND cp.user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- reports: Users can only see their own reports
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reports') THEN
    DROP POLICY IF EXISTS "Users can view own reports" ON public.reports;
    DROP POLICY IF EXISTS "Users can create reports" ON public.reports;

    CREATE POLICY "Users can view own reports"
    ON public.reports FOR SELECT TO authenticated
    USING (reporter_id = auth.uid());

    CREATE POLICY "Users can create reports"
    ON public.reports FOR INSERT TO authenticated
    WITH CHECK (reporter_id = auth.uid());
  END IF;
END $$;

-- 5. SERVICE ROLE POLICIES FOR ADMIN TABLES
-- =====================================================

-- Ensure service role has full access to rate_limits
DROP POLICY IF EXISTS "Service role full access to rate limits" ON public.rate_limits;
CREATE POLICY "Service role full access to rate limits"
ON public.rate_limits FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- 6. REVOKE SELECT FROM ANON ON SENSITIVE TABLES
-- =====================================================
-- Even for read-only, some tables should not be accessible to anon

DO $$
DECLARE
    sensitive_tables TEXT[] := ARRAY[
        'profiles',
        'user_activity',
        'user_activity_aggregates',
        'user_achievements',
        'friendships',
        'invitations',
        'weight_goals',
        'weight_entries',
        'ai_coach_messages',
        'provider_tokens',
        'push_tokens',
        'notification_preferences',
        'subscriptions',
        'rate_limits',
        'chat_messages',
        'competition_chat_messages',
        'reports'
    ];
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY sensitive_tables
    LOOP
        BEGIN
            EXECUTE format('REVOKE SELECT ON public.%I FROM anon', tbl);
            RAISE NOTICE 'Revoked SELECT from anon on %', tbl;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not revoke SELECT on % (may not exist): %', tbl, SQLERRM;
        END;
    END LOOP;
END $$;
