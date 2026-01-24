// src/contexts/ModerationContext.tsx
//
// App-wide moderation state management
// Checks user status on app launch and shows ban/suspension screens
// All logic is server-side - this just displays the result

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

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

export function ModerationProvider({ children }: { children: ReactNode }) {
  const { user, session } = useAuth();
  const [moderationStatus, setModerationStatus] = useState<ModerationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSeenWarning, setHasSeenWarning] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!session?.access_token) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/check-moderation-status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to check moderation status');
      }

      const status: ModerationStatus = await response.json();
      setModerationStatus(status);

      // Reset warning seen state if status changes
      if (status.status !== 'warned') {
        setHasSeenWarning(false);
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
  }, [session?.access_token]);

  // Check status when user logs in
  useEffect(() => {
    if (user) {
      checkStatus();
    } else {
      setModerationStatus(null);
      setIsLoading(false);
    }
  }, [user, checkStatus]);

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
    setHasSeenWarning(true);
  }, []);

  const isRestricted = moderationStatus?.status === 'suspended' || moderationStatus?.status === 'banned';

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
