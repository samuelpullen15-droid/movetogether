-- =====================================================
-- RLS Security Scan System
-- Automated security scanning for RLS policies
-- =====================================================

-- 1. Create security_scan_results table for storing scan results
-- =====================================================
CREATE TABLE IF NOT EXISTS public.security_scan_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL,
  scan_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  category TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_name TEXT NOT NULL,
  issue TEXT NOT NULL,
  recommendation TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_security_scan_scan_id ON public.security_scan_results(scan_id);
CREATE INDEX IF NOT EXISTS idx_security_scan_severity ON public.security_scan_results(severity);
CREATE INDEX IF NOT EXISTS idx_security_scan_created_at ON public.security_scan_results(created_at DESC);

-- Enable RLS - only service_role can access
ALTER TABLE public.security_scan_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_scan_results FORCE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages security scans"
ON public.security_scan_results FOR ALL TO service_role
USING (true) WITH CHECK (true);

REVOKE ALL ON public.security_scan_results FROM authenticated;
REVOKE ALL ON public.security_scan_results FROM anon;
GRANT ALL ON public.security_scan_results TO service_role;

-- 2. Create comprehensive security scan function
-- =====================================================
CREATE OR REPLACE FUNCTION public.run_security_scan()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scan_id UUID := gen_random_uuid();
  v_table RECORD;
  v_policy RECORD;
  v_function RECORD;
  v_grant RECORD;
BEGIN
  -- ===================================================
  -- CHECK 1: Tables without RLS enabled
  -- ===================================================
  FOR v_table IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('schema_migrations', 'security_scan_results', 'audit_log')
      AND tablename NOT LIKE 'pg_%'
  LOOP
    -- Check if RLS is enabled
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_table.tablename
        AND c.relrowsecurity = true
    ) THEN
      INSERT INTO public.security_scan_results (
        scan_id, scan_type, severity, category, object_type, object_name, issue, recommendation
      ) VALUES (
        v_scan_id,
        'rls_audit',
        'critical',
        'RLS Configuration',
        'table',
        v_table.tablename,
        'RLS is not enabled on this table',
        'Enable RLS with: ALTER TABLE public.' || v_table.tablename || ' ENABLE ROW LEVEL SECURITY;'
      );
    END IF;

    -- Check if FORCE RLS is enabled (prevents owner bypass)
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_table.tablename
        AND c.relforcerowsecurity = true
    ) AND EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_table.tablename
        AND c.relrowsecurity = true
    ) THEN
      INSERT INTO public.security_scan_results (
        scan_id, scan_type, severity, category, object_type, object_name, issue, recommendation
      ) VALUES (
        v_scan_id,
        'rls_audit',
        'medium',
        'RLS Configuration',
        'table',
        v_table.tablename,
        'FORCE RLS is not enabled - table owner can bypass RLS',
        'Enable FORCE RLS with: ALTER TABLE public.' || v_table.tablename || ' FORCE ROW LEVEL SECURITY;'
      );
    END IF;
  END LOOP;

  -- ===================================================
  -- CHECK 2: Overly permissive policies (USING (true))
  -- ===================================================
  FOR v_policy IN
    SELECT
      pol.polname as policy_name,
      c.relname as table_name,
      pg_get_expr(pol.polqual, pol.polrelid) as using_clause,
      CASE pol.polcmd
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
        WHEN '*' THEN 'ALL'
      END as command
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname NOT IN ('security_scan_results', 'audit_log', 'rate_limits')
  LOOP
    -- Check for overly permissive USING clause
    IF v_policy.using_clause = 'true' OR v_policy.using_clause IS NULL THEN
      INSERT INTO public.security_scan_results (
        scan_id, scan_type, severity, category, object_type, object_name, issue, recommendation, details
      ) VALUES (
        v_scan_id,
        'rls_audit',
        CASE WHEN v_policy.command = 'SELECT' THEN 'high' ELSE 'critical' END,
        'Permissive Policy',
        'policy',
        v_policy.table_name || '.' || v_policy.policy_name,
        'Policy uses USING (true) - allows unrestricted ' || v_policy.command || ' access',
        'Replace with a more restrictive policy that checks auth.uid() or related conditions',
        jsonb_build_object('command', v_policy.command, 'table', v_policy.table_name)
      );
    END IF;
  END LOOP;

  -- ===================================================
  -- CHECK 3: Anonymous role access to sensitive tables
  -- ===================================================
  FOR v_grant IN
    SELECT
      grantee,
      table_name,
      privilege_type
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND grantee = 'anon'
      AND table_name NOT IN ('security_scan_results')
  LOOP
    INSERT INTO public.security_scan_results (
      scan_id, scan_type, severity, category, object_type, object_name, issue, recommendation, details
    ) VALUES (
      v_scan_id,
      'rls_audit',
      'high',
      'Anonymous Access',
      'grant',
      v_grant.table_name,
      'Anonymous role has ' || v_grant.privilege_type || ' access to table',
      'Revoke access with: REVOKE ' || v_grant.privilege_type || ' ON public.' || v_grant.table_name || ' FROM anon;',
      jsonb_build_object('privilege', v_grant.privilege_type)
    );
  END LOOP;

  -- ===================================================
  -- CHECK 4: Tables with no policies (RLS enabled but no policies)
  -- ===================================================
  FOR v_table IN
    SELECT c.relname as table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND c.relname NOT IN ('security_scan_results', 'audit_log')
      AND NOT EXISTS (
        SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
      )
  LOOP
    INSERT INTO public.security_scan_results (
      scan_id, scan_type, severity, category, object_type, object_name, issue, recommendation
    ) VALUES (
      v_scan_id,
      'rls_audit',
      'critical',
      'Missing Policies',
      'table',
      v_table.table_name,
      'RLS is enabled but no policies exist - table is completely inaccessible',
      'Add appropriate RLS policies for this table'
    );
  END LOOP;

  -- ===================================================
  -- CHECK 5: SECURITY DEFINER functions without search_path
  -- ===================================================
  FOR v_function IN
    SELECT
      p.proname as function_name,
      pg_get_function_arguments(p.oid) as arguments
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND NOT (p.proconfig @> ARRAY['search_path=public'])
  LOOP
    INSERT INTO public.security_scan_results (
      scan_id, scan_type, severity, category, object_type, object_name, issue, recommendation
    ) VALUES (
      v_scan_id,
      'rls_audit',
      'medium',
      'Function Security',
      'function',
      v_function.function_name,
      'SECURITY DEFINER function without explicit search_path - vulnerable to search path attacks',
      'Add SET search_path = public to the function definition'
    );
  END LOOP;

  -- ===================================================
  -- CHECK 6: Views without security_invoker
  -- ===================================================
  FOR v_table IN
    SELECT viewname
    FROM pg_views
    WHERE schemaname = 'public'
      AND viewname NOT IN ('audit_log_summary')
  LOOP
    -- Check if security_invoker is set
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_table.viewname
        AND c.relkind = 'v'
        AND (
          SELECT (reloptions::text) LIKE '%security_invoker=on%' OR (reloptions::text) LIKE '%security_invoker=true%'
          FROM pg_class WHERE relname = v_table.viewname AND relnamespace = n.oid
        )
    ) THEN
      INSERT INTO public.security_scan_results (
        scan_id, scan_type, severity, category, object_type, object_name, issue, recommendation
      ) VALUES (
        v_scan_id,
        'rls_audit',
        'medium',
        'View Security',
        'view',
        v_table.viewname,
        'View does not use security_invoker - may bypass RLS of underlying tables',
        'Add: ALTER VIEW public.' || v_table.viewname || ' SET (security_invoker = on);'
      );
    END IF;
  END LOOP;

  RETURN v_scan_id;
