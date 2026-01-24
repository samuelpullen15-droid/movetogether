-- Grant execute permissions for account status functions
-- These functions need to be callable by authenticated users

GRANT EXECUTE ON FUNCTION has_unacknowledged_warnings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION has_active_suspension(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unacknowledged_warning(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_suspension(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION acknowledge_warning(UUID) TO authenticated;
