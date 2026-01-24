// src/hooks/usePhotoUpload.ts
//
// Hook for uploading photos with AI moderation
// All photos are reviewed server-side before being visible
// Rejected photos are blocked immediately

import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';

interface PhotoUploadResult {
  success: boolean;
  photoUrl?: string;
  error?: string;
  rejected?: boolean;
  rejectionReason?: string;
}

interface UsePhotoUploadOptions {
  bucket?: string;
  maxSizeMB?: number;
  onSuccess?: (url: string) => void;
  onRejected?: (reason: string) => void;
  onError?: (error: string) => void;
}

// Get Supabase URL from environment
const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;

export function usePhotoUpload(options: UsePhotoUploadOptions = {}) {
  const {
    bucket = 'avatars',
    maxSizeMB = 5,
    onSuccess,
    onRejected,
    onError,
  } = options;

  const user = useAuthStore((s) => s.user);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadPhoto = useCallback(async (
    imageUri: string,
    filename?: string
  ): Promise<PhotoUploadResult> => {
    if (!user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // =====================================================================
      // STEP 1: Read and validate the image
      // =====================================================================

      const fileInfo = await FileSystem.getInfoAsync(imageUri);
      if (!fileInfo.exists) {
        throw new Error('Image file not found');
      }

      const fileSizeMB = ((fileInfo as any).size || 0) / (1024 * 1024);
      if (fileSizeMB > maxSizeMB) {
        throw new Error(`Image too large (max ${maxSizeMB}MB)`);
      }

      setUploadProgress(10);

      // Read image as base64
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      setUploadProgress(30);

      // =====================================================================
      // STEP 2: Generate temporary URL and file path
      // =====================================================================

      const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `${user.id}/${filename || `photo_${Date.now()}`}.${fileExt}`;
      const tempUrl = `temp://${filePath}`; // Placeholder until actual upload

      setUploadProgress(40);

      // =====================================================================
      // STEP 3: Send to AI moderation BEFORE uploading to storage
      // =====================================================================

      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const moderationResponse = await fetch(
        `${SUPABASE_URL}/functions/v1/review-photo`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            user_id: user.id,
            photo_url: tempUrl,
            photo_base64: base64,
          }),
        }
      );

      setUploadProgress(60);

      if (!moderationResponse.ok) {
        throw new Error('Photo review failed');
      }

      const moderationResult = await moderationResponse.json();

      // =====================================================================
      // STEP 4: Handle rejection
      // =====================================================================

      if (!moderationResult.approved) {
        const reason = moderationResult.reason || 'This photo violates our community guidelines';
        
        onRejected?.(reason);
        
        return {
          success: false,
          rejected: true,
          rejectionReason: reason,
        };
      }

      setUploadProgress(70);

      // =====================================================================
      // STEP 5: Upload to Supabase Storage (only if approved)
      // =====================================================================

      // Decode base64 to array buffer for upload
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, bytes, {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      setUploadProgress(90);

      // =====================================================================
      // STEP 6: Get public URL
      // =====================================================================

      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      const photoUrl = urlData.publicUrl;

      setUploadProgress(100);

      onSuccess?.(photoUrl);

      return {
        success: true,
        photoUrl,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      onError?.(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [user, bucket, maxSizeMB, onSuccess, onRejected, onError]);

  // Convenience method to pick and upload from camera roll
  const pickAndUpload = useCallback(async (): Promise<PhotoUploadResult> => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert(
        'Permission Required',
        'Please allow access to your photo library to upload photos.'
      );
      return { success: false, error: 'Permission denied' };
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]?.uri) {
      return { success: false, error: 'Cancelled' };
    }

    return uploadPhoto(result.assets[0].uri);
  }, [uploadPhoto]);

  // Convenience method to take photo and upload
  const takeAndUpload = useCallback(async (): Promise<PhotoUploadResult> => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert(
        'Permission Required',
        'Please allow access to your camera to take photos.'
      );
      return { success: false, error: 'Permission denied' };
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]?.uri) {
      return { success: false, error: 'Cancelled' };
    }

    return uploadPhoto(result.assets[0].uri);
  }, [uploadPhoto]);

  return {
    uploadPhoto,
    pickAndUpload,
    takeAndUpload,
    isUploading,
    uploadProgress,
  };
}
