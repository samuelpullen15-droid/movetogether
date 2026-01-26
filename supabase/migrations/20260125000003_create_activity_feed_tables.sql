-- =====================================================
-- Create Activity Feed Tables
-- These tables were referenced in code but never created
-- =====================================================

-- 1. Create activity_type enum
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type') THEN
    CREATE TYPE public.activity_type AS ENUM (
      'rings_closed',
      'workout_completed',
      'streak_milestone',
      'achievement_unlocked',
      'competition_won',
      'competition_joined',
      'personal_record'
    );
  END IF;
END $$;

-- 2. Create activity_feed table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_type public.activity_type NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for efficient feed queries
CREATE INDEX IF NOT EXISTS idx_activity_feed_user_id ON public.activity_feed(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_feed_created_at ON public.activity_feed(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_feed_user_created ON public.activity_feed(user_id, created_at DESC);

-- 3. Create activity_reactions table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.activity_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activity_feed(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  -- Each user can only have one reaction per activity
  UNIQUE(activity_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_reactions_activity_id ON public.activity_reactions(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_reactions_user_id ON public.activity_reactions(user_id);

-- 4. Create activity_comments table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.activity_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activity_feed(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_comments_activity_id ON public.activity_comments(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_comments_user_id ON public.activity_comments(user_id);

-- 5. Enable RLS on all tables
-- =====================================================
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_comments ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for activity_feed
-- =====================================================
-- Drop existing policies first to make migration idempotent
DROP POLICY IF EXISTS "Service role full access to activity_feed" ON public.activity_feed;
DROP POLICY IF EXISTS "Users can view own activities" ON public.activity_feed;
DROP POLICY IF EXISTS "Users can view friends activities" ON public.activity_feed;
DROP POLICY IF EXISTS "Users can insert own activities" ON public.activity_feed;

-- Service role full access (for Edge Functions)
CREATE POLICY "Service role full access to activity_feed"
ON public.activity_feed FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Users can view their own activities
CREATE POLICY "Users can view own activities"
ON public.activity_feed FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Users can view friends' activities (based on friendship)
CREATE POLICY "Users can view friends activities"
ON public.activity_feed FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
    AND (
      (f.user_id = auth.uid() AND f.friend_id = activity_feed.user_id)
      OR (f.friend_id = auth.uid() AND f.user_id = activity_feed.user_id)
    )
  )
);

-- Users can insert their own activities
CREATE POLICY "Users can insert own activities"
ON public.activity_feed FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- 7. RLS Policies for activity_reactions
-- =====================================================
-- Drop existing policies first to make migration idempotent
DROP POLICY IF EXISTS "Service role full access to activity_reactions" ON public.activity_reactions;
DROP POLICY IF EXISTS "Users can view reactions on visible activities" ON public.activity_reactions;
DROP POLICY IF EXISTS "Users can insert own reactions" ON public.activity_reactions;
DROP POLICY IF EXISTS "Users can update own reactions" ON public.activity_reactions;
DROP POLICY IF EXISTS "Users can delete own reactions" ON public.activity_reactions;

-- Service role full access
CREATE POLICY "Service role full access to activity_reactions"
ON public.activity_reactions FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Users can view reactions on visible activities
CREATE POLICY "Users can view reactions on visible activities"
ON public.activity_reactions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.activity_feed af
    WHERE af.id = activity_reactions.activity_id
    AND (
      af.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status = 'accepted'
        AND (
          (f.user_id = auth.uid() AND f.friend_id = af.user_id)
          OR (f.friend_id = auth.uid() AND f.user_id = af.user_id)
        )
      )
    )
  )
);

-- Users can insert their own reactions
CREATE POLICY "Users can insert own reactions"
ON public.activity_reactions FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can update their own reactions
CREATE POLICY "Users can update own reactions"
ON public.activity_reactions FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Users can delete their own reactions
CREATE POLICY "Users can delete own reactions"
ON public.activity_reactions FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- 8. RLS Policies for activity_comments
-- =====================================================
-- Drop existing policies first to make migration idempotent
DROP POLICY IF EXISTS "Service role full access to activity_comments" ON public.activity_comments;
DROP POLICY IF EXISTS "Users can view comments on visible activities" ON public.activity_comments;
DROP POLICY IF EXISTS "Users can insert own comments" ON public.activity_comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON public.activity_comments;

-- Service role full access
CREATE POLICY "Service role full access to activity_comments"
ON public.activity_comments FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Users can view comments on visible activities
CREATE POLICY "Users can view comments on visible activities"
ON public.activity_comments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.activity_feed af
    WHERE af.id = activity_comments.activity_id
    AND (
      af.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status = 'accepted'
        AND (
          (f.user_id = auth.uid() AND f.friend_id = af.user_id)
          OR (f.friend_id = auth.uid() AND f.user_id = af.user_id)
        )
      )
    )
  )
);

-- Users can insert their own comments
CREATE POLICY "Users can insert own comments"
ON public.activity_comments FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can delete their own comments
CREATE POLICY "Users can delete own comments"
ON public.activity_comments FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- 9. Grant table permissions
-- =====================================================
GRANT SELECT, INSERT ON public.activity_feed TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_reactions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.activity_comments TO authenticated;

GRANT ALL ON public.activity_feed TO service_role;
GRANT ALL ON public.activity_reactions TO service_role;
GRANT ALL ON public.activity_comments TO service_role;

-- Revoke from anon
REVOKE ALL ON public.activity_feed FROM anon;
REVOKE ALL ON public.activity_reactions FROM anon;
REVOKE ALL ON public.activity_comments FROM anon;
