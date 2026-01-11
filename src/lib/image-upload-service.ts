import * as FileSystem from 'expo-file-system';
import { supabase, isSupabaseConfigured } from './supabase';
import { Platform } from 'react-native';

/**
 * Upload an image to Supabase Storage
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
    // Ensure we have a valid session before uploading
    const sessionCheck = await supabase.auth.getSession();
    if (!sessionCheck.data.session) {
      return { success: false, error: 'No active session. Please sign in again.' };
    }
    
    // Verify the session user matches the userId parameter
    if (sessionCheck.data.session.user.id !== userId) {
      return { success: false, error: 'User ID mismatch. Please sign in again.' };
    }
    
    // Get file extension from URI
    const fileExtension = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `avatar.${fileExtension}`;
    const filePath = `${userId}/${fileName}`; // Path: userId/avatar.jpg

    // Read the file as base64
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Convert base64 to Uint8Array for Supabase upload
    // Supabase Storage in React Native accepts Uint8Array, ArrayBuffer, or Blob
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);

    // Upload to Supabase Storage
    // Note: You'll need to create a 'avatars' bucket in Supabase Storage with public access
    // The bucket should allow authenticated users to upload
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(filePath, byteArray, {
        contentType: `image/${fileExtension}`,
        upsert: true, // Replace if exists
        cacheControl: '3600', // Cache for 1 hour
      });

    if (error) {
      console.error('Error uploading image to Supabase:', error);
      
      // Provide helpful error message for RLS policy errors
      if (error.message?.includes('row-level security policy') || error.message?.includes('RLS')) {
        return { 
          success: false, 
          error: 'Storage bucket RLS policies not configured. Please run the SQL script in supabase_storage_avatars_setup.sql in your Supabase SQL Editor.' 
        };
      }
      
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    if (!urlData?.publicUrl) {
      return { success: false, error: 'Failed to get public URL' };
    }

    console.log('Image uploaded successfully:', urlData.publicUrl);
    return { success: true, url: urlData.publicUrl };
  } catch (error) {
    console.error('Error in uploadImageToSupabase:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to upload image' 
    };
  }
}
