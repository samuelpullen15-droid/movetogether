// Per security rules: Uses Edge Functions instead of direct RPC calls
import { isSupabaseConfigured } from './supabase';
import { getAvatarUrl } from './avatar-utils';
import { FriendProfile } from './social-types';
import { ACHIEVEMENT_DEFINITIONS } from './achievement-definitions';
import { AchievementTier } from './achievements-types';
import { profileApi } from './edge-functions';

/**
 * Get a user's public profile by user ID
 * Per security rules: Uses Edge Functions instead of direct table access
 */
export async function getUserProfile(userId: string): Promise<FriendProfile | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    // Use LOCAL timezone for "today" - this matches user expectations
    // Format: YYYY-MM-DD in local timezone
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // OPTIMIZATION: Fetch all data in parallel instead of sequentially
    // This significantly reduces load time by running independent API calls concurrently
    const [
      profileResult,
      fitnessResult,
      activityResult,
      statsResult,
      recentActivityResult,
      achievementResult,
    ] = await Promise.all([
      profileApi.getUserProfile(userId),
      profileApi.getUserFitnessGoals(userId),
      profileApi.getUserActivityForDate(userId, todayStr),
      profileApi.getUserCompetitionStats(userId),
      profileApi.getUserRecentActivity(userId, 90), // Reduced from 365 to 90 days for faster loading
      profileApi.getUserAchievementProgress(userId),
    ]);

    // Handle profile response - this is required
    const profile = profileResult.data as any;
    if (profileResult.error || !profile) {
      console.error('Error fetching user profile:', profileResult.error);
      return null;
    }

    // Handle fitness goals response
    const fitness = fitnessResult.data as any;
    const fitnessError = fitnessResult.error;

    // Use fetched goals or defaults (matching home page defaults)
    let moveGoal = fitness?.move_goal ?? 500;
    let exerciseGoal = fitness?.exercise_goal ?? 30;
    let standGoal = fitness?.stand_goal ?? 12;

    // Handle today's activity response
    const todayActivity = activityResult.data as any;

    // Today's Activity should ONLY show data for the current local date.
    // If there's no data for today (friend hasn't synced yet), show zeros.
    let moveCalories = 0;
    let exerciseMinutes = 0;
    let standHours = 0;

    console.log('[getUserProfile] Today\'s activity lookup:', {
      userId,
      todayStr,
      todayActivity: todayActivity ? {
        date: todayActivity.date,
        move_calories: todayActivity.move_calories,
        exercise_minutes: todayActivity.exercise_minutes,
        stand_hours: todayActivity.stand_hours,
      } : null,
    });

    if (todayActivity) {
      // Verify: (1) the date field matches today, and (2) the data was synced
      // AFTER the viewer's local midnight. This guarantees rings reset to 0 at
      // midnight even if stale data exists in the DB (e.g., from a background
      // sync that wrote yesterday's metrics under today's date).
      const isCorrectDate = !todayActivity.date || todayActivity.date === todayStr;

      let isSyncedToday = true; // default to true if synced_at is missing
      if (todayActivity.synced_at) {
        const syncedAt = new Date(todayActivity.synced_at);
        const syncedAtLocalDate = `${syncedAt.getFullYear()}-${String(syncedAt.getMonth() + 1).padStart(2, '0')}-${String(syncedAt.getDate()).padStart(2, '0')}`;
        isSyncedToday = syncedAtLocalDate === todayStr;
        if (!isSyncedToday) {
          console.warn('[getUserProfile] Stale sync detected — synced_at local date:', syncedAtLocalDate, 'todayStr:', todayStr);
        }
      }

      if (isCorrectDate && isSyncedToday) {
        moveCalories = typeof todayActivity.move_calories === 'number' ? todayActivity.move_calories : 0;
        exerciseMinutes = typeof todayActivity.exercise_minutes === 'number' ? todayActivity.exercise_minutes : 0;
        standHours = typeof todayActivity.stand_hours === 'number' ? todayActivity.stand_hours : 0;
      } else {
        console.warn('[getUserProfile] Activity rejected — date match:', isCorrectDate, 'synced today:', isSyncedToday);
      }
    }

    console.log('[getUserProfile] Final ring values:', { moveCalories, exerciseMinutes, standHours });

    const currentRings = {
      move: moveCalories,
      moveGoal,
      exercise: exerciseMinutes,
      exerciseGoal,
      stand: standHours,
      standGoal,
    };

    const displayName = profile.full_name || profile.username || 'User';
    const username = profile.username ? `@${profile.username}` : '';
    const avatar = getAvatarUrl(profile.avatar_url, displayName, profile.username || '');

    // Handle competition stats response
    const stats = statsResult.data as any;
    const statsError = statsResult.error;

    let totalPoints = 0;
    let competitionsJoined = 0;
    let competitionsWon = 0;

    if (!statsError && stats) {
      competitionsJoined = Number(stats.competitions_joined) || 0;
      competitionsWon = Number(stats.competitions_won) || 0;
      totalPoints = Number(stats.total_points) || 0;
    }

    // Handle recent activity response for streak calculation
    const recentActivity = recentActivityResult.data as any;
    const recentActivityError = recentActivityResult.error;

    let currentStreak = 0;
    let longestStreak = 0;
    let workoutsThisMonth = 0;

    // Use last_seen_at from profile for "active on app" status
    // This is the full ISO timestamp of when the user last opened the app
    // Pass full timestamp so frontend can compare using local timezone
    const lastActiveDate: string | undefined = profile.last_seen_at || undefined;

    if (!recentActivityError && recentActivity) {
      // Helper to check if activity has workout data
      // For streaks, only count days with workouts completed (from Apple Watch, Fitbit, Oura, Whoop)
      const hasActivityData = (a: typeof recentActivity[0]) => 
        a.workouts_completed && a.workouts_completed > 0;

      // Create a Set of dates with activity for O(1) lookup
      const datesWithActivity = new Set(
        recentActivity.filter(hasActivityData).map(a => a.date)
      );

      // Calculate current streak using UTC dates
      // Start from today (UTC) and count consecutive days backwards
      // Check up to 365 days to find the true current streak
      // IMPORTANT: Current streak MUST include today - if today has no activity, streak is 0
      const todayUtc = new Date().toISOString().split('T')[0];
      let checkDateMs = new Date(todayUtc + 'T00:00:00Z').getTime();
      const oneDayMs = 24 * 60 * 60 * 1000;
      let streakCount = 0;
      
      // First check if today has activity - if not, current streak is 0
      // Use the already calculated todayUtc to avoid any date recalculation issues
      if (!datesWithActivity.has(todayUtc)) {
        currentStreak = 0;
      } else {
        // Today has activity, count consecutive days backwards
        // Start from today and count backwards
        let checkDateMs = new Date(todayUtc + 'T00:00:00Z').getTime();
        for (let i = 0; i < 365; i++) {
          const checkDateStr = new Date(checkDateMs).toISOString().split('T')[0];
          
          if (datesWithActivity.has(checkDateStr)) {
            streakCount++;
          } else {
            // Gap found - streak ends
            break;
          }
          
          checkDateMs -= oneDayMs;
        }
        
        currentStreak = streakCount;
      }
      
      // Debug logging
      console.log('[getUserProfile] Streak calculation:', {
        userId,
        todayUtc,
        datesWithActivityCount: datesWithActivity.size,
        hasTodayActivity: datesWithActivity.has(todayUtc),
        currentStreak,
        recentDates: Array.from(datesWithActivity).slice(0, 10).sort().reverse(),
      });
      
      // Calculate longest streak by checking consecutive days properly
      // Sort dates and check for actual consecutive day gaps
      const sortedDates = [...datesWithActivity].sort();
      let maxStreak = 0;
      let tempStreak = 0;
      let prevDateMs: number | null = null;
      
      for (const dateStr of sortedDates) {
        const currentDateMs = new Date(dateStr + 'T00:00:00Z').getTime();
        
        if (prevDateMs === null) {
          // First date
          tempStreak = 1;
        } else {
          const daysDiff = (currentDateMs - prevDateMs) / oneDayMs;
          if (daysDiff === 1) {
            // Consecutive day
            tempStreak++;
          } else {
            // Gap in days, reset streak
            tempStreak = 1;
          }
        }
        
        maxStreak = Math.max(maxStreak, tempStreak);
        prevDateMs = currentDateMs;
      }
      
      longestStreak = maxStreak;
      
      // Count workouts this month from stored data (synced from Apple Health)
      const nowUtc = new Date();
      const firstDayOfMonthUtc = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), 1));
      const firstDayStr = firstDayOfMonthUtc.toISOString().split('T')[0];
      
      // Sum up workouts_completed from stored activity data
      workoutsThisMonth = recentActivity
        .filter(a => a.date >= firstDayStr)
        .reduce((sum, a) => sum + (a.workouts_completed || 0), 0);
    }

    // Fetch recent achievements using Edge Function
    // Per security rules: Use Edge Function instead of direct table access
    let recentAchievements: FriendProfile['recentAchievements'] = [];
    let goldMedals = 0;
    let silverMedals = 0;
    let bronzeMedals = 0;
    try {
      const achievementProgress = achievementResult.data as any[];
      const achievementError = achievementResult.error;

      if (!achievementError && achievementProgress) {
        const achievementMap = new Map(ACHIEVEMENT_DEFINITIONS.map(a => [a.id, a]));
        const allUnlocks: { id: string; name: string; type: AchievementTier; earnedDate: string }[] = [];

        // Collect all unlocked tiers
        for (const progress of achievementProgress) {
          const achievement = achievementMap.get(progress.achievement_id);
          if (!achievement) continue;

          // Count medals
          if (progress.bronze_unlocked_at) bronzeMedals++;
          if (progress.silver_unlocked_at) silverMedals++;
          if (progress.gold_unlocked_at) goldMedals++;

          const tiers: { tier: AchievementTier; date: string }[] = [];
          if (progress.bronze_unlocked_at) {
            tiers.push({ tier: 'bronze', date: progress.bronze_unlocked_at });
          }
          if (progress.silver_unlocked_at) {
            tiers.push({ tier: 'silver', date: progress.silver_unlocked_at });
          }
          if (progress.gold_unlocked_at) {
            tiers.push({ tier: 'gold', date: progress.gold_unlocked_at });
          }
          if (progress.platinum_unlocked_at) {
            tiers.push({ tier: 'platinum', date: progress.platinum_unlocked_at });
          }

          // Add each unlocked tier as a separate achievement entry
          for (const { tier, date } of tiers) {
            allUnlocks.push({
              id: `${progress.achievement_id}_${tier}`,
              name: achievement.name,
              type: tier,
              earnedDate: date,
            });
          }
        }

        // Sort by most recently earned (highest tier first if same date, then by date)
        allUnlocks.sort((a, b) => {
          const dateA = new Date(a.earnedDate).getTime();
          const dateB = new Date(b.earnedDate).getTime();
          if (dateA !== dateB) {
            return dateB - dateA; // Most recent first
          }
          // If same date, prioritize higher tiers
          const tierOrder: AchievementTier[] = ['platinum', 'gold', 'silver', 'bronze'];
          return tierOrder.indexOf(b.type) - tierOrder.indexOf(a.type);
        });

        // Limit to most recent 5 achievements
        recentAchievements = allUnlocks.slice(0, 5);
      }
    } catch (error) {
      console.error('[getUserProfile] Error fetching achievements:', error);
    }

    // Get subscription tier (default to 'starter' if not set)
    const subscriptionTier = (profile.subscription_tier as 'starter' | 'mover' | 'crusher') || 'starter';
    
    console.log('[getUserProfile] Subscription tier:', {
      userId,
      subscription_tier: profile.subscription_tier,
      finalTier: subscriptionTier,
    });

    // Build friend profile with calculated stats
    const friendProfile: FriendProfile = {
      id: profile.id,
      name: displayName,
      username,
      avatar,
      bio: '', // TODO: Add bio field to profiles table if needed
      memberSince: profile.created_at,
      subscriptionTier,
      lastActiveDate, // When user was last active (for activity status indicator)
      stats: {
        totalPoints,
        currentStreak,
        longestStreak,
        competitionsWon,
        competitionsJoined,
        workoutsThisMonth,
      },
      medals: {
        gold: goldMedals,
        silver: silverMedals,
        bronze: bronzeMedals,
      },
      recentAchievements,
      currentRings,
    };

    return friendProfile;
  } catch (error) {
    console.error('Error in getUserProfile:', error);
    return null;
  }
}
