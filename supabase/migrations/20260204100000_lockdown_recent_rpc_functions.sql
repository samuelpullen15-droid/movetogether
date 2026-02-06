-- Lockdown RPC functions created in recent migrations that are missing
-- REVOKE statements. Per security policy: all functions should only be
-- executable by service_role.

-- From 20260202000000_referral_rewards_system.sql
REVOKE EXECUTE ON FUNCTION generate_referral_code() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION generate_referral_code() TO service_role;

REVOKE EXECUTE ON FUNCTION assign_referral_code() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION assign_referral_code() TO service_role;

REVOKE EXECUTE ON FUNCTION get_referral_stats(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_referral_stats(UUID) TO service_role;

-- From 20260203100000_create_dm_tables.sql
REVOKE EXECUTE ON FUNCTION enforce_dm_conversation_order() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION enforce_dm_conversation_order() TO service_role;

REVOKE EXECUTE ON FUNCTION update_dm_conversations_updated_at() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION update_dm_conversations_updated_at() TO service_role;

REVOKE EXECUTE ON FUNCTION update_dm_conversation_on_message() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION update_dm_conversation_on_message() TO service_role;

-- From 20260202100000_create_dormant_user_notification_system.sql
REVOKE EXECUTE ON FUNCTION cleanup_old_dormant_notification_logs() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_dormant_notification_logs() TO service_role;
