/**
 * Trial Rewards System
 *
 * Handles activation and status checking for streak milestone trial rewards.
 * Trials are temporary entitlements earned through the streak system that
 * grant premium features for a limited time.
 *
 * Supported trial types:
 * - trial_mover: Grants Mover tier features (unlimited competitions)
 * - trial_coach: Grants AI Coach access with message limits
 * - trial_crusher: Grants Crusher tier features (everything)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuthStore } from './auth-store';
import { isSupabaseConfigured } from './supabase';
import { useSubscriptionStore } from './subscription-store';
import { trialsApi } from './edge-functions';

// ============================================================================
// TYPES
// ============================================================================

export type TrialRewardType = 'trial_mover' | 'trial_coach' | 'trial_crusher';

export interface TrialReward {
  id: string;
  milestoneProgressId: string;
  milestoneName: string;
  rewardType: TrialRewardType;
  activatedAt: string;
  expiresAt: string;
  isActive: boolean;
  hoursRemaining: number;
  minutesRemaining: number;
}

export interface TrialStatus {
  // Individual trial states
  hasActiveMoverTrial: boolean;
  hasActiveCoachTrial: boolean;
  hasActiveCrusherTrial: boolean;

  // Expiration timestamps
  moverTrialExpiresAt: string | null;
  coachTrialExpiresAt: string | null;
  crusherTrialExpiresAt: string | null;

  // Time remaining (for display)
  moverTrialTimeRemaining: string | null;
  coachTrialTimeRemaining: string | null;
  crusherTrialTimeRemaining: string | null;

  // Combined feature access (considering real subscriptions)
  hasMoverAccess: boolean; // Real subscription OR trial
  hasCoachAccess: boolean; // Real subscription OR trial
  hasCrusherAccess: boolean; // Real subscription OR trial

  // UI helpers
  isMoverTrial: boolean; // Has access via trial (not real subscription)
  isCoachTrial: boolean;
  isCrusherTrial: boolean;

  // All active trials
  activeTrials: TrialReward[];

  // Recently expired trial (for upgrade prompt)
  recentlyExpiredTrial: {
    type: TrialRewardType;
    expiredAt: string;
  } | null;

  // Loading state
  isLoading: boolean;

  // Actions
  refreshTrials: () => Promise<void>;
  dismissExpiredPrompt: () => void;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate time remaining in human-readable format
 */
function calculateTimeRemaining(expiresAt: string): {
  hours: number;
  minutes: number;
  formatted: string;
  isExpired: boolean;
} {
  const now = new Date();
  const expiry = new Date(expiresAt);
  const diffMs = expiry.getTime() - now.getTime();

  if (diffMs <= 0) {
    return { hours: 0, minutes: 0, formatted: 'Expired', isExpired: true };
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  let formatted: string;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    formatted = `${days}d ${remainingHours}h`;
  } else if (hours > 0) {
    formatted = `${hours}h ${minutes}m`;
  } else {
    formatted = `${minutes}m`;
  }

  return { hours, minutes, formatted, isExpired: false };
}

/**
 * Map reward type to tier for subscription comparison
 */
function rewardTypeToTier(rewardType: TrialRewardType): 'mover' | 'crusher' {
  switch (rewardType) {
    case 'trial_mover':
    case 'trial_coach':
      return 'mover';
    case 'trial_crusher':
      return 'crusher';
  }
}

// ============================================================================
// ACTIVATE TRIAL REWARD
// ============================================================================

export interface ActivateTrialResult {
  success: boolean;
  trial?: TrialReward;
  error?: string;
}

/**
 * Activate a trial reward from a claimed milestone
 * This is called after the user claims a milestone with a trial reward type
 */
