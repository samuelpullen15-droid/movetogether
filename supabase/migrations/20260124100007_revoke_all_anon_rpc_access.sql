-- =====================================================
-- Comprehensive RPC Lockdown
-- Revokes anonymous access from ALL public functions
-- This addresses: "Publicly accessible RPC" warnings
-- =====================================================

-- =====================================================
-- 1. REVOKE DEFAULT PRIVILEGES FOR FUTURE FUNCTIONS
-- Ensures new functions don't get anon access by default
-- =====================================================

ALTER DEFAULT PRIVILEGES IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- =====================================================
-- 2. REVOKE ANON ACCESS FROM ALL EXISTING FUNCTIONS
-- Uses DO block to iterate through all public functions
-- =====================================================

DO $$
DECLARE
  func_record RECORD;
BEGIN
  -- Revoke from all functions in public schema
  FOR func_record IN
    SELECT
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'  -- Only functions, not procedures
  LOOP
    BEGIN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
        func_record.function_name,
        func_record.args
      );
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC',
        func_record.function_name,
        func_record.args
      );
    EXCEPTION WHEN OTHERS THEN
      -- Skip if function doesn't exist or other issues
      RAISE NOTICE 'Could not revoke from %: %', func_record.function_name, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- =====================================================
-- 3. GRANT AUTHENTICATED ACCESS TO ALL EXISTING FUNCTIONS
-- Uses DO block to safely grant to all functions that exist
-- =====================================================

DO $$
DECLARE
  func_record RECORD;
BEGIN
  -- Grant authenticated access to all functions in public schema
  FOR func_record IN
    SELECT
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'  -- Only functions, not procedures
  LOOP
    BEGIN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
        func_record.function_name,
        func_record.args
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not grant to %: %', func_record.function_name, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- =====================================================
-- 4. VERIFY NO ANON ACCESS REMAINS
-- This query can be run to audit permissions
-- =====================================================

COMMENT ON FUNCTION public.are_friends IS 'Checks if two users are friends. Authenticated access only.';

-- =====================================================
-- NOTE: Run this query to audit remaining anon access:
--
-- SELECT
--   p.proname AS function_name,
--   pg_get_function_identity_arguments(p.oid) AS args
-- FROM pg_proc p
-- JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE n.nspname = 'public'
--   AND p.prokind = 'f'
--   AND has_function_privilege('anon', p.oid, 'EXECUTE');
-- =====================================================
