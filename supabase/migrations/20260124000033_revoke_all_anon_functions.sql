-- =====================================================
-- Comprehensive: Revoke anon access from ALL public functions
-- This iterates through every function and revokes anon access
-- =====================================================

DO $$
DECLARE
  func_record RECORD;
BEGIN
  FOR func_record IN
    SELECT
      p.proname as func_name,
      pg_get_function_identity_arguments(p.oid) as func_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'  -- Only functions, not aggregates/procedures
  LOOP
    BEGIN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
        func_record.func_name,
        func_record.func_args
      );
      RAISE NOTICE 'Revoked anon from: %.%', func_record.func_name, func_record.func_args;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not revoke from %(%): %', func_record.func_name, func_record.func_args, SQLERRM;
    END;
  END LOOP;
END $$;

-- Also revoke from specific admin functions that authenticated users shouldn't call
-- These should ONLY be callable by service_role

-- Security/audit functions
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.run_security_scan() FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.get_security_scan_results(uuid, text, integer) FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.cleanup_old_security_scans() FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.audit_role_permissions() FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.check_excessive_permissions() FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.get_user_audit_log(uuid, integer) FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.get_record_audit_log(text, uuid, integer) FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.cleanup_old_audit_logs() FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.secure_new_table(text) FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- Moderation functions
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.apply_moderation_action(uuid, text, text, text, uuid, integer, uuid[]) FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- Competition internal functions
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.update_competition_standings(uuid) FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.recalculate_competition_rankings(uuid) FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.update_participant_totals(uuid) FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.calculate_participant_points(uuid, uuid) FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.update_competition_status() FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- Achievement internal functions
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.update_achievement_progress(uuid, text, integer, integer, integer, integer, integer) FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- Subscription management
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.update_subscription_tier(uuid, text) FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- Rate limit internals
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.increment_report_count(text) FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.check_report_rate_limit(text) FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.cleanup_fitness_rate_limits() FROM authenticated; EXCEPTION WHEN undefined_function THEN NULL; END $$;
