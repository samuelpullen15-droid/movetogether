-- =====================================================
-- Drop security_configuration view
-- Security audits should be done via Supabase dashboard/CLI
-- Not through database-accessible views
-- =====================================================

DROP VIEW IF EXISTS public.security_configuration;
