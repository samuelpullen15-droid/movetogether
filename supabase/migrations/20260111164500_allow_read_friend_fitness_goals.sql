-- Allow users to read friend fitness goals (for public profiles)
-- This allows viewing goals even when not in competitions together
-- Drop the existing policy that only allows reading own data
DROP POLICY IF EXISTS "Users can read own fitness data" ON "public"."user_fitness";

-- Create new policy that allows reading own data OR friend's data
CREATE POLICY "Users can read own or friends' fitness goals" ON "public"."user_fitness" 
  FOR SELECT 
  USING (
    -- Allow reading own data
    ("auth"."uid"() = "user_id")
    OR
    -- Allow reading friend's goals (if they are friends)
    ("public"."users_are_friends"("auth"."uid"(), "user_id"))
  );
