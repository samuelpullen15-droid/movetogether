-- Migration: Create rate_limits table for rate limiting operations
-- This table tracks rate limits for various endpoints/operations

CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "user_id" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "endpoint" TEXT NOT NULL,
    "request_count" INTEGER DEFAULT 1 NOT NULL,
    "window_start" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create unique constraint to prevent duplicate rate limit records for same user/endpoint/window
-- This allows upsert operations
CREATE UNIQUE INDEX IF NOT EXISTS "rate_limits_user_endpoint_window_unique" 
ON "public"."rate_limits" ("user_id", "endpoint", "window_start");

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS "idx_rate_limits_user_endpoint" 
ON "public"."rate_limits" ("user_id", "endpoint", "window_start");

-- Enable RLS
ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own rate limit records
CREATE POLICY "Users can view own rate limits"
ON "public"."rate_limits"
FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own rate limit records
CREATE POLICY "Users can insert own rate limits"
ON "public"."rate_limits"
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own rate limit records
CREATE POLICY "Users can update own rate limits"
ON "public"."rate_limits"
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE "public"."rate_limits" IS 'Tracks rate limits for various user operations to prevent abuse';
