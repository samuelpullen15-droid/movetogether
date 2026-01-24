// src/lib/moderation-context.tsx
//
// App-wide moderation state management
// Checks user status on app launch and shows ban/suspension screens
// All logic is server-side - this just displays the result

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import Constants from 'expo-constants';

const ACKNOWLEDGED_WARNING_COUNT_KEY = 'moderation_acknowledged_warning_count';

interface ModerationStatus {
  can_use_app: boolean;
  status: 'good_standing' | 'warned' | 'suspended' | 'banned';
  message?: string;
  warning_count?: number;
  suspension_ends_at?: string;
  hours_remaining?: number;
  ban_reason?: string;
  appeal_info?: string;
}

interface ModerationContextType {
  moderationStatus: ModerationStatus | null;
  isLoading: boolean;
  isRestricted: boolean;
  checkStatus: () => Promise<void>;
  dismissWarning: () => void;
  hasSeenWarning: boolean;
}

const ModerationContext = createContext<ModerationContextType | undefined>(undefined);

// Get Supabase URL from environment
const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;

export function ModerationProvider({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const isProfileLoaded = useAuthStore((s) => s.isProfileLoaded);
  const [moderationStatus, setModerationStatus] = useState<ModerationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [acknowledgedWarningCount, setAcknowledgedWarningCount] = useState<number>(0);
  const [tokenReady, setTokenReady] = useState(false);
  const hasCheckedRef = useRef(false);

  // Load acknowledged warning count from storage on mount
  useEffect(() => {
    if (user?.id) {
      const key = `${ACKNOWLEDGED_WARNING_COUNT_KEY}_${user.id}`;
      AsyncStorage.getItem(key).then((value) => {
        if (value) {
          setAcknowledgedWarningCount(parseInt(value, 10) || 0);
        }
      }).catch(() => {
        // Ignore errors
      });
    }
  }, [user?.id]);

  // Listen for auth state changes to know when token is refreshed
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Moderation] Auth event:', event);
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        setTokenReady(true);
      } else if (event === 'SIGNED_OUT') {
        setTokenReady(false);
        hasCheckedRef.current = false;
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkStatus = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setModerationStatus(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        console.log('[Moderation] No session, defaulting to good standing');
        setModerationStatus({
          can_use_app: true,
          status: 'good_standing',
        });
        setIsLoading(false);
        return;
      }

      console.log('[Moderation] Making request with token...');

      const url = `${SUPABASE_URL}/functions/v1/check-moderation-status`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Moderation] Error response:', response.status, errorText);
        throw new Error('Failed to check moderation status');
      }

      const status: ModerationStatus = await response.json();
      console.log('[Moderation] Success! Status:', status.status);
      setModerationStatus(status);

      // Reset acknowledged count if no longer warned
      if (status.status !== 'warned' && user?.id) {
        const key = `${ACKNOWLEDGED_WARNING_COUNT_KEY}_${user.id}`;
        AsyncStorage.removeItem(key).catch(() => {});
        setAcknowledgedWarningCount(0);
      }
    } catch (error) {
      console.error('Error checking moderation status:', error);
      // Fail open - assume good standing if check fails
      setModerationStatus({
        can_use_app: true,
        status: 'good_standing',
      });
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  // Check status when token is ready and user is logged in
  useEffect(() => {
    if (isInitialized && isAuthenticated && user?.id && isProfileLoaded && tokenReady && !hasCheckedRef.current) {
      hasCheckedRef.current = true;
      // Small delay to ensure everything is settled
      const timer = setTimeout(() => {
        checkStatus();
      }, 500);
      return () => clearTimeout(timer);
    } else if (isInitialized && !isAuthenticated) {
      setModerationStatus(null);
      setIsLoading(false);
      hasCheckedRef.current = false;
    }
  }, [isInitialized, isAuthenticated, user?.id, isProfileLoaded, tokenReady, checkStatus]);

  // Safety timeout: If moderation is still loading after 5 seconds for an authenticated user,
  // assume good standing and proceed. This prevents the user from being stuck on
  // "Checking account status..." forever due to race conditions.
  useEffect(() => {
    if (isAuthenticated && isLoading) {
      const safetyTimeout = setTimeout(() => {
        if (isLoading) {
          console.warn('[Moderation] Safety timeout - assuming good standing');
          setModerationStatus({
            can_use_app: true,
            status: 'good_standing',
          });
          setIsLoading(false);
        }
      }, 5000);
      return () => clearTimeout(safetyTimeout);
    }
  }, [isAuthenticated, isLoading]);

  // Re-check periodically for suspended users (to auto-reinstate)
  useEffect(() => {
    if (moderationStatus?.status === 'suspended' && moderationStatus.suspension_ends_at) {
      const endsAt = new Date(moderationStatus.suspension_ends_at).getTime();
      const now = Date.now();
      const timeUntilEnd = endsAt - now;

      if (timeUntilEnd > 0) {
        // Check again when suspension ends
        const timeout = setTimeout(() => {
          checkStatus();
        }, Math.min(timeUntilEnd + 1000, 60 * 60 * 1000)); // Max 1 hour

        return () => clearTimeout(timeout);
      }
    }
  }, [moderationStatus, checkStatus]);

  const dismissWarning = useCallback(() => {
    const currentCount = moderationStatus?.warning_count || 0;
    setAcknowledgedWarningCount(currentCount);

    // Persist to storage
    if (user?.id && currentCount > 0) {
      const key = `${ACKNOWLEDGED_WARNING_COUNT_KEY}_${user.id}`;
      AsyncStorage.setItem(key, currentCount.toString()).catch(() => {});
    }
  }, [moderationStatus?.warning_count, user?.id]);

  const isRestricted = moderationStatus?.status === 'suspended' || moderationStatus?.status === 'banned';

  // User has "seen" the warning if they've acknowledged the current (or higher) warning count
  // This means the popup won't show again unless a NEW warning is added
  const currentWarningCount = moderationStatus?.warning_count || 0;
  const hasSeenWarning = acknowledgedWarningCount >= currentWarningCount && currentWarningCount > 0;

  return (
    <ModerationContext.Provider
      value={{
        moderationStatus,
        isLoading,
        isRestricted,
        checkStatus,
        dismissWarning,
        hasSeenWarning,
      }}
    >
      {children}
    </ModerationContext.Provider>
  );
}

export function useModeration() {
  const context = useContext(ModerationContext);
  if (context === undefined) {
    throw new Error('useModeration must be used within a ModerationProvider');
  }
  return context;
}