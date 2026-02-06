/**
 * Movement Trail Streak System Types
 *
 * Type definitions for the streak tracking, milestone rewards,
 * and activity logging system.
 */

// ============================================================================
// REWARD TYPES
// ============================================================================

/**
 * Types of rewards that can be earned from milestones
 */
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

/**
 * Types of celebration animations for milestone achievements
 */
export type CelebrationType = 'confetti' | 'fireworks' | 'sparkle' | 'glow';

/**
 * Activity types that can qualify for streak continuation
 */
export type StreakActivityType =
  | 'steps'
  | 'workout'
  | 'active_minutes'
  | 'rings_closed'
  | 'competition_goal';

/**
 * Health data provider sources
 */
export type HealthProviderSource =
  | 'apple_health'
  | 'fitbit'
  | 'garmin'
  | 'whoop'
  | 'oura'
  | 'samsung'
  | 'manual';

// ============================================================================
// MILESTONE
// ============================================================================

/**
 * Value object for milestone rewards
 */
export interface MilestoneRewardValue {
  /** Duration in hours for trial rewards */
  trialHours?: number;
  /** ID of badge to award */
  badgeId?: string;
  /** ID of profile frame to unlock */
  frameId?: string;
  /** ID of leaderboard flair to unlock */
  flairId?: string;
  /** ID of app icon to unlock */
  iconId?: string;
  /** Points multiplier value (e.g., 1.5 for 50% bonus) */
  multiplier?: number;
  /** Custom data for special rewards */
  customData?: Record<string, unknown>;
}

/**
 * A streak milestone that users can earn
 */
export interface Milestone {
  /** Unique identifier */
  id: string;
  /** Day number in the streak when this milestone is earned */
  dayNumber: number;
  /** Display name of the milestone */
  name: string;
  /** Description of what the user achieved */
  description: string;
  /** Type of reward granted */
  rewardType: StreakRewardType;
  /** Reward configuration values */
  rewardValue: MilestoneRewardValue;
  /** Name of the icon to display (lucide-react-native icon name) */
  iconName: string;
  /** Type of celebration animation to show */
  celebrationType: CelebrationType;
  /** Whether this milestone can be earned multiple times */
  isRepeatable: boolean;
  /** For repeatable milestones, how many days between repeats */
  repeatInterval?: number | null;
}

// ============================================================================
// USER STREAK
// ============================================================================

/**
 * User's streak tracking data
 */
export interface UserStreak {
  /** Unique identifier */
  id: string;
  /** User's ID */
  userId: string;
  /** Current consecutive day streak */
  currentStreak: number;
  /** Longest streak ever achieved */
  longestStreak: number;
  /** Date of last qualifying activity (YYYY-MM-DD) */
  lastActivityDate: string | null;
  /** When the current streak started */
  streakStartedAt: string | null;
  /** User's timezone for streak calculations */
  timezone: string;
  /** Number of streak shields available to use */
  streakShieldsAvailable: number;
  /** Shields used in the current week */
  streakShieldsUsedThisWeek: number;
  /** Start of the current shield week */
  shieldWeekStart: string | null;
  /** Total number of days with qualifying activity */
  totalActiveDays: number;
}

// ============================================================================
// MILESTONE PROGRESS
// ============================================================================

/**
 * Tracks a user's progress toward and completion of milestones
 */
export interface MilestoneProgress {
  /** Unique identifier */
  id: string;
  /** User's ID */
  userId: string;
  /** ID of the milestone */
  milestoneId: string;
  /** The milestone details (when joined) */
  milestone?: Milestone;
  /** When the milestone was earned */
  earnedAt: string;
  /** Whether the reward has been claimed */
  rewardClaimed: boolean;
  /** When the reward was claimed */
  rewardClaimedAt: string | null;
  /** When the reward expires (for trial rewards) */
  rewardExpiresAt: string | null;
}

// ============================================================================
// STREAK ACTIVITY LOG
// ============================================================================

/**
 * Log entry for streak-qualifying activities
 */
export interface StreakActivityLog {
  /** Unique identifier */
  id: string;
  /** User's ID */
  userId: string;
  /** Date of the activity (YYYY-MM-DD in user's timezone) */
  activityDate: string;
  /** Type of activity logged */
  activityType: StreakActivityType;
  /** Numeric value of the activity (steps, minutes, etc.) */
  activityValue: number;
  /** Whether this activity meets streak qualification criteria */
  qualifiesForStreak: boolean;
  /** Source of the activity data */
  source: HealthProviderSource;
}

