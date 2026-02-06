-- ============================================================
-- Phase 6: Drop ALL RLS policies (deny-all enforcement)
-- ============================================================
--
-- SECURITY MODEL:
--   All data access now routes through Edge Functions using the
--   service_role key, which bypasses RLS by default.
--
--   With RLS enabled and NO policies, direct client queries
--   (anon/authenticated) return zero rows — deny-all.
--
--   This migration:
--   1. Drops every RLS policy on every public table
--   2. Keeps ALTER TABLE ... ENABLE ROW LEVEL SECURITY intact
--   3. Does NOT affect storage.objects policies (avatar uploads)
--
-- ROLLBACK: Not recommended. If needed, restore policies from
--   the previous migration files.
-- ============================================================

-- Programmatically drop ALL policies from all public tables
DO $$
DECLARE
  r RECORD;
  dropped_count INT := 0;
BEGIN
  FOR r IN (
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    RAISE NOTICE 'Dropped policy: "%" on %.%', r.policyname, r.schemaname, r.tablename;
    dropped_count := dropped_count + 1;
  END LOOP;

  RAISE NOTICE '=== Dropped % total RLS policies ===', dropped_count;
END $$;

-- ============================================================
-- Verify: Ensure RLS is still ENABLED on all key tables
-- (This is a safety net — RLS should already be enabled)
-- ============================================================

-- Core user tables
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_fitness ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_activity ENABLE ROW LEVEL SECURITY;
-- user_activity_aggregates is a VIEW, not a table — skip RLS
ALTER TABLE IF EXISTS public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.privacy_settings ENABLE ROW LEVEL SECURITY;

-- Competition tables
ALTER TABLE IF EXISTS public.competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.competition_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.competition_daily_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.competition_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.competition_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.competition_chat_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.competition_teams ENABLE ROW LEVEL SECURITY;

-- Achievement tables
ALTER TABLE IF EXISTS public.achievement_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_achievement_progress ENABLE ROW LEVEL SECURITY;

-- Health & fitness tables
ALTER TABLE IF EXISTS public.weight_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.weight_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.provider_tokens ENABLE ROW LEVEL SECURITY;

-- Streak & milestone tables
ALTER TABLE IF EXISTS public.streak_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_milestone_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.streak_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.streak_notification_log ENABLE ROW LEVEL SECURITY;

-- Subscription & AI tables
ALTER TABLE IF EXISTS public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_coach_messages ENABLE ROW LEVEL SECURITY;

-- Notification & push tables
ALTER TABLE IF EXISTS public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Social & DM tables
ALTER TABLE IF EXISTS public.dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dm_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activity_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activity_comments ENABLE ROW LEVEL SECURITY;

-- Trust & safety tables
ALTER TABLE IF EXISTS public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_moderation ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.report_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.account_warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.account_suspensions ENABLE ROW LEVEL SECURITY;

-- Rate limiting & misc tables
ALTER TABLE IF EXISTS public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dormant_notification_log ENABLE ROW LEVEL SECURITY;

-- Prize pool tables
ALTER TABLE IF EXISTS public.pending_prize_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prize_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prize_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prize_audit_log ENABLE ROW LEVEL SECURITY;
