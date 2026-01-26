// achievements-service.ts - Service for fetching and updating achievements
// Per security rules: Uses Edge Functions instead of direct RPC calls

import { supabase } from './supabase';
import { achievementsApi } from './edge-functions';
import {
  AchievementTier,
  AchievementWithProgress,
  getHighestUnlockedTier,
  getNextTier,
  calculateProgressToNextTier,
} from './achievements-types';
import { ACHIEVEMENT_DEFINITIONS, getAchievementById } from './achievement-definitions';

// Store for tracking which unlocks we've already celebrated
let celebratedUnlocks = new Set<string>();

// Store for tracking which notifications we've already sent (prevent duplicates)
let notifiedUnlocks = new Set<string>();

// Send achievement unlock notification
async function sendAchievementNotification(
  userId: string,
  achievementId: string,
  tier: AchievementTier
): Promise<void> {
  const notifyKey = `${achievementId}-${tier}`;

  // Skip if already notified
  if (notifiedUnlocks.has(notifyKey)) return;
  notifiedUnlocks.add(notifyKey);

  try {
    const achievement = getAchievementById(achievementId);
    const achievementName = achievement?.name || achievementId.replace(/_/g, ' ');
    const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);

    await supabase.functions.invoke('send-notification', {
      body: {
        type: 'achievement_unlocked',
        recipientUserId: userId,
        data: {
          achievementId,
          achievementName,
          tier: tierName,
        },
      },
    });

    console.log(`[Achievements] Sent notification for ${tierName} ${achievementName}`);
  } catch (error) {
    console.error('[Achievements] Failed to send achievement notification:', error);
  }
}

interface DBProgressRecord {
  achievement_id: string;
  current_progress: number;
  bronze_unlocked_at: string | null;
  silver_unlocked_at: string | null;
  gold_unlocked_at: string | null;
  platinum_unlocked_at: string | null;
}

export interface AchievementStats {
  bronzeCount: number;
  silverCount: number;
  goldCount: number;
  platinumCount: number;
  achievementScore: number;
}

export async function fetchUserAchievements(
  userId: string,
  canAccess: boolean
): Promise<AchievementWithProgress[]> {
  // Per security rules: Use Edge Function instead of direct RPC
  const { data: progressData, error } = await achievementsApi.getMyAchievements();

  if (error) throw error;

  const progressMap = new Map<string, DBProgressRecord>();
  (progressData || []).forEach((record: DBProgressRecord) => {
    progressMap.set(record.achievement_id, record);
  });

  return ACHIEVEMENT_DEFINITIONS.map((definition) => {
    const progress = progressMap.get(definition.id);

    const tiersUnlocked = {
      bronze: progress?.bronze_unlocked_at ? new Date(progress.bronze_unlocked_at) : null,
      silver: progress?.silver_unlocked_at ? new Date(progress.silver_unlocked_at) : null,
      gold: progress?.gold_unlocked_at ? new Date(progress.gold_unlocked_at) : null,
      platinum: progress?.platinum_unlocked_at ? new Date(progress.platinum_unlocked_at) : null,
    };

    const currentProgress = progress?.current_progress || 0;
    const currentTier = getHighestUnlockedTier(tiersUnlocked);
    const nextTier = getNextTier(currentTier);
    const progressToNextTier = calculateProgressToNextTier(
      currentProgress,
      definition.tiers,
      currentTier
    );

    return {
      ...definition,
      currentProgress,
      tiersUnlocked,
      currentTier,
      nextTier,
      progressToNextTier,
      canAccess,
    };
  });
}

export function calculateStats(achievements: AchievementWithProgress[]): AchievementStats {
  return {
    bronzeCount: achievements.filter((a) => a.tiersUnlocked.bronze).length,
    silverCount: achievements.filter((a) => a.tiersUnlocked.silver).length,
    goldCount: achievements.filter((a) => a.tiersUnlocked.gold).length,
    platinumCount: achievements.filter((a) => a.tiersUnlocked.platinum).length,
    achievementScore: achievements.reduce((score, a) => {
      if (a.tiersUnlocked.platinum) return score + 4;
      if (a.tiersUnlocked.gold) return score + 3;
      if (a.tiersUnlocked.silver) return score + 2;
      if (a.tiersUnlocked.bronze) return score + 1;
      return score;
    }, 0),
  };
}

export async function triggerAchievementUpdate(
  userId: string,
  eventType: 'competition_completed' | 'activity_logged' | 'daily_sync',
  eventData?: Record<string, any>
): Promise<{ 
  newUnlocks: { achievementId: string; tier: AchievementTier }[];
  celebrate: (showCelebration: (achievementId: string, tier: AchievementTier) => void) => void;
}> {
  const { data, error } = await supabase.functions.invoke('update-achievements', {
    body: { userId, eventType, eventData },
  });

  if (error) throw error;

  return { 
    newUnlocks: data?.newUnlocks || [],
    celebrate: (showCelebration: (achievementId: string, tier: AchievementTier) => void) => {
      for (const unlock of (data?.newUnlocks || [])) {
        showCelebration(unlock.achievementId, unlock.tier);
      }
    }
  };
}

// Check for new unlocks and return them for celebration
export async function checkAndCelebrateUnlocks(
  userId: string,
  showCelebration: (achievementId: string, tier: AchievementTier) => void
): Promise<void> {
  try {
    // Per security rules: Use Edge Function instead of direct RPC
    const { data: progressData, error } = await achievementsApi.getMyAchievements();

    if (error || !progressData) return;

    const tiers: AchievementTier[] = ['bronze', 'silver', 'gold', 'platinum'];

    for (const progress of progressData) {
      for (const tier of tiers) {
        const unlockedAt = progress[`${tier}_unlocked_at`];
        if (unlockedAt) {
          const unlockKey = `${progress.achievement_id}-${tier}`;
          
          // Check if this was unlocked in the last 5 seconds and we haven't celebrated it
          const unlockTime = new Date(unlockedAt).getTime();
          const now = Date.now();
          const isRecent = now - unlockTime < 5000;
          
          if (isRecent && !celebratedUnlocks.has(unlockKey)) {
            celebratedUnlocks.add(unlockKey);
            showCelebration(progress.achievement_id, tier);

            // Send push notification for the new unlock
            sendAchievementNotification(userId, progress.achievement_id, tier);

            // Clean up old entries after 1 minute
            setTimeout(() => {
              celebratedUnlocks.delete(unlockKey);
            }, 60000);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error checking for unlocks:', error);
  }
}