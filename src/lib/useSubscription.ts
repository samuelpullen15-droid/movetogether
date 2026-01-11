import { useMemo } from 'react';
import { useAuthStore } from './auth-store';
import { useSubscriptionStore } from './subscription-store';

export type SubscriptionTier = 'starter' | 'mover' | 'crusher';

const AI_MESSAGE_LIMIT = 200; // Monthly limit for AI messages

/**
 * Hook for subscription and feature gating
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

  // Get tier from user profile, fallback to store tier, then 'starter'
  const tier: SubscriptionTier = useMemo(() => {
    // First check user profile (source of truth from Supabase)
    if (user?.subscriptionTier) {
      return user.subscriptionTier as SubscriptionTier;
    }
    
    // Fallback to store tier if available
    if (tierFromStore) {
      return tierFromStore;
    }
    
    // Default to starter
    return 'starter';
  }, [user?.subscriptionTier, tierFromStore]);

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
    canAccessAnalytics,
    canAccessGroupChat,
    canAccessAICoach,
    canJoinCompetition,
    getAICoachLimitMessage,
  };
}
