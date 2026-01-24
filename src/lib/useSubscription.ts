import { useMemo } from 'react';
import { useAuthStore } from './auth-store';
import { useSubscriptionStore } from './subscription-store';

export type SubscriptionTier = 'starter' | 'mover' | 'crusher';

const AI_MESSAGE_LIMIT = 200; // Monthly limit for AI messages

/**
 * Hook for subscription and feature gating
 *
 * IMPORTANT: RevenueCat is the ONLY source of truth for subscription tier.
 * - Tier is checked from RevenueCat entitlements on login
 * - Supabase subscription_tier is updated via RevenueCat webhooks (not checked here)
 * - Never check Supabase for subscription status - only RevenueCat
 *
 * @returns Object with current tier, feature access functions, and AI message tracking
 *
 * @example
 * const { tier, canAccessAnalytics, canJoinCompetition } = useSubscription();
 * if (canAccessAnalytics()) {
 *   // Show analytics
 * }
 */
export function useSubscription() {
  const user = useAuthStore((s) => s.user);
  const tierFromStore = useSubscriptionStore((s) => s.tier);

  // Get tier from RevenueCat only (single source of truth)
  // Supabase is updated via webhook, not checked here
  const tier: SubscriptionTier = useMemo(() => {
    return tierFromStore || 'starter';
  }, [tierFromStore]);

  // Get AI message usage from user profile
  const aiMessagesUsed = user?.aiMessagesUsed ?? 0;
  const aiMessagesResetAt = user?.aiMessagesResetAt 
    ? new Date(user.aiMessagesResetAt) 
    : null;

  // Check if AI messages should be reset (monthly reset)
  const shouldResetAiMessages = useMemo(() => {
    if (!aiMessagesResetAt) return false;
    return new Date() >= aiMessagesResetAt;
  }, [aiMessagesResetAt]);

  // Calculate remaining AI messages
  const aiMessagesRemaining = useMemo(() => {
    if (tier !== 'crusher') return 0; // Only crusher tier has AI access
    if (shouldResetAiMessages) return AI_MESSAGE_LIMIT; // Reset if needed
    return Math.max(0, AI_MESSAGE_LIMIT - aiMessagesUsed);
  }, [tier, aiMessagesUsed, shouldResetAiMessages]);

  /**
   * Check if user can access friends/social features
   * Available for: mover, crusher
   */
  const canAccessFriends = () => {
    return tier === 'mover' || tier === 'crusher';
  };

  /**
   * Check if user can access advanced analytics
   * Available for: mover, crusher
   */
  const canAccessAnalytics = () => {
    return tier === 'mover' || tier === 'crusher';
  };

  /**
   * Check if user can access competition group chat
   * Available for: mover, crusher
   */
  const canAccessGroupChat = () => {
    return tier === 'mover' || tier === 'crusher';
  };

  /**
   * Check if user can access AI Coach
   * Available for: crusher only
   */
  const canAccessAICoach = () => {
    if (tier !== 'crusher') return false;
    
    // Check if AI message limit reached
    if (!shouldResetAiMessages && aiMessagesUsed >= AI_MESSAGE_LIMIT) {
      return false;
    }
    
    return true;
  };

  /**
   * Check if user can join a competition
   * Starter: max 2 competitions
   * Mover/Crusher: unlimited
   * 
   * @param currentCount - Current number of competitions user is in
   */
  const canJoinCompetition = (currentCount: number) => {
    if (tier === 'starter') {
      return currentCount < 2;
    }
    // mover and crusher have unlimited
    return true;
  };

  /**
   * Get a user-friendly message if AI Coach limit is reached
   */
  const getAICoachLimitMessage = () => {
    if (tier !== 'crusher') {
      return 'AI Coach is available with Crusher tier. Upgrade to unlock!';
    }
    
    if (shouldResetAiMessages) {
      return 'Your AI message limit has been reset. You can now use AI Coach again!';
    }
    
    if (aiMessagesUsed >= AI_MESSAGE_LIMIT) {
      return 'You\'ve reached your monthly AI message limit. Your limit will reset soon!';
    }
    
    return null;
  };

  return {
    tier,
    aiMessagesUsed,
    aiMessagesRemaining,
    canAccessFriends,
    canAccessAnalytics,
    canAccessGroupChat,
    canAccessAICoach,
    canJoinCompetition,
    getAICoachLimitMessage,
  };
}
