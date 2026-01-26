-- =====================================================
-- Audit Logging System
-- Comprehensive logging for sensitive data access/modifications
-- =====================================================

-- 1. Create audit_log table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'SELECT')),
  user_id UUID REFERENCES auth.users(id),
  old_data JSONB,
  new_data JSONB,
  changed_fields TEXT[],
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_log_table_name ON public.audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_record_id ON public.audit_log(record_id);

-- 2. Enable RLS on audit_log
-- =====================================================
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;

-- Only service_role can access audit logs (for admin dashboard)
-- Regular users cannot view audit logs
CREATE POLICY "Service role can manage audit logs"
ON public.audit_log FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Revoke all access from authenticated and anon
REVOKE ALL ON public.audit_log FROM authenticated;
REVOKE ALL ON public.audit_log FROM anon;

-- Grant to service_role only
GRANT ALL ON public.audit_log TO service_role;

-- 3. Create audit logging function
-- =====================================================
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_data JSONB;
  v_new_data JSONB;
  v_record_id UUID;
  v_changed_fields TEXT[];
  v_key TEXT;
BEGIN
  -- Get the record ID
  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id;
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id := NEW.id;
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := NEW.id;
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);

    -- Calculate changed fields
    FOR v_key IN SELECT jsonb_object_keys(v_new_data)
    LOOP
      IF v_old_data->v_key IS DISTINCT FROM v_new_data->v_key THEN
        v_changed_fields := array_append(v_changed_fields, v_key);
      END IF;
    END LOOP;
  END IF;

  -- Redact sensitive fields before logging
  IF v_old_data IS NOT NULL THEN
    v_old_data := v_old_data - 'password' - 'password_hash' - 'token' - 'access_token' - 'refresh_token' - 'secret';
  END IF;
  IF v_new_data IS NOT NULL THEN
    v_new_data := v_new_data - 'password' - 'password_hash' - 'token' - 'access_token' - 'refresh_token' - 'secret';
  END IF;

  -- Insert audit log entry
  INSERT INTO public.audit_log (
    table_name,
    record_id,
    action,
    user_id,
    old_data,
    new_data,
    changed_fields,
    created_at
  ) VALUES (
    TG_TABLE_NAME,
    v_record_id,
    TG_OP,
    auth.uid(),
    v_old_data,
    v_new_data,
    v_changed_fields,
    NOW()
  );

  -- Return appropriate value
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- 4. Create triggers on sensitive tables (only if they exist)
-- =====================================================

DO $$
BEGIN
  -- Profiles table (subscription changes, profile updates)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    DROP TRIGGER IF EXISTS audit_profiles ON public.profiles;
    CREATE TRIGGER audit_profiles
      AFTER INSERT OR UPDATE OR DELETE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
  END IF;

  -- Friendships table (friend connections)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'friendships') THEN
    DROP TRIGGER IF EXISTS audit_friendships ON public.friendships;
    CREATE TRIGGER audit_friendships
      AFTER INSERT OR UPDATE OR DELETE ON public.friendships
      FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
  END IF;

  -- Competitions table
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'competitions') THEN
    DROP TRIGGER IF EXISTS audit_competitions ON public.competitions;
    CREATE TRIGGER audit_competitions
      AFTER INSERT OR UPDATE OR DELETE ON public.competitions
      FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
  END IF;

  -- Competition participants
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'competition_participants') THEN
    DROP TRIGGER IF EXISTS audit_competition_participants ON public.competition_participants;
    CREATE TRIGGER audit_competition_participants
      AFTER INSERT OR UPDATE OR DELETE ON public.competition_participants
      FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
  END IF;

  -- User achievements (if exists)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_achievements') THEN
    DROP TRIGGER IF EXISTS audit_user_achievements ON public.user_achievements;
    CREATE TRIGGER audit_user_achievements
      AFTER INSERT OR UPDATE OR DELETE ON public.user_achievements
      FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
  END IF;

  -- Achievements table (if exists)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'achievements') THEN
    DROP TRIGGER IF EXISTS audit_achievements ON public.achievements;
    CREATE TRIGGER audit_achievements
      AFTER INSERT OR UPDATE OR DELETE ON public.achievements
      FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
  END IF;

  -- User activity (if exists)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_activity') THEN
    DROP TRIGGER IF EXISTS audit_user_activity ON public.user_activity;
    CREATE TRIGGER audit_user_activity
      AFTER INSERT OR UPDATE OR DELETE ON public.user_activity
      FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
  END IF;
END $$;

-- 5. Create helper functions for audit log queries
-- =====================================================

-- Get recent audit logs for a specific user (service_role only)
CREATE OR REPLACE FUNCTION public.get_user_audit_log(
  target_user_id UUID,
  limit_count INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  table_name TEXT,
  record_id UUID,
  action TEXT,
  old_data JSONB,
  new_data JSONB,
  changed_fields TEXT[],
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only service_role can call this
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND rolname = 'service_role'
  ) THEN
    -- Check if called via service_role by checking if we can query audit_log
    IF NOT EXISTS (SELECT 1 FROM public.audit_log LIMIT 1) THEN
      RAISE EXCEPTION 'Access denied: service_role required';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    al.id,
    al.table_name,
    al.record_id,
    al.action,
    al.old_data,
    al.new_data,
    al.changed_fields,
    al.created_at
  FROM public.audit_log al
  WHERE al.user_id = target_user_id
  ORDER BY al.created_at DESC
  LIMIT limit_count;
END;
$$;

-- Get audit logs for a specific record
CREATE OR REPLACE FUNCTION public.get_record_audit_log(
  target_table TEXT,
  target_record_id UUID,
  limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  action TEXT,
  user_id UUID,
  old_data JSONB,
  new_data JSONB,
  changed_fields TEXT[],
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    al.id,
    al.action,
    al.user_id,
    al.old_data,
    al.new_data,
    al.changed_fields,
    al.created_at
  FROM public.audit_log al
  WHERE al.table_name = target_table
    AND al.record_id = target_record_id
  ORDER BY al.created_at DESC
  LIMIT limit_count;
END;
$$;

-- Grant execute to service_role only
GRANT EXECUTE ON FUNCTION public.get_user_audit_log(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_record_audit_log(TEXT, UUID, INTEGER) TO service_role;

-- 6. Create audit log retention policy (cleanup old logs)
-- =====================================================
-- This function should be called periodically (e.g., via pg_cron or edge function)
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs(
  retention_days INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.audit_log
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$;

-- Only service_role can run cleanup
GRANT EXECUTE ON FUNCTION public.cleanup_old_audit_logs(INTEGER) TO service_role;

-- 7. Create view for audit log summary (for admin dashboard)
-- =====================================================
CREATE OR REPLACE VIEW public.audit_log_summary AS
SELECT
  table_name,
  action,
  DATE(created_at) as log_date,
  COUNT(*) as event_count
FROM public.audit_log
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY table_name, action, DATE(created_at)
ORDER BY log_date DESC, table_name, action;

-- Set security_invoker on the view
ALTER VIEW public.audit_log_summary SET (security_invoker = on);

-- Grant view access to service_role only
GRANT SELECT ON public.audit_log_summary TO service_role;