export async function activateTrialReward(
  milestoneProgressId: string
): Promise<ActivateTrialResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await trialsApi.activateTrialReward(milestoneProgressId);

    if (error || !data) {
      console.error('[TrialRewards] Error activating trial:', error);
      return { success: false, error: error?.message || 'Failed to activate trial' };
    }

    console.log(`[TrialRewards] Activated ${data.trial.rewardType} trial`);

    return {
      success: true,
      trial: {
        id: data.trial.id,
        milestoneProgressId: data.trial.milestoneProgressId,
        milestoneName: data.trial.milestoneName,
        rewardType: data.trial.rewardType as TrialRewardType,
        activatedAt: data.trial.activatedAt,
        expiresAt: data.trial.expiresAt,
        isActive: data.trial.isActive,
        hoursRemaining: data.trial.hoursRemaining,
        minutesRemaining: data.trial.minutesRemaining,
      },
    };
  } catch (error) {
    console.error('[TrialRewards] Error activating trial:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// USE TRIAL STATUS HOOK
// ============================================================================

/**
 * Hook to check and monitor trial reward status
 * Integrates with subscription store to properly gate features
 */
export function useTrialStatus(): TrialStatus {
  const user = useAuthStore((s) => s.user);
  const subscriptionTier = useSubscriptionStore((s) => s.tier);

  const [isLoading, setIsLoading] = useState(true);
  const [activeTrials, setActiveTrials] = useState<TrialReward[]>([]);
  const [recentlyExpiredTrial, setRecentlyExpiredTrial] = useState<{
    type: TrialRewardType;
    expiredAt: string;
  } | null>(null);

  // Track app state for refresh on foreground
  const appState = useRef(AppState.currentState);

  // Fetch active trials from edge function
  const fetchTrials = useCallback(async () => {
    if (!user?.id || !isSupabaseConfigured()) {
      setIsLoading(false);
      setActiveTrials([]);
      return;
    }

    try {
      const { data: trials, error } = await trialsApi.getActiveTrials();

      if (error) {
        console.error('[TrialRewards] Error fetching trials:', error);
        setIsLoading(false);
        return;
      }

      // Process and filter active trials
      const processedTrials: TrialReward[] = [];
      let mostRecentExpired: { type: TrialRewardType; expiredAt: string } | null = null;

      for (const trial of trials || []) {
        const milestone = trial.milestone as any;
        if (!milestone || !trial.reward_expires_at) continue;

        const rewardType = milestone.reward_type as TrialRewardType;
        const timeRemaining = calculateTimeRemaining(trial.reward_expires_at);

        if (!timeRemaining.isExpired) {
          processedTrials.push({
            id: trial.id,
            milestoneProgressId: trial.id,
            milestoneName: milestone.name,
            rewardType,
            activatedAt: trial.reward_claimed_at || trial.earned_at,
            expiresAt: trial.reward_expires_at,
            isActive: true,
            hoursRemaining: timeRemaining.hours,
            minutesRemaining: timeRemaining.minutes,
          });
        } else {
          // Check if this trial expired recently (within last 24 hours)
          const expiredAt = new Date(trial.reward_expires_at);
          const hoursSinceExpiry = (Date.now() - expiredAt.getTime()) / (1000 * 60 * 60);

          if (hoursSinceExpiry <= 24) {
            if (!mostRecentExpired || expiredAt > new Date(mostRecentExpired.expiredAt)) {
              mostRecentExpired = {
                type: rewardType,
                expiredAt: trial.reward_expires_at,
              };
            }
          }
        }
      }

      setActiveTrials(processedTrials);
      setRecentlyExpiredTrial(mostRecentExpired);
      setIsLoading(false);
    } catch (error) {
      console.error('[TrialRewards] Error in fetchTrials:', error);
      setIsLoading(false);
    }
  }, [user?.id]);

  // Refresh trials function (exposed to consumers)
  const refreshTrials = useCallback(async () => {
    setIsLoading(true);
    await fetchTrials();
  }, [fetchTrials]);

  // Dismiss expired trial prompt
  const dismissExpiredPrompt = useCallback(() => {
    setRecentlyExpiredTrial(null);
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchTrials();
  }, [fetchTrials]);

  // Refresh on app foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App came to foreground - refresh trials to check for expiration
        fetchTrials();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [fetchTrials]);

  // Auto-refresh every minute when there are active trials (for countdown updates)
  useEffect(() => {
    if (activeTrials.length === 0) return;

    const interval = setInterval(() => {
      fetchTrials();
    }, 60 * 1000); // Refresh every minute

    return () => clearInterval(interval);
  }, [activeTrials.length, fetchTrials]);

  // Calculate derived state
  const hasMoverTrial = activeTrials.some((t) => t.rewardType === 'trial_mover');
  const hasCoachTrial = activeTrials.some((t) => t.rewardType === 'trial_coach');
  const hasCrusherTrial = activeTrials.some((t) => t.rewardType === 'trial_crusher');

  const moverTrial = activeTrials.find((t) => t.rewardType === 'trial_mover');
  const coachTrial = activeTrials.find((t) => t.rewardType === 'trial_coach');
  const crusherTrial = activeTrials.find((t) => t.rewardType === 'trial_crusher');

  // Check real subscription status
  const hasRealMoverSubscription = subscriptionTier === 'mover' || subscriptionTier === 'crusher';
  const hasRealCrusherSubscription = subscriptionTier === 'crusher';
  // Coach access comes with any subscription (mover or crusher)
  const hasRealCoachSubscription = subscriptionTier === 'mover' || subscriptionTier === 'crusher';

  // Calculate time remaining strings
  const getMoverTimeRemaining = () => {
    if (!moverTrial) return null;
    return calculateTimeRemaining(moverTrial.expiresAt).formatted;
  };

  const getCoachTimeRemaining = () => {
    if (!coachTrial) return null;
    return calculateTimeRemaining(coachTrial.expiresAt).formatted;
  };

  const getCrusherTimeRemaining = () => {
    if (!crusherTrial) return null;
    return calculateTimeRemaining(crusherTrial.expiresAt).formatted;
  };

  return {
    // Individual trial states
    hasActiveMoverTrial: hasMoverTrial,
    hasActiveCoachTrial: hasCoachTrial,
    hasActiveCrusherTrial: hasCrusherTrial,

    // Expiration timestamps
    moverTrialExpiresAt: moverTrial?.expiresAt ?? null,
    coachTrialExpiresAt: coachTrial?.expiresAt ?? null,
    crusherTrialExpiresAt: crusherTrial?.expiresAt ?? null,

    // Time remaining
    moverTrialTimeRemaining: getMoverTimeRemaining(),
    coachTrialTimeRemaining: getCoachTimeRemaining(),
    crusherTrialTimeRemaining: getCrusherTimeRemaining(),

    // Combined access (real subscription trumps trial)
    hasMoverAccess: hasRealMoverSubscription || hasMoverTrial || hasCrusherTrial,
    hasCoachAccess: hasRealCoachSubscription || hasCoachTrial || hasCrusherTrial,
    hasCrusherAccess: hasRealCrusherSubscription || hasCrusherTrial,

    // UI helpers - show "trial" badge only if access is via trial (not real subscription)
    isMoverTrial: !hasRealMoverSubscription && (hasMoverTrial || hasCrusherTrial),
    isCoachTrial: !hasRealCoachSubscription && (hasCoachTrial || hasCrusherTrial),
    isCrusherTrial: !hasRealCrusherSubscription && hasCrusherTrial,

    // All active trials
    activeTrials,

    // Recently expired trial
    recentlyExpiredTrial,

    // Loading state
    isLoading,

    // Actions
    refreshTrials,
    dismissExpiredPrompt,
  };
}

// ============================================================================
// TRIAL BADGE COMPONENT HELPERS
// ============================================================================

/**
 * Get display text for trial badge
 */
export function getTrialBadgeText(
  rewardType: TrialRewardType,
  timeRemaining: string | null
): string {
  const typeLabel = {
    trial_mover: 'Mover Trial',
    trial_coach: 'Coach Trial',
    trial_crusher: 'Crusher Trial',
  }[rewardType];

  if (timeRemaining) {
    return `${typeLabel}: ${timeRemaining}`;
  }
  return typeLabel;
}

/**
 * Get upgrade prompt text for expired trial
 */
export function getUpgradePromptText(rewardType: TrialRewardType): {
  title: string;
  body: string;
  ctaText: string;
} {
  switch (rewardType) {
    case 'trial_mover':
      return {
        title: 'Your Mover Trial Ended',
        body: 'You\'ve experienced unlimited competitions. Upgrade to keep competing with friends without limits!',
        ctaText: 'Upgrade to Mover',
      };
    case 'trial_coach':
      return {
        title: 'Your Coach Spark Trial Ended',
        body: 'You\'ve experienced personalized AI coaching. Upgrade to keep getting insights tailored to your fitness journey!',
        ctaText: 'Upgrade to Mover',
      };
    case 'trial_crusher':
      return {
        title: 'Your Crusher Trial Ended',
        body: 'You\'ve experienced all premium features. Upgrade to unlock everything and crush your fitness goals!',
        ctaText: 'Upgrade to Crusher',
      };
  }
}

/**
 * Get trial benefit description (for during-trial messaging)
 */
export function getTrialBenefitText(rewardType: TrialRewardType): string {
  switch (rewardType) {
    case 'trial_mover':
      return 'Enjoy unlimited competitions during your trial!';
    case 'trial_coach':
      return 'Get personalized AI coaching during your trial!';
    case 'trial_crusher':
      return 'Experience all premium features during your trial!';
  }
}
