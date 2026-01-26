-- =====================================================
-- Revoke Anonymous Access to RPC Functions
-- All these functions require authentication
-- =====================================================

-- Revoke anon access from ALL public functions
-- This is the safest approach - anon should not call any app functions
DO $$
DECLARE
  v_func RECORD;
BEGIN
  FOR v_func IN
    SELECT p.proname as func_name,
           pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
        v_func.func_name, v_func.args);
    EXCEPTION WHEN OTHERS THEN
      -- Ignore errors (function may not have grants)
      NULL;
    END;
  END LOOP;
END $$;

-- =====================================================
-- Restrict admin/internal functions to service_role only
-- These should NOT be callable by regular authenticated users
-- =====================================================

-- Moderation functions
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.apply_moderation_action(uuid, text, text, text, integer) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- Competition management (internal scoring)
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.update_competition_standings(uuid) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.recalculate_competition_rankings(uuid) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.update_participant_totals(uuid) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.calculate_participant_points(uuid, uuid) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.update_competition_status() FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- Achievement management (server-side only)
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.update_achievement_progress(uuid, text, integer, integer, integer, integer, integer) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- Subscription management (server-side only)
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.update_subscription_tier(uuid, text) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- Rate limit internals
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.increment_report_count(text) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.check_report_rate_limit(text) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