// ============================================================================
// STREAK STATUS
// ============================================================================

/**
 * Complete status of a user's streak including recent changes
 */
export interface StreakStatus {
  /** Current consecutive day streak */
  currentStreak: number;
  /** Longest streak ever achieved */
  longestStreak: number;
  /** Whether the streak was continued today */
  streakContinued: boolean;
  /** Whether a shield was used today */
  shieldUsed: boolean;
  /** Number of shields remaining */
  shieldsRemaining: number;
  /** Milestones earned from recent activity */
  milestonesEarned: Milestone[];
  /** Next milestone to earn, with days until earned */
  nextMilestone: (Milestone & { daysAway: number }) | null;
  /** Whether the streak is at risk of being lost */
  streakAtRisk: boolean;
  /** Whether today has qualifying activity */
  todayQualified: boolean;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Response from logging streak activity
 */
export interface LogStreakActivityResponse {
  success: boolean;
  streakUpdated: boolean;
  currentStreak: number;
  streakContinued: boolean;
  shieldUsed: boolean;
  milestonesEarned: Array<{
    milestoneId: string;
    dayNumber: number;
    name: string;
    description: string;
    rewardType: StreakRewardType;
    rewardValue: MilestoneRewardValue;
    iconName?: string;
    celebrationType?: CelebrationType;
  }>;
  error?: string;
}

/**
 * Response from claiming a milestone reward
 */
export interface ClaimRewardResponse {
  success: boolean;
  rewardType?: StreakRewardType;
  expiresAt?: string;
  error?: string;
}

/**
 * Response from using a streak shield
 */
export interface UseShieldResponse {
  success: boolean;
  shieldsRemaining?: number;
  error?: string;
}

// ============================================================================
// HOOK RETURN TYPES
// ============================================================================

/**
 * Return type for the useStreak hook
 */
export interface UseStreakReturn {
  /** Current streak count */
  currentStreak: number;
  /** Longest streak ever achieved */
  longestStreak: number;
  /** Whether the streak is at risk today */
  streakAtRisk: boolean;
  /** Number of streak shields available */
  streakShieldsAvailable: number;
  /** Whether today has qualifying activity */
  todayQualified: boolean;
  /** Next milestone to earn */
  nextMilestone: (Milestone & { daysAway: number }) | null;
  /** All earned milestones */
  earnedMilestones: MilestoneProgress[];
  /** All available milestones */
  allMilestones: Milestone[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: string | null;
  /** Refresh streak data */
  refresh: () => Promise<void>;
  /** Claim a milestone reward */
  claimReward: (milestoneProgressId: string) => Promise<ClaimRewardResponse>;
  /** Use a streak shield */
  useShield: () => Promise<UseShieldResponse>;
}

// ============================================================================
// DATABASE ROW TYPES (snake_case for Supabase)
// ============================================================================

/**
 * Database row type for user_streaks table
 */
export interface UserStreakRow {
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
  created_at: string;
  updated_at: string;
}

/**
 * Database row type for streak_milestones table
 */
export interface MilestoneRow {
  id: string;
  day_number: number;
  name: string;
  description: string;
  reward_type: StreakRewardType;
  reward_value: MilestoneRewardValue;
  icon_name: string;
  celebration_type: CelebrationType;
  is_repeatable: boolean;
  repeat_interval: number | null;
  created_at: string;
}

/**
 * Database row type for user_milestone_progress table
 */
export interface MilestoneProgressRow {
  id: string;
  user_id: string;
  milestone_id: string;
  earned_at: string;
  reward_claimed: boolean;
  reward_claimed_at: string | null;
  reward_expires_at: string | null;
  created_at: string;
}

/**
 * Database row type for streak_activity_log table
 */
export interface StreakActivityLogRow {
  id: string;
  user_id: string;
  activity_date: string;
  activity_type: StreakActivityType;
  activity_value: number;
  qualifies_for_streak: boolean;
  source: HealthProviderSource;
  created_at: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Converts database row to client model
 */
export type RowToModel<T> = {
  [K in keyof T as K extends `${infer First}_${infer Rest}`
    ? `${First}${Capitalize<Rest>}`
    : K]: T[K];
};

/**
 * Milestone with days away calculation
 */
export type MilestoneWithDaysAway = Milestone & {
  daysAway: number;
};
