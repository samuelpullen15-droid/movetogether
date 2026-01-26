/**
 * usePrivacySettings Hook
 *
 * Manages privacy settings with Supabase persistence,
 * optimistic updates, and debounced API calls.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { useAuthStore } from '@/lib/auth-store';
import { settingsApi } from '@/lib/edge-functions';

export interface VisibleMetrics {
  steps: boolean;
  calories: boolean;
  active_minutes: boolean;
  distance: boolean;
  workouts: boolean;
}

export interface PrivacySettings {
  // Profile visibility
  profile_visibility: 'public' | 'friends_only' | 'private';
  show_real_name_on_leaderboards: boolean;
  allow_find_by_email: boolean;

  // Activity sharing
  show_activity_in_feed: boolean;
  show_on_public_leaderboards: boolean;
  show_detailed_stats: boolean;

  // Health data visibility
  visible_metrics: VisibleMetrics;

  // Social controls
  friend_request_visibility: 'everyone' | 'friends_of_friends' | 'no_one';
  competition_invite_visibility: 'everyone' | 'friends_only' | 'no_one';

  // Analytics
  analytics_opt_in: boolean;
}

export type PrivacySettingKey = keyof Omit<PrivacySettings, 'visible_metrics'>;
export type MetricKey = keyof VisibleMetrics;

const DEFAULT_SETTINGS: PrivacySettings = {
  profile_visibility: 'public',
  show_real_name_on_leaderboards: false,
  allow_find_by_email: true,
  show_activity_in_feed: true,
  show_on_public_leaderboards: true,
  show_detailed_stats: true,
  visible_metrics: {
    steps: true,
    calories: true,
    active_minutes: true,
    distance: true,
    workouts: true,
  },
  friend_request_visibility: 'everyone',
  competition_invite_visibility: 'everyone',
  analytics_opt_in: true,
};

export function usePrivacySettings() {
  const user = useAuthStore((s) => s.user);
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<Partial<PrivacySettings>>({});

  // Load settings from Supabase via secure Edge Function
  // Per security rules: Never use .select() directly from frontend
  const loadSettings = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Use Edge Function instead of direct RPC
      const { data, error: fetchError } = await settingsApi.getMyPrivacySettings();

      if (fetchError) {
        // If no row exists (empty result), create default settings via Edge Function
        if (fetchError.message?.includes('PGRST116') || !data || (Array.isArray(data) && data.length === 0)) {
          const { error: insertError } = await settingsApi.upsertMyPrivacySettings({});

          if (insertError) {
            console.error('Error creating privacy settings:', insertError);
            setError('Failed to create privacy settings');
          } else {
            // Fetch the newly created settings via Edge Function
            const { data: newData } = await settingsApi.getMyPrivacySettings();
            if (newData && Array.isArray(newData) && newData.length > 0) {
              setSettings(extractSettings((newData as any[])[0]));
            }
          }
        } else {
          console.error('Error loading privacy settings:', fetchError);
          setError('Failed to load privacy settings');
        }
      } else if (data && Array.isArray(data) && data.length > 0) {
        setSettings(extractSettings((data as any[])[0]));
      } else if (!data || (Array.isArray(data) && data.length === 0)) {
        // No settings exist, create defaults
        const { error: insertError } = await settingsApi.upsertMyPrivacySettings({});
        if (!insertError) {
          const { data: newData } = await settingsApi.getMyPrivacySettings();
          if (newData && Array.isArray(newData) && newData.length > 0) {
            setSettings(extractSettings((newData as any[])[0]));
          }
        }
      }
    } catch (err) {
      console.error('Error in loadSettings:', err);
      setError('Failed to load privacy settings');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Extract settings from database row
  const extractSettings = (data: any): PrivacySettings => ({
    profile_visibility: data.profile_visibility ?? 'public',
    show_real_name_on_leaderboards: data.show_real_name_on_leaderboards ?? false,
    allow_find_by_email: data.allow_find_by_email ?? true,
    show_activity_in_feed: data.show_activity_in_feed ?? true,
    show_on_public_leaderboards: data.show_on_public_leaderboards ?? true,
    show_detailed_stats: data.show_detailed_stats ?? true,
    visible_metrics: data.visible_metrics ?? DEFAULT_SETTINGS.visible_metrics,
    friend_request_visibility: data.friend_request_visibility ?? 'everyone',
    competition_invite_visibility: data.competition_invite_visibility ?? 'everyone',
    analytics_opt_in: data.analytics_opt_in ?? true,
  });

  // Flush pending updates to the database
  const flushUpdates = useCallback(async () => {
    if (!user?.id) return;

    const updates = { ...pendingUpdatesRef.current };
    if (Object.keys(updates).length === 0) return;

    // Clear pending updates
    pendingUpdatesRef.current = {};

    try {
      setIsSaving(true);

      // Use Edge Function to update settings
      const { error: updateError } = await settingsApi.upsertMyPrivacySettings(updates);

      if (updateError) {
        console.error('Error updating privacy settings:', updateError);
        // Reload to get correct state
        loadSettings();
        Alert.alert('Error', 'Failed to save privacy settings. Please try again.');
      }
    } catch (err) {
      console.error('Error in flushUpdates:', err);
      loadSettings();
      Alert.alert('Error', 'Failed to save privacy settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [user?.id, loadSettings]);

  // Update a single setting with debouncing
  const updateSetting = useCallback(
    <K extends PrivacySettingKey>(key: K, value: PrivacySettings[K]) => {
      // Optimistic update
      setSettings((prev) => ({ ...prev, [key]: value }));

      // Add to pending updates
      pendingUpdatesRef.current[key] = value;

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new timer for debounced flush
      debounceTimerRef.current = setTimeout(() => {
        flushUpdates();
      }, 300);
    },
    [flushUpdates]
  );

  // Update a metric visibility setting
  const updateMetricVisibility = useCallback(
    (metric: MetricKey, value: boolean) => {
      setSettings((prev) => {
        const newMetrics = { ...prev.visible_metrics, [metric]: value };

        // Add to pending updates
        pendingUpdatesRef.current.visible_metrics = newMetrics;

        // Clear existing timer
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        // Set new timer for debounced flush
        debounceTimerRef.current = setTimeout(() => {
          flushUpdates();
        }, 300);

        return { ...prev, visible_metrics: newMetrics };
      });
    },
    [flushUpdates]
  );

  // Update multiple settings at once
  const updateSettings = useCallback(
    async (updates: Partial<PrivacySettings>) => {
      if (!user?.id) return;

      // Store previous for rollback
      const previousSettings = { ...settings };

      // Optimistic update
      setSettings((prev) => ({ ...prev, ...updates }));

      try {
        setIsSaving(true);

        // Use Edge Function to update settings
        const { error: updateError } = await settingsApi.upsertMyPrivacySettings(updates);

        if (updateError) {
          console.error('Error updating privacy settings:', updateError);
          setSettings(previousSettings);
          Alert.alert('Error', 'Failed to save privacy settings. Please try again.');
        }
      } catch (err) {
        console.error('Error in updateSettings:', err);
        setSettings(previousSettings);
        Alert.alert('Error', 'Failed to save privacy settings. Please try again.');
      } finally {
        setIsSaving(false);
      }
    },
    [user?.id, settings]
  );

  // Refresh settings
  const refreshSettings = useCallback(() => {
    loadSettings();
  }, [loadSettings]);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        // Flush any pending updates
        flushUpdates();
      }
    };
  }, [flushUpdates]);

  return {
    settings,
    isLoading,
    isSaving,
    error,
    updateSetting,
    updateMetricVisibility,
    updateSettings,
    refreshSettings,
  };
}
