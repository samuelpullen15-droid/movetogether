-- =====================================================
-- Lock Down Admin Views
-- These should ONLY be accessible by service_role
-- Wrapped in existence checks for idempotency
-- =====================================================

-- admin_pending_reports - contains sensitive report data
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'admin_pending_reports') THEN
    REVOKE ALL ON public.admin_pending_reports FROM anon;
    REVOKE ALL ON public.admin_pending_reports FROM authenticated;
    GRANT SELECT ON public.admin_pending_reports TO service_role;
  END IF;
END $$;

-- admin_users_needing_review - contains sensitive user moderation data
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'admin_users_needing_review') THEN
    REVOKE ALL ON public.admin_users_needing_review FROM anon;
    REVOKE ALL ON public.admin_users_needing_review FROM authenticated;
    GRANT SELECT ON public.admin_users_needing_review TO service_role;
  END IF;
END $$;
