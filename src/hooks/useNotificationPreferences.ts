/**
 * useNotificationPreferences Hook
 *
 * Manages notification preferences with Supabase persistence
 * and OneSignal tag synchronization for push notification filtering.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { setOneSignalTags, removeOneSignalTags } from '@/lib/onesignal-service';

export interface NotificationPreferences {
  // Competition Updates
  competition_push: boolean;
  competition_email: boolean;

  // Friend Activity
  friends_push: boolean;
  friends_email: boolean;

  // Achievements & Milestones
  achievements_push: boolean;

  // Coach Spark (AI Coach)
  coach_push: boolean;

  // Account & Security
  account_push: boolean;
  account_email: boolean;
}

export type NotificationPreferenceKey = keyof NotificationPreferences;

const DEFAULT_PREFERENCES: NotificationPreferences = {
  competition_push: true,
  competition_email: true,
  friends_push: true,
  friends_email: true,
  achievements_push: true,
  coach_push: true,
  account_push: true,
  account_email: true,
};

// Map preference keys to OneSignal tag names
const ONESIGNAL_TAG_MAP: Partial<Record<NotificationPreferenceKey, string>> = {
  competition_push: 'notify_competition',
  friends_push: 'notify_friends',
  achievements_push: 'notify_achievements',
  coach_push: 'notify_coach',
  account_push: 'notify_account',
};

export function useNotificationPreferences() {
  const user = useAuthStore((s) => s.user);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load preferences from Supabase
  const loadPreferences = useCallback(async () => {
    if (!user?.id || !supabase) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (fetchError) {
        // If no row exists, create default preferences
        if (fetchError.code === 'PGRST116') {
          const { data: newData, error: insertError } = await supabase
            .from('notification_preferences')
            .insert({ user_id: user.id })
            .select()
            .single();

          if (insertError) {
            console.error('Error creating notification preferences:', insertError);
            setError('Failed to create preferences');
          } else if (newData) {
            const prefs = extractPreferences(newData);
            setPreferences(prefs);
            syncOneSignalTags(prefs);
          }
        } else {
          console.error('Error loading notification preferences:', fetchError);
          setError('Failed to load preferences');
        }
      } else if (data) {
        const prefs = extractPreferences(data);
        setPreferences(prefs);
        syncOneSignalTags(prefs);
      }
    } catch (err) {
      console.error('Error in loadPreferences:', err);
      setError('Failed to load preferences');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Extract notification preferences from database row
  const extractPreferences = (data: any): NotificationPreferences => ({
    competition_push: data.competition_push ?? true,
    competition_email: data.competition_email ?? true,
    friends_push: data.friends_push ?? true,
    friends_email: data.friends_email ?? true,
    achievements_push: data.achievements_push ?? true,
    coach_push: data.coach_push ?? true,
    account_push: data.account_push ?? true,
    account_email: data.account_email ?? true,
  });

  // Sync preferences to OneSignal tags
  const syncOneSignalTags = (prefs: NotificationPreferences) => {
    const tags: Record<string, string> = {};
    const tagsToRemove: string[] = [];

    Object.entries(ONESIGNAL_TAG_MAP).forEach(([prefKey, tagName]) => {
      if (tagName) {
        const isEnabled = prefs[prefKey as NotificationPreferenceKey];
        if (isEnabled) {
          tags[tagName] = 'true';
        } else {
          tagsToRemove.push(tagName);
        }
      }
    });

    // Set enabled tags
    if (Object.keys(tags).length > 0) {
      setOneSignalTags(tags);
    }

    // Remove disabled tags
    if (tagsToRemove.length > 0) {
      removeOneSignalTags(tagsToRemove);
    }
  };

  // Update a single preference with optimistic UI
  const updatePreference = useCallback(
    async (key: NotificationPreferenceKey, value: boolean) => {
      if (!user?.id || !supabase) return;

      // Store previous value for rollback
      const previousValue = preferences[key];

      // Optimistic update
      const newPreferences = { ...preferences, [key]: value };
      setPreferences(newPreferences);

      try {
        setIsSaving(true);
        setError(null);

        const { error: updateError } = await supabase
          .from('notification_preferences')
          .update({ [key]: value })
          .eq('user_id', user.id);

        if (updateError) {
          console.error('Error updating preference:', updateError);
          // Rollback on error
          setPreferences({ ...preferences, [key]: previousValue });
          setError('Failed to save preference');
          return;
        }

        // Sync to OneSignal
        syncOneSignalTags(newPreferences);
      } catch (err) {
        console.error('Error in updatePreference:', err);
        // Rollback on error
        setPreferences({ ...preferences, [key]: previousValue });
        setError('Failed to save preference');
      } finally {
        setIsSaving(false);
      }
    },
    [user?.id, preferences]
  );

  // Update multiple preferences at once
  const updatePreferences = useCallback(
    async (updates: Partial<NotificationPreferences>) => {
      if (!user?.id || !supabase) return;

      // Store previous preferences for rollback
      const previousPreferences = { ...preferences };

      // Optimistic update
      const newPreferences = { ...preferences, ...updates };
      setPreferences(newPreferences);

      try {
        setIsSaving(true);
        setError(null);

        const { error: updateError } = await supabase
          .from('notification_preferences')
          .update(updates)
          .eq('user_id', user.id);

        if (updateError) {
          console.error('Error updating preferences:', updateError);
          // Rollback on error
          setPreferences(previousPreferences);
          setError('Failed to save preferences');
          return;
        }

        // Sync to OneSignal
        syncOneSignalTags(newPreferences);
      } catch (err) {
        console.error('Error in updatePreferences:', err);
        // Rollback on error
        setPreferences(previousPreferences);
        setError('Failed to save preferences');
      } finally {
        setIsSaving(false);
      }
    },
    [user?.id, preferences]
  );

  // Load preferences when user changes
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  return {
    preferences,
    isLoading,
    isSaving,
    error,
    updatePreference,
    updatePreferences,
    refreshPreferences: loadPreferences,
  };
}
