import * as FileSystem from 'expo-file-system';
import { supabase, isSupabaseConfigured } from './supabase';
import { Platform } from 'react-native';

// Security constants
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Validate image file before upload
 */
async function validateImage(
  imageUri: string
): Promise<{ valid: boolean; error?: string; fileSize?: number; extension?: string }> {
  try {
    // Get file info
    const fileInfo = await FileSystem.getInfoAsync(imageUri, { size: true });
    
    if (!fileInfo.exists) {
      return { valid: false, error: 'File does not exist' };
    }

    // Check file size
    const fileSize = (fileInfo as any).size || 0;
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
      return { 
        valid: false, 
        error: `File too large (${sizeMB}MB). Maximum size is 5MB.` 
      };
    }

    if (fileSize === 0) {
      return { valid: false, error: 'File is empty' };
    }

    // Check file extension
    const extension = imageUri.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return { 
        valid: false, 
        error: `Invalid file type (.${extension}). Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}` 
      };
    }

    return { valid: true, fileSize, extension };
  } catch (error) {
    console.error('[ImageUpload] Validation error:', error);
    return { valid: false, error: 'Failed to validate image' };
  }
}

/**
 * Sanitize filename to prevent path traversal and special character issues
 */
function sanitizeFileName(userId: string, extension: string): string {
  // Use timestamp to ensure unique filenames and prevent caching issues
  const timestamp = Date.now();
  // Only allow alphanumeric characters in userId (prevent path traversal)
  const safeUserId = userId.replace(/[^a-zA-Z0-9-]/g, '');
  return `${safeUserId}/avatar_${timestamp}.${extension}`;
}

/**
 * Upload an image to Supabase Storage with security validations
 * @param imageUri - Local URI of the image to upload
 * @param userId - User ID to use as the file path
 * @returns Public URL of the uploaded image
 */
export async function uploadImageToSupabase(
  imageUri: string,
  userId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    // 1. Validate session
    const sessionCheck = await supabase.auth.getSession();
    if (!sessionCheck.data.session) {
      return { success: false, error: 'No active session. Please sign in again.' };
    }
    
    // 2. Verify the session user matches the userId parameter
    if (sessionCheck.data.session.user.id !== userId) {
      console.error('[ImageUpload] User ID mismatch - possible attack attempt');
      return { success: false, error: 'User ID mismatch. Please sign in again.' };
    }

    // 3. Check rate limit: 10 image uploads per hour
    const { checkRateLimit, RATE_LIMITS } = await import('./rate-limit-service');
    const rateLimit = await checkRateLimit(
      userId,
      'image-upload',
      RATE_LIMITS.IMAGE_UPLOAD.limit,
      RATE_LIMITS.IMAGE_UPLOAD.windowMinutes
    );

    if (!rateLimit.allowed) {
      return { 
        success: false, 
        error: rateLimit.error || 'Rate limit exceeded. Please try again later.' 
      };
    }

    // 4. Validate the image (size, type)
    const validation = await validateImage(imageUri);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const extension = validation.extension || 'jpg';
    
    // 5. Sanitize filename (prevent path traversal)
    const filePath = sanitizeFileName(userId, extension);

    // 6. Read the file as base64
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // 7. Validate base64 isn't too large (double-check after encoding)
    const base64SizeBytes = (base64.length * 3) / 4; // Approximate decoded size
    if (base64SizeBytes > MAX_FILE_SIZE_BYTES * 1.5) { // Allow some overhead
      return { success: false, error: 'File too large after encoding' };
    }

    // 8. Convert base64 to Uint8Array for Supabase upload
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);

    // 9. Determine content type
    const contentType = extension === 'png' 
      ? 'image/png' 
      : extension === 'webp' 
        ? 'image/webp' 
        : 'image/jpeg';

    // 10. Validate content type is allowed
    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
      return { success: false, error: 'Invalid content type' };
    }

    // 11. Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(filePath, byteArray, {
        contentType,
        upsert: true,
        cacheControl: '3600',
      });

    if (error) {
      console.error('[ImageUpload] Supabase upload error:', error);
      
      if (error.message?.includes('row-level security policy') || error.message?.includes('RLS')) {
        return { 
          success: false, 
          error: 'Storage permissions not configured. Please contact support.' 
        };
      }
      
      // Don't expose internal error details to user
      return { success: false, error: 'Failed to upload image. Please try again.' };
    }

    // 12. Get public URL
    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    if (!urlData?.publicUrl) {
      return { success: false, error: 'Failed to get image URL' };
    }

    console.log('[ImageUpload] Success:', urlData.publicUrl);
    return { success: true, url: urlData.publicUrl };
  } catch (error) {
    console.error('[ImageUpload] Unexpected error:', error);
    // Don't expose internal error details
    return { success: false, error: 'Failed to upload image. Please try again.' };
  }
}

/**
 * Delete a user's avatar from storage
 */
export async function deleteUserAvatar(userId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    // Verify session
    const sessionCheck = await supabase.auth.getSession();
    if (!sessionCheck.data.session || sessionCheck.data.session.user.id !== userId) {
      return { success: false, error: 'Unauthorized' };
    }

    // List files in user's folder
    const { data: files, error: listError } = await supabase.storage
      .from('avatars')
      .list(userId);

    if (listError) {
      console.error('[ImageUpload] List error:', listError);
      return { success: false, error: 'Failed to find avatar' };
    }

    if (!files || files.length === 0) {
      return { success: true }; // No files to delete
    }

    // Delete all files in user's folder
    const filePaths = files.map(file => `${userId}/${file.name}`);
    const { error: deleteError } = await supabase.storage
      .from('avatars')
      .remove(filePaths);

    if (deleteError) {
      console.error('[ImageUpload] Delete error:', deleteError);
      return { success: false, error: 'Failed to delete avatar' };
    }

    return { success: true };
  } catch (error) {
    console.error('[ImageUpload] Delete unexpected error:', error);
    return { success: false, error: 'Failed to delete avatar' };
  }
}
