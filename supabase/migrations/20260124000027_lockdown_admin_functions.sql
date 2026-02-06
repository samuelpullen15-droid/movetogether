-- =====================================================
-- Lock Down Admin Functions to service_role Only
-- These are sensitive functions that should never be
-- called directly by authenticated users
-- Wrapped in exception handlers for idempotency
-- =====================================================

-- apply_moderation_action - can ban/warn users
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.apply_moderation_action(uuid, text, text, text, uuid, integer, uuid[]) FROM authenticated;
  REVOKE EXECUTE ON FUNCTION public.apply_moderation_action(uuid, text, text, text, uuid, integer, uuid[]) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- audit_role_permissions - exposes security metadata
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.audit_role_permissions() FROM authenticated;
  REVOKE EXECUTE ON FUNCTION public.audit_role_permissions() FROM anon;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- secure_new_table - can modify table security
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.secure_new_table(text) FROM authenticated;
  REVOKE EXECUTE ON FUNCTION public.secure_new_table(text) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- update_subscription_tier - already service_role only, but ensure
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.update_subscription_tier(uuid, text) FROM authenticated;
  REVOKE EXECUTE ON FUNCTION public.update_subscription_tier(uuid, text) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
