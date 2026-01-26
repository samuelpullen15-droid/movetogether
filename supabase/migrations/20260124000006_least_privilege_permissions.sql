-- =====================================================
-- Least Privilege Permissions
-- Review and minimize database role permissions
-- =====================================================

-- 1. Revoke excessive anonymous access
-- =====================================================
-- Anonymous users should have minimal access

-- Revoke all default grants from anon on public schema
DO $$
DECLARE
  v_table RECORD;
BEGIN
  FOR v_table IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('schema_migrations')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v_table.tablename);
  END LOOP;
END $$;

-- Revoke sequence access from anon
DO $$
DECLARE
  v_seq RECORD;
BEGIN
  FOR v_seq IN
    SELECT sequencename
    FROM pg_sequences
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon', v_seq.sequencename);
  END LOOP;
END $$;

-- 2. Revoke function execute from anon (all public functions)
-- =====================================================
DO $$
DECLARE
  v_func RECORD;
BEGIN
  FOR v_func IN
    SELECT p.proname as function_name, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
        v_func.function_name, v_func.args);
    EXCEPTION WHEN OTHERS THEN
      -- Ignore errors for functions that don't have grants
      NULL;
    END;
  END LOOP;
END $$;

-- 3. Restrict authenticated role to minimum required permissions
-- =====================================================

-- Tables that authenticated users should NOT have direct write access to
-- (should go through RPC functions instead)
REVOKE INSERT, UPDATE, DELETE ON public.rate_limits FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.security_scan_results FROM authenticated;

-- 4. Create permission audit function
-- =====================================================
CREATE OR REPLACE FUNCTION public.audit_role_permissions()
RETURNS TABLE (
  role_name TEXT,
  object_type TEXT,
  schema_name TEXT,
  object_name TEXT,
  privilege_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  -- Table privileges
  SELECT
    tp.grantee::text as role_name,
    'table'::text as object_type,
    tp.table_schema::text as schema_name,
    tp.table_name::text as object_name,
    tp.privilege_type::text
  FROM information_schema.table_privileges tp
  WHERE tp.table_schema = 'public'
    AND tp.grantee IN ('anon', 'authenticated', 'service_role')

  UNION ALL

  -- Routine (function) privileges
  SELECT
    rp.grantee::text as role_name,
    'function'::text as object_type,
    rp.routine_schema::text as schema_name,
    rp.routine_name::text as object_name,
    rp.privilege_type::text
  FROM information_schema.routine_privileges rp
  WHERE rp.routine_schema = 'public'
    AND rp.grantee IN ('anon', 'authenticated', 'service_role')

  ORDER BY role_name, object_type, object_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_role_permissions() TO service_role;

-- 5. Create function to check for overly permissive grants
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_excessive_permissions()
RETURNS TABLE (
  severity TEXT,
  role_name TEXT,
  object_type TEXT,
  object_name TEXT,
  privilege_type TEXT,
  recommendation TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  -- Check for anon access to any table
  SELECT
    'high'::text as severity,
    tp.grantee::text as role_name,
    'table'::text as object_type,
    tp.table_name::text as object_name,
    tp.privilege_type::text,
    format('REVOKE %s ON public.%I FROM anon;', tp.privilege_type, tp.table_name)::text as recommendation
  FROM information_schema.table_privileges tp
  WHERE tp.table_schema = 'public'
    AND tp.grantee = 'anon'

  UNION ALL

  -- Check for authenticated DELETE on sensitive tables
  SELECT
    'medium'::text as severity,
    tp.grantee::text as role_name,
    'table'::text as object_type,
    tp.table_name::text as object_name,
    tp.privilege_type::text,
    format('Consider using RPC functions instead of direct %s on %s', tp.privilege_type, tp.table_name)::text as recommendation
  FROM information_schema.table_privileges tp
  WHERE tp.table_schema = 'public'
    AND tp.grantee = 'authenticated'
    AND tp.privilege_type IN ('DELETE', 'TRUNCATE')
    AND tp.table_name IN ('profiles', 'competitions', 'achievements')

  ORDER BY severity, role_name, object_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_excessive_permissions() TO service_role;

-- 6. Ensure sensitive tables are protected
-- =====================================================

-- Rate limits - only service_role
REVOKE ALL ON public.rate_limits FROM authenticated;
REVOKE ALL ON public.rate_limits FROM anon;
GRANT ALL ON public.rate_limits TO service_role;

-- Audit log - only service_role
REVOKE ALL ON public.audit_log FROM authenticated;
REVOKE ALL ON public.audit_log FROM anon;
GRANT ALL ON public.audit_log TO service_role;

-- Security scan results - only service_role
REVOKE ALL ON public.security_scan_results FROM authenticated;
REVOKE ALL ON public.security_scan_results FROM anon;
GRANT ALL ON public.security_scan_results TO service_role;

-- 7. Create default deny policy for new tables
-- =====================================================
-- This is a reminder/documentation - PostgreSQL doesn't have a "default deny" mechanism
-- but we can create a helper function to secure new tables

CREATE OR REPLACE FUNCTION public.secure_new_table(table_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Enable RLS
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

  -- Force RLS for owner
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);

  -- Revoke all from anon
  EXECUTE format('REVOKE ALL ON public.%I FROM anon', table_name);

  -- Log the action
  INSERT INTO public.audit_log (table_name, record_id, action, user_id, new_data)
  VALUES (
    'security_configuration',
    NULL,
    'INSERT',
    auth.uid(),
    jsonb_build_object('secured_table', table_name, 'action', 'secure_new_table')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.secure_new_table(TEXT) TO service_role;

-- 8. Document current security configuration
-- =====================================================
CREATE OR REPLACE VIEW public.security_configuration AS
SELECT
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls,
  (SELECT COUNT(*) FROM pg_policy p WHERE p.polrelid = c.oid) as policy_count,
  EXISTS (
    SELECT 1 FROM information_schema.table_privileges tp
    WHERE tp.table_name = c.relname AND tp.grantee = 'anon'
  ) as anon_has_access,
  EXISTS (
    SELECT 1 FROM information_schema.table_privileges tp
    WHERE tp.table_name = c.relname AND tp.grantee = 'authenticated'
  ) as authenticated_has_access
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT LIKE 'pg_%'
ORDER BY c.relname;

ALTER VIEW public.security_configuration SET (security_invoker = on);
GRANT SELECT ON public.security_configuration TO service_role;
