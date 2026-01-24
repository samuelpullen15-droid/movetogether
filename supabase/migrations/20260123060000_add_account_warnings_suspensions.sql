-- Account warnings and suspensions tables for moderation system
-- Used to track user violations and restrict account access

-- =========================================================================
-- ACCOUNT WARNINGS TABLE
-- =========================================================================
-- Tracks warnings issued to users for guideline violations
-- Users must acknowledge warnings before continuing to use the app

CREATE TABLE IF NOT EXISTS account_warnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    violation_type TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ DEFAULT NULL,
    issued_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    related_report_id UUID REFERENCES reports(id) ON DELETE SET NULL
);

-- Index for quick lookup of user warnings
CREATE INDEX IF NOT EXISTS idx_account_warnings_user_id ON account_warnings(user_id);
CREATE INDEX IF NOT EXISTS idx_account_warnings_unacknowledged ON account_warnings(user_id) WHERE acknowledged_at IS NULL;

-- Comments
COMMENT ON TABLE account_warnings IS 'Tracks warnings issued to users for community guideline violations';
COMMENT ON COLUMN account_warnings.violation_type IS 'Type of violation: harassment, inappropriate_content, spam, hate_speech, etc.';
COMMENT ON COLUMN account_warnings.details IS 'Specific details about the violation';
COMMENT ON COLUMN account_warnings.acknowledged_at IS 'When the user acknowledged the warning (null = not yet acknowledged)';
COMMENT ON COLUMN account_warnings.issued_by IS 'Admin user who issued the warning';
COMMENT ON COLUMN account_warnings.related_report_id IS 'The report that triggered this warning, if any';

-- RLS Policies for account_warnings
ALTER TABLE account_warnings ENABLE ROW LEVEL SECURITY;

-- Users can only read their own warnings
CREATE POLICY "Users can view own warnings"
    ON account_warnings FOR SELECT
    USING (auth.uid() = user_id);

-- Users can only update acknowledged_at on their own warnings
CREATE POLICY "Users can acknowledge own warnings"
    ON account_warnings FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- =========================================================================
-- ACCOUNT SUSPENSIONS TABLE
-- =========================================================================
-- Tracks account suspensions (temporary or permanent)
-- Suspended users cannot access the app

CREATE TABLE IF NOT EXISTS account_suspensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT,
    starts_at TIMESTAMPTZ DEFAULT NOW(),
    ends_at TIMESTAMPTZ DEFAULT NULL, -- NULL = permanent suspension
    created_at TIMESTAMPTZ DEFAULT NOW(),
    appealed_at TIMESTAMPTZ DEFAULT NULL,
    appeal_notes TEXT,
    appeal_status TEXT CHECK (appeal_status IN ('pending', 'approved', 'denied')) DEFAULT NULL,
    issued_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    lifted_at TIMESTAMPTZ DEFAULT NULL,
    lifted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    related_report_id UUID REFERENCES reports(id) ON DELETE SET NULL
);

-- Index for quick lookup of user suspensions
CREATE INDEX IF NOT EXISTS idx_account_suspensions_user_id ON account_suspensions(user_id);
-- Partial index for non-lifted suspensions (date filtering done at query time)
CREATE INDEX IF NOT EXISTS idx_account_suspensions_active ON account_suspensions(user_id, ends_at)
    WHERE lifted_at IS NULL;

-- Comments
COMMENT ON TABLE account_suspensions IS 'Tracks account suspensions for severe or repeated violations';
COMMENT ON COLUMN account_suspensions.reason IS 'Category of violation leading to suspension';
COMMENT ON COLUMN account_suspensions.details IS 'Specific details about why the account was suspended';
COMMENT ON COLUMN account_suspensions.starts_at IS 'When the suspension takes effect';
COMMENT ON COLUMN account_suspensions.ends_at IS 'When the suspension ends (NULL = permanent)';
COMMENT ON COLUMN account_suspensions.appealed_at IS 'When the user submitted an appeal';
COMMENT ON COLUMN account_suspensions.appeal_notes IS 'User-provided notes for the appeal';
COMMENT ON COLUMN account_suspensions.appeal_status IS 'Status of the appeal: pending, approved, denied';
COMMENT ON COLUMN account_suspensions.lifted_at IS 'When the suspension was lifted (if early release or appeal approved)';
COMMENT ON COLUMN account_suspensions.lifted_by IS 'Admin who lifted the suspension';

-- RLS Policies for account_suspensions
ALTER TABLE account_suspensions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own suspensions
CREATE POLICY "Users can view own suspensions"
    ON account_suspensions FOR SELECT
    USING (auth.uid() = user_id);

-- Users can only update appeal fields on their own suspensions
CREATE POLICY "Users can appeal own suspensions"
    ON account_suspensions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- =========================================================================
-- HELPER FUNCTIONS
-- =========================================================================

-- Function to check if user has unacknowledged warnings
CREATE OR REPLACE FUNCTION has_unacknowledged_warnings(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM account_warnings
        WHERE user_id = p_user_id
        AND acknowledged_at IS NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has active suspension
CREATE OR REPLACE FUNCTION has_active_suspension(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM account_suspensions
        WHERE user_id = p_user_id
        AND lifted_at IS NULL
        AND (ends_at IS NULL OR ends_at > NOW())
        AND starts_at <= NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get unacknowledged warning details
CREATE OR REPLACE FUNCTION get_unacknowledged_warning(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    violation_type TEXT,
    details TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT w.id, w.violation_type, w.details, w.created_at
    FROM account_warnings w
    WHERE w.user_id = p_user_id
    AND w.acknowledged_at IS NULL
    ORDER BY w.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get active suspension details
CREATE OR REPLACE FUNCTION get_active_suspension(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    reason TEXT,
    details TEXT,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    appealed_at TIMESTAMPTZ,
    appeal_status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.reason, s.details, s.starts_at, s.ends_at, s.appealed_at, s.appeal_status
    FROM account_suspensions s
    WHERE s.user_id = p_user_id
    AND s.lifted_at IS NULL
    AND (s.ends_at IS NULL OR s.ends_at > NOW())
    AND s.starts_at <= NOW()
    ORDER BY s.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to acknowledge a warning
CREATE OR REPLACE FUNCTION acknowledge_warning(p_warning_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Get the warning's user_id to verify ownership
    SELECT user_id INTO v_user_id
    FROM account_warnings
    WHERE id = p_warning_id;

    -- Verify the current user owns this warning
    IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
        RETURN FALSE;
    END IF;

    -- Update the warning
    UPDATE account_warnings
    SET acknowledged_at = NOW()
    WHERE id = p_warning_id
    AND acknowledged_at IS NULL;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
