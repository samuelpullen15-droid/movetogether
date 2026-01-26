-- =====================================================
-- Lock Down Admin Views
-- These should ONLY be accessible by service_role
-- =====================================================

-- admin_pending_reports - contains sensitive report data
REVOKE ALL ON public.admin_pending_reports FROM anon;
REVOKE ALL ON public.admin_pending_reports FROM authenticated;
GRANT SELECT ON public.admin_pending_reports TO service_role;

-- admin_users_needing_review - contains sensitive user moderation data
REVOKE ALL ON public.admin_users_needing_review FROM anon;
REVOKE ALL ON public.admin_users_needing_review FROM authenticated;
GRANT SELECT ON public.admin_users_needing_review TO service_role;
