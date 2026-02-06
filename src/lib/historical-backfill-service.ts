/**
 * Historical Data Backfill Service
 * 
 * Automatically fetches historical data when user first connects a health provider.
 * Shows progress UI and handles the backfill process in the background.
 */

import { supabase } from './supabase';
import { syncApi } from './edge-functions';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type BackfillProvider = 'fitbit' | 'whoop' | 'garmin' | 'oura';

export interface BackfillProgress {
  isBackfilling: boolean;
  provider: BackfillProvider | null;
  progress: number; // 0-100
  message: string;
  syncedDays: number;
  totalDays: number;
}

const BACKFILL_STORAGE_KEY = 'backfill_completed_providers';

/**
 * Check if backfill has already been completed for a provider
 */
export async function hasCompletedBackfill(provider: BackfillProvider): Promise<boolean> {
  try {
    const completed = await AsyncStorage.getItem(BACKFILL_STORAGE_KEY);
    if (!completed) return false;
    
    const providers = JSON.parse(completed);
    return providers.includes(provider);
  } catch (error) {
    console.error('[Backfill] Error checking completion status:', error);
    return false;
  }
}

/**
 * Mark backfill as completed for a provider
 */
async function markBackfillCompleted(provider: BackfillProvider) {
  try {
    const completed = await AsyncStorage.getItem(BACKFILL_STORAGE_KEY);
    const providers = completed ? JSON.parse(completed) : [];
    
    if (!providers.includes(provider)) {
      providers.push(provider);
      await AsyncStorage.setItem(BACKFILL_STORAGE_KEY, JSON.stringify(providers));
    }
  } catch (error) {
    console.error('[Backfill] Error marking completion:', error);
  }
}

/**
 * Start historical data backfill for a provider
 * 
 * @param provider - The health provider to backfill
 * @param activityDays - Number of days of activity data to fetch (default: 90)
 * @param weightDays - Number of days of weight data to fetch (default: 365)
 * @param onProgress - Callback for progress updates
 * @returns Promise with backfill result
 */
export async function startHistoricalBackfill(
  provider: BackfillProvider,
  options: {
    activityDays?: number;
    weightDays?: number;
    onProgress?: (progress: BackfillProgress) => void;
  } = {}
): Promise<{ success: boolean; error?: string }> {
  const { activityDays = 90, weightDays = 365, onProgress } = options;

  console.log(`[Backfill] Starting for ${provider}`);

  // Check if already completed
  const alreadyCompleted = await hasCompletedBackfill(provider);
  if (alreadyCompleted) {
    console.log(`[Backfill] Already completed for ${provider}, skipping`);
    return { success: true };
  }

  try {
    // Update progress: Starting
    onProgress?.({
      isBackfilling: true,
      provider,
      progress: 5,
      message: 'Preparing to sync your historical data...',
      syncedDays: 0,
      totalDays: activityDays,
    });

    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('Not authenticated');
    }

    // Update progress: Fetching
    onProgress?.({
      isBackfilling: true,
      provider,
      progress: 10,
      message: `Fetching your last ${activityDays} days of activity...`,
      syncedDays: 0,
      totalDays: activityDays,
    });

    // Call the backfill Edge Function
    // This might take a while (90+ seconds for 90 days)
    const { data, error } = await syncApi.backfillHistoricalData(provider, activityDays, weightDays);

    if (error) {
      console.error('[Backfill] Error:', error);
      throw error;
    }

    if (!data || !data.success) {
      throw new Error(data?.error || 'Backfill failed');
    }

    console.log(`[Backfill] Complete! Synced: ${data.syncedDays}, Failed: ${data.failedDays}`);

    // Mark as completed
    await markBackfillCompleted(provider);

    // Update progress: Complete
    onProgress?.({
      isBackfilling: false,
      provider,
      progress: 100,
      message: `Successfully synced ${data.syncedDays} days of data!`,
      syncedDays: data.syncedDays,
      totalDays: activityDays,
    });

    return { success: true };
  } catch (error) {
    console.error('[Backfill] Failed:', error);
    
    onProgress?.({
      isBackfilling: false,
      provider,
      progress: 0,
      message: 'Sync failed. You can try again later in settings.',
      syncedDays: 0,
      totalDays: activityDays,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Backfill failed',
    };
  }
}

/**
 * Start backfill in background (fire and forget)
 * Useful for silent backfill after OAuth connection
 */
export function startBackfillInBackground(provider: BackfillProvider) {
  // Don't await - let it run in background
  startHistoricalBackfill(provider, {
    activityDays: 90,
    weightDays: 365,
  }).catch((error) => {
    console.error('[Backfill] Background backfill failed:', error);
  });
}

/**
 * Reset backfill completion status (for testing or re-sync)
 */
export async function resetBackfillStatus(provider?: BackfillProvider) {
  try {
    if (provider) {
      // Remove specific provider
      const completed = await AsyncStorage.getItem(BACKFILL_STORAGE_KEY);
      if (completed) {
        const providers = JSON.parse(completed);
        const filtered = providers.filter((p: string) => p !== provider);
        await AsyncStorage.setItem(BACKFILL_STORAGE_KEY, JSON.stringify(filtered));
      }
    } else {
      // Clear all
      await AsyncStorage.removeItem(BACKFILL_STORAGE_KEY);
    }
    console.log('[Backfill] Reset completion status');
  } catch (error) {
    console.error('[Backfill] Error resetting status:', error);
  }
}
