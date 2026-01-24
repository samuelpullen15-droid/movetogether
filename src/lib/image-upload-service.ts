import * as FileSystem from 'expo-file-system/legacy';
import { supabase, isSupabaseConfigured } from './supabase';
import { Platform } from 'react-native';

// Security constants
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Validate image file before upload
 * @param imageUri - Local URI of the image
 * @param mimeType - Optional mime type from image picker (preferred over extension detection)
 */
async function validateImage(
  imageUri: string,
  mimeType?: string | null
): Promise<{ valid: boolean; error?: string; fileSize?: number; extension?: string }> {
  console.log('[ImageUpload] Validating image:', { uri: imageUri?.substring(0, 80), mimeType });

  try {
    // Determine extension from mime type (preferred) or URI (fallback) first
    // Do this before file system checks since it doesn't require async operations
    let extension: string;

    if (mimeType && ALLOWED_MIME_TYPES.includes(mimeType)) {
      // Convert mime type to extension
      if (mimeType === 'image/jpeg') {
        extension = 'jpg';
      } else if (mimeType === 'image/png') {
        extension = 'png';
      } else if (mimeType === 'image/webp') {
        extension = 'webp';
      } else {
        extension = 'jpg'; // Default fallback for valid mime types
      }
      console.log('[ImageUpload] Extension from mimeType:', extension);
    } else {
      // Try to get extension from URI
      const uriExtension = imageUri.split('.').pop()?.toLowerCase() || '';

      if (ALLOWED_EXTENSIONS.includes(uriExtension)) {
        extension = uriExtension;
        console.log('[ImageUpload] Extension from URI:', extension);
      } else {
        // On iOS, photo library URIs often don't have extensions
        // Default to jpg for photos from the library
        console.log('[ImageUpload] No valid extension found, defaulting to jpg');
        extension = 'jpg';
      }
    }

    // Get file info - wrap in try-catch separately to provide better error info
    let fileInfo;
    try {
      fileInfo = await FileSystem.getInfoAsync(imageUri, { size: true });
      console.log('[ImageUpload] File info:', { exists: fileInfo.exists, size: (fileInfo as any).size });
    } catch (fileError) {
      console.error('[ImageUpload] FileSystem.getInfoAsync error:', fileError);
      // If we can't get file info, but we have a valid URI and mimeType, try to proceed anyway
      // This can happen with certain iOS photo library URIs
      if (mimeType && imageUri) {
        console.log('[ImageUpload] Proceeding without file size check due to FileSystem error');
        return { valid: true, fileSize: 0, extension };
      }
      return { valid: false, error: 'Unable to access image file. Please try selecting a different photo.' };
    }

    if (!fileInfo.exists) {
      console.log('[ImageUpload] File does not exist');
      return { valid: false, error: 'File does not exist' };
    }

    // Check file size
    const fileSize = (fileInfo as any).size || 0;
    console.log('[ImageUpload] File size:', fileSize);

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
      return {
        valid: false,
        error: `File too large (${sizeMB}MB). Maximum size is 5MB.`
      };
    }

    // Allow zero-size files if we have mimeType (iOS sometimes reports 0 for valid images)
    if (fileSize === 0 && !mimeType) {
      return { valid: false, error: 'File is empty' };
    }

    console.log('[ImageUpload] Validation successful:', { extension, fileSize });
    return { valid: true, fileSize, extension };
  } catch (error) {
    console.error('[ImageUpload] Validation error:', error);
    return { valid: false, error: 'Failed to validate image. Please try a different photo.' };
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
 * @param mimeType - Optional mime type from image picker (improves validation accuracy)
 * @returns Public URL of the uploaded image
 */
export async function uploadImageToSupabase(
  imageUri: string,
  userId: string,
  mimeType?: string | null
): Promise<{ success: boolean; url?: string; error?: string }> {
  console.log('[ImageUpload] Starting upload:', { userId, mimeType, uriStart: imageUri?.substring(0, 50) });

  if (!isSupabaseConfigured() || !supabase) {
    console.error('[ImageUpload] Supabase not configured');
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    // 1. Validate session
    console.log('[ImageUpload] Step 1: Validating session...');
    const sessionCheck = await supabase.auth.getSession();
    if (!sessionCheck.data.session) {
      console.error('[ImageUpload] No active session');
      return { success: false, error: 'No active session. Please sign in again.' };
    }
    console.log('[ImageUpload] Session valid');

    // 2. Verify the session user matches the userId parameter
    if (sessionCheck.data.session.user.id !== userId) {
      console.error('[ImageUpload] User ID mismatch - possible attack attempt');
      return { success: false, error: 'User ID mismatch. Please sign in again.' };
    }
    console.log('[ImageUpload] User ID verified');

    // 3. Check rate limit: 10 image uploads per hour
    console.log('[ImageUpload] Step 3: Checking rate limit...');
    let rateLimit;
    try {
      const { checkRateLimit, RATE_LIMITS } = await import('./rate-limit-service');
      rateLimit = await checkRateLimit(
        userId,
        'image-upload',
        RATE_LIMITS.IMAGE_UPLOAD.limit,
        RATE_LIMITS.IMAGE_UPLOAD.windowMinutes
      );
    } catch (rateLimitError) {
      console.error('[ImageUpload] Rate limit check failed:', rateLimitError);
      // Don't block upload if rate limit service fails, just log it
      rateLimit = { allowed: true };
    }

    if (!rateLimit.allowed) {
      console.log('[ImageUpload] Rate limit exceeded');
      return {
        success: false,
        error: rateLimit.error || 'Rate limit exceeded. Please try again later.'
      };
    }
    console.log('[ImageUpload] Rate limit OK');

    // 4. Validate the image (size, type)
    console.log('[ImageUpload] Step 4: Validating image...');
    const validation = await validateImage(imageUri, mimeType);
    if (!validation.valid) {
      console.error('[ImageUpload] Validation failed:', validation.error);
      return { success: false, error: validation.error };
    }
    console.log('[ImageUpload] Validation passed:', validation);

    const extension = validation.extension || 'jpg';

    // 5. Sanitize filename (prevent path traversal)
    const filePath = sanitizeFileName(userId, extension);
    console.log('[ImageUpload] Step 5: File path:', filePath);

    // 6. Read the file as base64
    console.log('[ImageUpload] Step 6: Reading file as base64...');
    let base64: string;
    try {
      base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      console.log('[ImageUpload] Base64 read successful, length:', base64.length);
    } catch (readError) {
      console.error('[ImageUpload] Failed to read file as base64:', readError);
      return { success: false, error: 'Unable to read image file. Please try a different photo.' };
    }

    // 7. Validate base64 isn't too large (double-check after encoding)
    const base64SizeBytes = (base64.length * 3) / 4; // Approximate decoded size
    console.log('[ImageUpload] Step 7: Base64 size check:', base64SizeBytes);
    if (base64SizeBytes > MAX_FILE_SIZE_BYTES * 1.5) { // Allow some overhead
      return { success: false, error: 'File too large after encoding' };
    }

    // 8. Convert base64 to Uint8Array for Supabase upload
    console.log('[ImageUpload] Step 8: Converting to byte array...');
    let byteArray: Uint8Array;
    try {
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      byteArray = new Uint8Array(byteNumbers);
      console.log('[ImageUpload] Byte array created, size:', byteArray.length);
    } catch (convertError) {
      console.error('[ImageUpload] Failed to convert base64:', convertError);
      return { success: false, error: 'Failed to process image. Please try a different photo.' };
    }

    // 9. Determine content type
    const contentType = extension === 'png'
      ? 'image/png'
      : extension === 'webp'
        ? 'image/webp'
        : 'image/jpeg';
    console.log('[ImageUpload] Step 9: Content type:', contentType);

    // 10. Validate content type is allowed
    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
      return { success: false, error: 'Invalid content type' };
    }

    // 11. Upload to Supabase Storage
    console.log('[ImageUpload] Step 11: Uploading to Supabase Storage...');
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
    console.log('[ImageUpload] Upload successful:', data);

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
