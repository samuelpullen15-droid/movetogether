-- =====================================================
-- Lock Down Admin Functions to service_role Only
-- These are sensitive functions that should never be
-- called directly by authenticated users
-- =====================================================

-- apply_moderation_action - can ban/warn users
REVOKE EXECUTE ON FUNCTION public.apply_moderation_action(uuid, text, text, text, uuid, integer, uuid[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_moderation_action(uuid, text, text, text, uuid, integer, uuid[]) FROM anon;

-- audit_role_permissions - exposes security metadata
REVOKE EXECUTE ON FUNCTION public.audit_role_permissions() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_role_permissions() FROM anon;

-- secure_new_table - can modify table security
REVOKE EXECUTE ON FUNCTION public.secure_new_table(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.secure_new_table(text) FROM anon;

-- update_subscription_tier - already service_role only, but ensure
REVOKE EXECUTE ON FUNCTION public.update_subscription_tier(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_subscription_tier(uuid, text) FROM anon;
