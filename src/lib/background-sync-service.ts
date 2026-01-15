/**
 * Background Sync Service
 * 
 * Automatically syncs health data in the background to keep competition
 * standings up-to-date even when the app is closed.
 * 
 * Features:
 * - Runs every 3-6 hours (iOS limits to ~15 min minimum interval)
 * - Only syncs if user has connected provider
 * - Calls secure Edge Functions for data sync
 * - Handles errors gracefully
 */

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { supabase } from './supabase';

const BACKGROUND_SYNC_TASK = 'background-health-sync';

/**
 * Background task that syncs health data
 * This runs in the background even when app is closed
 */
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  console.log('[Background Sync] Task started');
  
  try {
    // Get current user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      console.log('[Background Sync] No active session, skipping');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const userId = session.user.id;
    console.log('[Background Sync] User ID:', userId);

    // Get user's active provider from AsyncStorage or Supabase
    // We need to fetch this from Supabase since stores aren't available in background
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('primary_device')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.primary_device) {
      console.log('[Background Sync] No active provider, skipping');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const activeProvider = profile.primary_device;
    console.log('[Background Sync] Active provider:', activeProvider);

    // Get today's date
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Sync based on provider type
    if (activeProvider === 'apple_watch' || activeProvider === 'iphone') {
      // For Apple Health, we can't fetch in background due to iOS restrictions
      // Apple Health data can only be accessed when app is in foreground
      console.log('[Background Sync] Apple Health requires foreground access, skipping');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    } else {
      // For OAuth providers (Fitbit, Whoop, Oura), sync via Edge Function
      console.log('[Background Sync] Syncing provider data...');
      
      const { data, error } = await supabase.functions.invoke('sync-provider-data', {
        body: {
          provider: activeProvider,
          date: today,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('[Background Sync] Sync failed:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }

      console.log('[Background Sync] Sync successful:', data);
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
  } catch (error) {
    console.error('[Background Sync] Task error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Register the background sync task
 * Call this when the app starts (in _layout.tsx)
 */
export async function registerBackgroundSync() {
  try {
    // Check if task is already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    
    if (isRegistered) {
      console.log('[Background Sync] Task already registered');
      return;
    }

    // Register the background fetch task
    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 60 * 60 * 3, // 3 hours (in seconds)
      stopOnTerminate: false, // Continue after app is killed
      startOnBoot: true, // Start on device boot
    });

    console.log('[Background Sync] Task registered successfully');
  } catch (error) {
    console.error('[Background Sync] Failed to register task:', error);
  }
}

/**
 * Unregister the background sync task
 * Call this if user disconnects their health provider or logs out
 */
export async function unregisterBackgroundSync() {
  try {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    console.log('[Background Sync] Task unregistered');
  } catch (error) {
    console.error('[Background Sync] Failed to unregister task:', error);
  }
}

/**
 * Check background sync status
 */
export async function getBackgroundSyncStatus() {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    
    return {
      isEnabled: status === BackgroundFetch.BackgroundFetchStatus.Available,
      isRegistered,
      status,
    };
  } catch (error) {
    console.error('[Background Sync] Failed to get status:', error);
    return {
      isEnabled: false,
      isRegistered: false,
      status: BackgroundFetch.BackgroundFetchStatus.Denied,
    };
  }
}

/**
 * Manually trigger a background sync (for testing)
 * Only works in development
 */
export async function triggerBackgroundSyncNow() {
  if (__DEV__) {
    try {
      await BackgroundFetch.setMinimumIntervalAsync(1); // 1 second for testing
      console.log('[Background Sync] Manual trigger in 1 second...');
    } catch (error) {
      console.error('[Background Sync] Failed to trigger:', error);
    }
  }
}