END;
$$;

-- 3. Create function to get scan results
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_security_scan_results(
  p_scan_id UUID DEFAULT NULL,
  p_severity TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  scan_id UUID,
  severity TEXT,
  category TEXT,
  object_type TEXT,
  object_name TEXT,
  issue TEXT,
  recommendation TEXT,
  details JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ssr.id,
    ssr.scan_id,
    ssr.severity,
    ssr.category,
    ssr.object_type,
    ssr.object_name,
    ssr.issue,
    ssr.recommendation,
    ssr.details,
    ssr.created_at
  FROM public.security_scan_results ssr
  WHERE (p_scan_id IS NULL OR ssr.scan_id = p_scan_id)
    AND (p_severity IS NULL OR ssr.severity = p_severity)
  ORDER BY
    CASE ssr.severity
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
      ELSE 5
    END,
    ssr.created_at DESC
  LIMIT p_limit;
END;
$$;

-- 4. Create summary view
-- =====================================================
CREATE OR REPLACE VIEW public.security_scan_summary AS
SELECT
  scan_id,
  MIN(created_at) as scan_date,
  COUNT(*) FILTER (WHERE severity = 'critical') as critical_count,
  COUNT(*) FILTER (WHERE severity = 'high') as high_count,
  COUNT(*) FILTER (WHERE severity = 'medium') as medium_count,
  COUNT(*) FILTER (WHERE severity = 'low') as low_count,
  COUNT(*) as total_issues
FROM public.security_scan_results
GROUP BY scan_id
ORDER BY MIN(created_at) DESC;

ALTER VIEW public.security_scan_summary SET (security_invoker = on);

-- 5. Grant permissions
-- =====================================================
GRANT EXECUTE ON FUNCTION public.run_security_scan() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_security_scan_results(UUID, TEXT, INTEGER) TO service_role;
GRANT SELECT ON public.security_scan_summary TO service_role;

-- 6. Create cleanup function for old scan results
-- =====================================================
CREATE OR REPLACE FUNCTION public.cleanup_old_security_scans(
  retention_days INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.security_scan_results
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_old_security_scans(INTEGER) TO service_role;
