-- Extend reporting system to support content reporting
-- Supports: user profiles, photos, activity posts, competition participants, chat messages

-- Create report_category enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_category') THEN
        CREATE TYPE report_category AS ENUM (
            'spam', 'harassment', 'cheating', 'inappropriate_content',
            'bullying', 'hate_speech', 'violence', 'impersonation',
            'explicit_content', 'misinformation', 'other'
        );
    END IF;
END $$;

-- Add content_type and content_id columns to reports table (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reports') THEN
        ALTER TABLE "public"."reports"
        ADD COLUMN IF NOT EXISTS "content_type" text,
        ADD COLUMN IF NOT EXISTS "content_id" text;
    END IF;
END $$;

-- Add CHECK constraint for content_type (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reports') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'reports_content_type_check'
        ) THEN
            ALTER TABLE "public"."reports"
            ADD CONSTRAINT reports_content_type_check
            CHECK (content_type IS NULL OR content_type IN ('profile', 'photo', 'post', 'competition', 'message'));
        END IF;
    END IF;
END $$;

-- Add new values to the report_category enum type (only if type exists and value missing)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_category') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'bullying' AND enumtypid = 'report_category'::regtype) THEN
            ALTER TYPE report_category ADD VALUE 'bullying';
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_category') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'hate_speech' AND enumtypid = 'report_category'::regtype) THEN
            ALTER TYPE report_category ADD VALUE 'hate_speech';
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_category') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'violence' AND enumtypid = 'report_category'::regtype) THEN
            ALTER TYPE report_category ADD VALUE 'violence';
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_category') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'impersonation' AND enumtypid = 'report_category'::regtype) THEN
            ALTER TYPE report_category ADD VALUE 'impersonation';
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_category') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'explicit_content' AND enumtypid = 'report_category'::regtype) THEN
            ALTER TYPE report_category ADD VALUE 'explicit_content';
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_category') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'misinformation' AND enumtypid = 'report_category'::regtype) THEN
            ALTER TYPE report_category ADD VALUE 'misinformation';
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_category') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'other' AND enumtypid = 'report_category'::regtype) THEN
            ALTER TYPE report_category ADD VALUE 'other';
        END IF;
    END IF;
END $$;

-- Create index for content-based queries (only if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reports') THEN
        CREATE INDEX IF NOT EXISTS idx_reports_content_type ON reports(content_type);
        CREATE INDEX IF NOT EXISTS idx_reports_content_id ON reports(content_id);
        CREATE INDEX IF NOT EXISTS idx_reports_content_lookup ON reports(content_type, content_id);
    END IF;
END $$;

-- Comment on new columns (only if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reports') THEN
        COMMENT ON COLUMN reports.content_type IS 'Type of content being reported: profile, photo, post, competition, message';
        COMMENT ON COLUMN reports.content_id IS 'ID of the specific content being reported (optional for user reports)';
    END IF;
END $$;
