-- =====================================================
-- CRITICAL: Lock Down Security Metadata Views
-- These expose RLS policy information - service_role only
-- =====================================================

-- security_configuration - exposes RLS policy details
REVOKE ALL ON public.security_configuration FROM anon;
REVOKE ALL ON public.security_configuration FROM authenticated;
GRANT SELECT ON public.security_configuration TO service_role;

-- security_scan_summary - exposes security scan results
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'security_scan_summary') THEN
    REVOKE ALL ON public.security_scan_summary FROM anon;
    REVOKE ALL ON public.security_scan_summary FROM authenticated;
    GRANT SELECT ON public.security_scan_summary TO service_role;
  END IF;
END $$;

-- security_scan_results - should already be service_role only, but ensure it
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'security_scan_results') THEN
    REVOKE ALL ON public.security_scan_results FROM anon;
    REVOKE ALL ON public.security_scan_results FROM authenticated;
    GRANT ALL ON public.security_scan_results TO service_role;
  END IF;
END $$;

-- Also revoke the security scan function from non-service roles
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.run_security_scan() FROM anon;
  REVOKE EXECUTE ON FUNCTION public.run_security_scan() FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.get_security_scan_results(uuid, text, integer) FROM anon;
  REVOKE EXECUTE ON FUNCTION public.get_security_scan_results(uuid, text, integer) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
