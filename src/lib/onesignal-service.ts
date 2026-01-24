/**
 * OneSignal Push Notification Service
 * 
 * This module provides a centralized OneSignal SDK wrapper that gracefully handles
 * missing configuration. The app will work fine whether or not OneSignal is configured.
 * 
 * Environment Variables:
 * - EXPO_PUBLIC_ONESIGNAL_APP_ID: Your OneSignal App ID from the OneSignal dashboard
 * 
 * Platform Support:
 * - iOS/Android: Fully supported via OneSignal SDK
 * - Web: Not supported (push notifications require native platforms)
 */

import { Platform } from 'react-native';
import { OneSignal, OSNotification } from 'react-native-onesignal';

// Check if running on web
const isWeb = Platform.OS === 'web';

// Get OneSignal App ID from environment variables
const oneSignalAppId = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;

// Check if OneSignal is configured
export const isOneSignalConfigured = (): boolean => {
  return Boolean(oneSignalAppId && !isWeb);
};

let isInitialized = false;
let isInitializing = false;
let pendingUserId: string | null = null;

/**
 * Initialize OneSignal SDK
 * Should be called once when the app starts
 */
export const initializeOneSignal = (): void => {
  if (isWeb || !oneSignalAppId) {
    console.log('OneSignal not configured or running on web, skipping initialization');
    return;
  }

  if (isInitialized || isInitializing) {
    console.log('OneSignal already initialized or initializing, skipping');
    return;
  }

  isInitializing = true;

  // Delay initialization slightly to ensure app is fully loaded
  // This helps avoid crashes during app startup
  setTimeout(() => {
    try {
      // Initialize OneSignal
      OneSignal.initialize(oneSignalAppId);

      // Set up notification event handlers
      setupNotificationHandlers();

      isInitialized = true;
      isInitializing = false;
      console.log('OneSignal initialized successfully');

      // If there was a pending user ID, set it now
      if (pendingUserId) {
        console.log('OneSignal: Setting pending user ID:', pendingUserId);
        try {
          OneSignal.login(pendingUserId);
          console.log('OneSignal user ID set (from pending):', pendingUserId);
        } catch (loginError) {
          console.error('Error setting pending OneSignal user ID:', loginError);
        }
        pendingUserId = null;
      }

      // NOTE: Don't request permissions here - let the onboarding screen do it
      // at the appropriate time after the user has completed initial setup
    } catch (error) {
      console.error('Error initializing OneSignal:', error);
      isInitializing = false;
    }
  }, 1000); // Delay by 1 second to let app fully initialize
};

/**
 * Set up notification event handlers
 */
const setupNotificationHandlers = (): void => {
  // Handle when a notification is received while the app is in the foreground
  OneSignal.Notifications.addEventListener('foregroundWillDisplay', (event) => {
    const notification: OSNotification = event.notification;
    console.log('OneSignal: notification received in foreground:', notification);
    
    // You can prevent the default display behavior if needed
    // event.preventDefault();
    
    // Or modify the notification before it's displayed
    // event.complete(notification);
  });

  // Handle when a notification is opened/clicked
  OneSignal.Notifications.addEventListener('click', (event) => {
    const notification: OSNotification = event.notification;
    console.log('OneSignal: notification clicked:', notification);
    
    // Handle notification click - navigate to relevant screen, etc.
    // Example: handleNotificationClick(notification);
    // Access additional data: notification.additionalData
  });
};

/**
 * Set the external user ID (link to your user system, e.g., Supabase user ID)
 * This allows you to send targeted notifications to specific users
 */
export const setOneSignalUserId = (userId: string): void => {
  if (!isOneSignalConfigured()) {
    console.log('OneSignal not configured, skipping setUserId');
    return;
  }

  // If still initializing, queue the user ID to be set after initialization completes
  if (!isInitialized) {
    console.log('OneSignal not yet initialized, queuing user ID:', userId);
    pendingUserId = userId;
    return;
  }

  try {
    OneSignal.login(userId);
    console.log('OneSignal user ID set:', userId);
  } catch (error) {
    console.error('Error setting OneSignal user ID:', error);
  }
};

/**
 * Clear the external user ID (call on logout)
 */
export const clearOneSignalUserId = (): void => {
  // Clear any pending user ID
  pendingUserId = null;

  if (!isOneSignalConfigured()) {
    console.log('OneSignal not configured, skipping clearUserId');
    return;
  }

  if (!isInitialized) {
    console.log('OneSignal not yet initialized, cleared pending user ID');
    return;
  }

  try {
    OneSignal.logout();
    console.log('OneSignal user ID cleared');
  } catch (error) {
    console.error('Error clearing OneSignal user ID:', error);
  }
};

/**
 * Set tags (custom key-value pairs) for the current user
 * Useful for segmenting users and sending targeted notifications
 */
export const setOneSignalTags = (tags: Record<string, string>): void => {
  if (!isOneSignalConfigured() || !isInitialized) {
    console.log('OneSignal not configured or initialized, skipping setTags');
    return;
  }

  try {
    OneSignal.User.addTags(tags);
    console.log('OneSignal tags set:', tags);
  } catch (error) {
    console.error('Error setting OneSignal tags:', error);
  }
};

/**
 * Remove tags for the current user
 */
export const removeOneSignalTags = (tagKeys: string[]): void => {
  if (!isOneSignalConfigured() || !isInitialized) {
    console.log('OneSignal not configured or initialized, skipping removeTags');
    return;
  }

  try {
    OneSignal.User.removeTags(tagKeys);
    console.log('OneSignal tags removed:', tagKeys);
  } catch (error) {
    console.error('Error removing OneSignal tags:', error);
  }
};

/**
 * Check if notifications are currently permitted
 */
export const checkNotificationPermission = async (): Promise<boolean> => {
  if (!isOneSignalConfigured() || !isInitialized) {
    return false;
  }

  try {
    const permission = await OneSignal.Notifications.hasPermission();
    return permission;
  } catch (error) {
    console.error('Error checking notification permission:', error);
    return false;
  }
};

/**
 * Request notification permissions
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!isOneSignalConfigured() || !isInitialized) {
    return false;
  }

  try {
    const permission = await OneSignal.Notifications.requestPermission(true);
    return permission;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
};

/**
 * Get the OneSignal push subscription ID
 * Useful for storing in your backend to track which devices belong to which users
 */
export const getOneSignalPushSubscriptionId = async (): Promise<string | null> => {
  if (!isOneSignalConfigured() || !isInitialized) {
    return null;
  }

  try {
    const pushSubscriptionId = await OneSignal.User.pushSubscription.id;
    return pushSubscriptionId || null;
  } catch (error) {
    console.error('Error getting push subscription ID:', error);
    return null;
  }
};
