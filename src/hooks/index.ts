// src/hooks/index.ts
// Barrel export for custom hooks

export { useReport } from './useReport';
export type { ContentType } from './useReport';
export { useChatModeration } from './useChatModeration';
export { useFairPlay } from './useFairPlay';
export { usePhotoUpload } from './usePhotoUpload';
export { useNotificationPreferences } from './useNotificationPreferences';
export { usePrivacySettings } from './usePrivacySettings';
export { useStreak } from './useStreak';
export type {
  Milestone,
  MilestoneProgress,
  StreakData,
  NextMilestone,
  StreakStatus,
  StreakRewardType,
  ActivityType,
  LogActivityResult,
  UseStreakReturn,
} from './useStreak';
export { usePrizeWins } from './usePrizeWins';
export type { PrizeWin } from './usePrizeWins';
