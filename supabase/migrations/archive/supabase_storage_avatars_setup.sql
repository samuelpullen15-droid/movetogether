-- ============================================
-- Set up Supabase Storage bucket and RLS policies for avatars
-- ============================================

-- Step 1: Create the 'avatars' bucket if it doesn't exist
-- Note: This must be done in the Supabase Dashboard under Storage
-- Go to Storage → Create Bucket → Name: "avatars" → Public: true

-- Step 2: Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public can read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete own avatars" ON storage.objects;

-- Step 3: Set up RLS policies for the avatars bucket
-- These policies allow authenticated users to upload, read, and manage their own avatar files

-- Policy: Authenticated users can upload files to their own folder
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Authenticated users can update their own avatar files
CREATE POLICY "Authenticated users can update own avatars"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Anyone can read avatar files (public bucket)
CREATE POLICY "Public can read avatars"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Policy: Authenticated users can delete their own avatar files
CREATE POLICY "Authenticated users can delete own avatars"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================
-- Verify the policies were created
-- ============================================
-- Run this query to check:
-- SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';
