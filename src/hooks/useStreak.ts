/**
 * useStreak Hook
 *
 * Manages the Movement Trail streak system with real-time updates.
 * Tracks user streaks, milestones, shields, and rewards.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { streakApi } from '@/lib/edge-functions';

// ============================================================================
// TYPES
// ============================================================================

export type StreakRewardType =
  | 'badge'
  | 'trial_mover'
  | 'trial_coach'
  | 'trial_crusher'
  | 'profile_frame'
  | 'leaderboard_flair'
  | 'app_icon'
  | 'points_multiplier'
  | 'custom';

export type ActivityType =
  | 'steps'
  | 'workout'
  | 'competition_goal'
  | 'active_minutes'
  | 'rings_closed'
  | 'custom';

export type StreakStatus = 'safe' | 'at_risk' | 'broken';

export interface Milestone {
  id: string;
  day_number: number;
  name: string;
  description: string;
  reward_type: StreakRewardType;
  reward_value: Record<string, unknown>;
  icon_name: string;
  celebration_type: string;
  is_repeatable: boolean;
  repeat_interval: number | null;
}

export interface MilestoneProgress {
  id: string;
  user_id: string;
  milestone_id: string;
  earned_at: string;
  reward_claimed: boolean;
  reward_claimed_at: string | null;
  reward_expires_at: string | null;
  // Joined milestone data
  milestone?: Milestone;
}

export interface StreakData {
  id: string;
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  streak_started_at: string | null;
  timezone: string;
  streak_shields_available: number;
  streak_shields_used_this_week: number;
  shield_week_start: string | null;
  total_active_days: number;
}

export interface NextMilestone extends Milestone {
  days_away: number;
}

export interface LogActivityResult {
  activity_logged: boolean;
  activity_date: string;
  qualifies_for_streak: boolean;
  was_new_qualifying_activity: boolean;
  streak_processed: boolean;
  streak_status: {
    current_streak: number;
    longest_streak: number;
    streak_continued: boolean;
    streak_started: boolean;
    streak_broken: boolean;
    shield_used: boolean;
    shields_remaining: number;
    milestones_earned: Array<{
      milestone_id: string;
      day_number: number;
      name: string;
      description: string;
      reward_type: StreakRewardType;
      reward_value: Record<string, unknown>;
      icon_name: string;
      celebration_type: string;
      reward_expires_at: string | null;
    }>;
    next_milestone: {
      day_number: number;
      name: string;
      days_away: number;
    } | null;
    total_active_days: number;
  } | null;
}

export interface UseStreakReturn {
  // State
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  streakShieldsAvailable: number;
  totalActiveDays: number;
  isLoading: boolean;
  error: string | null;
  currentMilestone: Milestone | null;
  nextMilestone: NextMilestone | null;
  earnedMilestones: MilestoneProgress[];
  unclaimedRewards: MilestoneProgress[];
  streakAtRisk: boolean;
  timezone: string;

  // Functions
  fetchStreakData: () => Promise<void>;
  logActivity: (
    type: ActivityType,
    value: number,
    source?: string
  ) => Promise<LogActivityResult | null>;
  claimReward: (milestoneProgressId: string) => Promise<boolean>;
  useStreakShield: () => Promise<boolean>;
  getStreakStatus: () => StreakStatus;
  updateTimezone: (timezone: string) => Promise<boolean>;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useStreak(): UseStreakReturn {
  const user = useAuthStore((s) => s.user);

  // Streak data state
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [lastActivityDate, setLastActivityDate] = useState<string | null>(null);
  const [streakShieldsAvailable, setStreakShieldsAvailable] = useState(1);
  const [totalActiveDays, setTotalActiveDays] = useState(0);
  const [timezone, setTimezone] = useState('America/New_York');

  // Milestone state
  const [allMilestones, setAllMilestones] = useState<Milestone[]>([]);
  const [earnedMilestones, setEarnedMilestones] = useState<MilestoneProgress[]>([]);
  const [currentMilestone, setCurrentMilestone] = useState<Milestone | null>(null);
  const [nextMilestone, setNextMilestone] = useState<NextMilestone | null>(null);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track subscriptions for cleanup
  const subscriptionsRef = useRef<Array<{ unsubscribe: () => void }>>([]);

  // ============================================================================
  // DERIVED STATE
  // ============================================================================

  // Calculate if streak is at risk (no activity today and would break streak)
  const streakAtRisk = useCallback(() => {
    if (!lastActivityDate || currentStreak === 0) return false;

    const today = getTodayInTimezone(timezone);
    const yesterday = getYesterdayInTimezone(timezone);

    // If last activity was yesterday and no activity today, streak is at risk
    return lastActivityDate === yesterday && lastActivityDate !== today;
  }, [lastActivityDate, currentStreak, timezone]);

  // Calculate unclaimed rewards
  const unclaimedRewards = earnedMilestones.filter(
    (mp) => !mp.reward_claimed && (!mp.reward_expires_at || new Date(mp.reward_expires_at) > new Date())
  );

  // ============================================================================
  // FETCH FUNCTIONS
  // ============================================================================

  const fetchStreakData = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Fetch all data in parallel
      const [streakResult, milestonesResult, progressResult] = await Promise.all([
        streakApi.getMyStreak(),
        streakApi.getAllMilestones(),
        streakApi.getMyMilestoneProgress(),
      ]);

      // Handle streak data
      if (streakResult.error) {
        console.error('[useStreak] Error fetching streak:', streakResult.error);
        // If no streak exists yet, use defaults
        if (!streakResult.error.message?.includes('No streak found')) {
          setError('Failed to load streak data');
        }
      } else if (streakResult.data) {
        const streak = streakResult.data;
        setCurrentStreak(streak.current_streak);
        setLongestStreak(streak.longest_streak);
        setLastActivityDate(streak.last_activity_date);
        setStreakShieldsAvailable(streak.streak_shields_available);
        setTotalActiveDays(streak.total_active_days);
        setTimezone(streak.timezone || 'America/New_York');
      }

      // Handle milestones data
      if (milestonesResult.error) {
        console.error('[useStreak] Error fetching milestones:', milestonesResult.error);
      } else if (milestonesResult.data) {
        setAllMilestones(milestonesResult.data);
        updateCurrentAndNextMilestone(milestonesResult.data, streakResult.data?.current_streak || 0);
      }

      // Handle milestone progress data
      if (progressResult.error) {
        console.error('[useStreak] Error fetching progress:', progressResult.error);
      } else if (progressResult.data) {
        setEarnedMilestones(progressResult.data);
      }
    } catch (err) {
      console.error('[useStreak] Error in fetchStreakData:', err);
      setError('Failed to load streak data');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Helper to update current and next milestone based on streak
  const updateCurrentAndNextMilestone = (milestones: Milestone[], streak: number) => {
    // Sort milestones by day_number
    const sorted = [...milestones].sort((a, b) => a.day_number - b.day_number);

    // Find current milestone (highest day_number <= current streak)
    let current: Milestone | null = null;
    let next: NextMilestone | null = null;

    for (const milestone of sorted) {
      if (milestone.day_number <= streak) {
        current = milestone;
      } else if (!next) {
        next = {
          ...milestone,
          days_away: milestone.day_number - streak,
        };
      }
    }

    setCurrentMilestone(current);
    setNextMilestone(next);
  };

  // ============================================================================
  // ACTION FUNCTIONS
  // ============================================================================

  const logActivity = useCallback(
    async (
      type: ActivityType,
      value: number,
      source = 'manual'
    ): Promise<LogActivityResult | null> => {
      if (!user?.id) {
        setError('Not authenticated');
        return null;
      }

      try {
        setError(null);

        const result = await streakApi.logActivity(type, value, source);

        if (result.error) {
          console.error('[useStreak] Error logging activity:', result.error);
          setError('Failed to log activity');
          return null;
        }

        if (result.data) {
          const { streak_status } = result.data;

          // Update local state from response
          if (streak_status) {
            setCurrentStreak(streak_status.current_streak);
            setLongestStreak(streak_status.longest_streak);
            setStreakShieldsAvailable(streak_status.shields_remaining);
            setTotalActiveDays(streak_status.total_active_days);

            // Update last activity date
            if (result.data.activity_date) {
              setLastActivityDate(result.data.activity_date);
            }

            // Update next milestone
            if (streak_status.next_milestone) {
              const nextMs = allMilestones.find(
                (m) => m.day_number === streak_status.next_milestone?.day_number
              );
              if (nextMs) {
                setNextMilestone({
                  ...nextMs,
                  days_away: streak_status.next_milestone.days_away,
                });
              }
            }

            // Refresh earned milestones if new ones were earned
            if (streak_status.milestones_earned && streak_status.milestones_earned.length > 0) {
              // Refresh milestone progress to get full data
              const progressResult = await streakApi.getMyMilestoneProgress();
              if (progressResult.data) {
                setEarnedMilestones(progressResult.data);
              }
            }

            // Update current milestone
            updateCurrentAndNextMilestone(allMilestones, streak_status.current_streak);
          }

          return result.data;
        }

        return null;
      } catch (err) {
        console.error('[useStreak] Error in logActivity:', err);
        setError('Failed to log activity');
        return null;
      }
    },
    [user?.id, allMilestones]
  );

  const claimReward = useCallback(
    async (milestoneProgressId: string): Promise<boolean> => {
      if (!user?.id) {
        setError('Not authenticated');
        return false;
      }

      try {
        setError(null);

        // Optimistic update
        setEarnedMilestones((prev) =>
          prev.map((mp) =>
            mp.id === milestoneProgressId
              ? { ...mp, reward_claimed: true, reward_claimed_at: new Date().toISOString() }
              : mp
          )
        );

        const result = await streakApi.claimReward(milestoneProgressId);

        if (result.error) {
          console.error('[useStreak] Error claiming reward:', result.error);
          // Rollback
          setEarnedMilestones((prev) =>
            prev.map((mp) =>
              mp.id === milestoneProgressId
                ? { ...mp, reward_claimed: false, reward_claimed_at: null }
                : mp
            )
          );
          setError('Failed to claim reward');
          return false;
        }

        return true;
      } catch (err) {
        console.error('[useStreak] Error in claimReward:', err);
        setError('Failed to claim reward');
        return false;
      }
    },
    [user?.id]
  );

  const useStreakShield = useCallback(async (): Promise<boolean> => {
    if (!user?.id) {
      setError('Not authenticated');
      return false;
    }

    if (streakShieldsAvailable <= 0) {
      setError('No shields available');
      return false;
    }

    try {
      setError(null);

      // Optimistic update
      const previousShields = streakShieldsAvailable;
      setStreakShieldsAvailable((prev) => prev - 1);

      const result = await streakApi.useShield();

      if (result.error) {
        console.error('[useStreak] Error using shield:', result.error);
        // Rollback
        setStreakShieldsAvailable(previousShields);
        setError('Failed to use shield');
        return false;
      }

      // Update state from response
      if (result.data) {
        setCurrentStreak(result.data.current_streak);
        setStreakShieldsAvailable(result.data.shields_remaining);
      }

      return true;
    } catch (err) {
      console.error('[useStreak] Error in useStreakShield:', err);
      setError('Failed to use shield');
      return false;
    }
  }, [user?.id, streakShieldsAvailable]);

  const getStreakStatus = useCallback((): StreakStatus => {
    if (currentStreak === 0) {
      return 'broken';
    }

    const today = getTodayInTimezone(timezone);

    // If we have activity today, streak is safe
    if (lastActivityDate === today) {
      return 'safe';
    }

    const yesterday = getYesterdayInTimezone(timezone);

    // If last activity was yesterday and no activity today, streak is at risk
    if (lastActivityDate === yesterday) {
      return 'at_risk';
    }

    // If last activity was before yesterday, streak is broken
    // (but current_streak hasn't been updated yet because user hasn't synced)
    return 'broken';
  }, [currentStreak, lastActivityDate, timezone]);

  const updateTimezone = useCallback(
    async (newTimezone: string): Promise<boolean> => {
      if (!user?.id) {
        setError('Not authenticated');
        return false;
      }

      try {
        setError(null);

        // Validate timezone
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: newTimezone });
        } catch {
          setError('Invalid timezone');
          return false;
        }

        const previousTimezone = timezone;
        setTimezone(newTimezone);

        const result = await streakApi.updateTimezone(newTimezone);

        if (result.error) {
          console.error('[useStreak] Error updating timezone:', result.error);
          setTimezone(previousTimezone);
          setError('Failed to update timezone');
          return false;
        }

        return true;
      } catch (err) {
        console.error('[useStreak] Error in updateTimezone:', err);
        setError('Failed to update timezone');
        return false;
      }
    },
    [user?.id, timezone]
  );

  // ============================================================================
  // REALTIME SUBSCRIPTIONS
  // ============================================================================

  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured() || !supabase) {
      return;
    }

    // Subscribe to user_streaks changes
    const streakSubscription = supabase
      .channel(`user_streaks:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_streaks',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[useStreak] Realtime streak update:', payload);
          if (payload.new && typeof payload.new === 'object') {
            const newData = payload.new as StreakData;
            setCurrentStreak(newData.current_streak);
            setLongestStreak(newData.longest_streak);
            setLastActivityDate(newData.last_activity_date);
            setStreakShieldsAvailable(newData.streak_shields_available);
            setTotalActiveDays(newData.total_active_days);
            setTimezone(newData.timezone || 'America/New_York');

            // Update milestone tracking
            updateCurrentAndNextMilestone(allMilestones, newData.current_streak);
          }
        }
      )
      .subscribe();

    // Subscribe to milestone progress changes
    const progressSubscription = supabase
      .channel(`user_milestone_progress:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_milestone_progress',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[useStreak] Realtime milestone progress insert:', payload);
          if (payload.new && typeof payload.new === 'object') {
            // Refresh milestone progress to get full data with joined milestone
            streakApi.getMyMilestoneProgress().then((result) => {
              if (result.data) {
                setEarnedMilestones(result.data);
              }
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_milestone_progress',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[useStreak] Realtime milestone progress update:', payload);
          if (payload.new && typeof payload.new === 'object') {
            const updated = payload.new as MilestoneProgress;
            setEarnedMilestones((prev) =>
              prev.map((mp) => (mp.id === updated.id ? { ...mp, ...updated } : mp))
            );
          }
        }
      )
      .subscribe();

    subscriptionsRef.current = [streakSubscription, progressSubscription];

    // Cleanup
    return () => {
      subscriptionsRef.current.forEach((sub) => {
        sub.unsubscribe();
      });
      subscriptionsRef.current = [];
    };
  }, [user?.id, allMilestones]);

  // ============================================================================
  // INITIAL LOAD
  // ============================================================================

  useEffect(() => {
    fetchStreakData();
  }, [fetchStreakData]);

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    // State
    currentStreak,
    longestStreak,
    lastActivityDate,
    streakShieldsAvailable,
    totalActiveDays,
    isLoading,
    error,
    currentMilestone,
    nextMilestone,
    earnedMilestones,
    unclaimedRewards,
    streakAtRisk: streakAtRisk(),
    timezone,

    // Functions
    fetchStreakData,
    logActivity,
    claimReward,
    useStreakShield,
    getStreakStatus,
    updateTimezone,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getTodayInTimezone(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

function getYesterdayInTimezone(timezone: string): string {
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(yesterday);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  } catch {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return yesterday.toISOString().split('T')[0];
  }
}

export default useStreak;
