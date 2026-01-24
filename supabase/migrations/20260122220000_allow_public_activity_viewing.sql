-- Allow any authenticated user to view basic activity data for profile viewing
-- This enables the friend-profile screen to show "Today's Activity" for any user

-- Create policy to allow authenticated users to view anyone's activity data
CREATE POLICY "Authenticated users can view activity data" ON "public"."user_activity"
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Note: This doesn't expose sensitive data - just move/exercise/stand metrics
-- which are meant to be visible in the social/competitive context of the app
