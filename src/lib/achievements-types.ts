// achievements-types.ts - Type definitions and constants for MoveTogether Achievements System

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export type AchievementCategory = 
  | 'competition' 
  | 'consistency' 
  | 'milestone' 
  | 'social';

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  icon: string;
  tiers: {
    bronze?: { threshold: number };
    silver?: { threshold: number };
    gold?: { threshold: number };
    platinum?: { threshold: number };
  };
  tierDescriptions?: {
    bronze?: string;
    silver?: string;
    gold?: string;
    platinum?: string;
  };
}

export interface UserAchievementProgress {
  userId: string;
  achievementId: string;
  currentProgress: number;
  tiersUnlocked: {
    bronze: Date | null;
    silver: Date | null;
    gold: Date | null;
    platinum: Date | null;
  };
  lastUpdated: Date;
}

export interface AchievementWithProgress extends AchievementDefinition {
  currentProgress: number;
  tiersUnlocked: {
    bronze: Date | null;
    silver: Date | null;
    gold: Date | null;
    platinum: Date | null;
  };
  currentTier: AchievementTier | null;
  nextTier: AchievementTier | null;
  progressToNextTier: number;
  canAccess: boolean;
}

export const TIER_CONFIG: Record<AchievementTier, {
  label: string;
  points: number;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    gradient: string[];
  };
}> = {
  bronze: {
    label: 'Bronze',
    points: 1,
    colors: {
      primary: '#CD7F32',
      secondary: '#8B4513',
      accent: '#DEB887',
      gradient: ['#CD7F32', '#8B4513', '#A0522D'],
    },
  },
  silver: {
    label: 'Silver',
    points: 2,
    colors: {
      primary: '#C0C0C0',
      secondary: '#808080',
      accent: '#E8E8E8',
      gradient: ['#E8E8E8', '#C0C0C0', '#A8A8A8'],
    },
  },
  gold: {
    label: 'Gold',
    points: 3,
    colors: {
      primary: '#FFD700',
      secondary: '#DAA520',
      accent: '#FFF8DC',
      gradient: ['#FFD700', '#FFC125', '#DAA520'],
    },
  },
  platinum: {
    label: 'Platinum',
    points: 4,
    colors: {
      primary: '#5BA3D9',
      secondary: '#A8D4F0',
      accent: '#E0F4FF',
      gradient: ['#E0F4FF', '#A8D4F0', '#E0F4FF', '#B8E0FF', '#E0F4FF'],
    },
  },
};

export const TIER_ORDER: AchievementTier[] = ['bronze', 'silver', 'gold', 'platinum'];

export function getNextTier(
  currentTier: AchievementTier | null,
  tiers?: AchievementDefinition['tiers']
): AchievementTier | null {
  const startIndex = currentTier ? TIER_ORDER.indexOf(currentTier) + 1 : 0;
  if (startIndex >= TIER_ORDER.length) return null;

  for (let i = startIndex; i < TIER_ORDER.length; i++) {
    const tier = TIER_ORDER[i];
    // If no tiers definition provided, return the next tier in order
    // If tiers provided, only return tiers that exist in the definition
    if (!tiers || tiers[tier]) {
      return tier;
    }
  }
  return null;
}

export function getHighestUnlockedTier(
  tiersUnlocked: Record<AchievementTier, Date | null>
): AchievementTier | null {
  for (let i = TIER_ORDER.length - 1; i >= 0; i--) {
    if (tiersUnlocked[TIER_ORDER[i]]) {
      return TIER_ORDER[i];
    }
  }
  return null;
}

export function calculateProgressToNextTier(
  currentProgress: number,
  tiers: AchievementDefinition['tiers'],
  currentTier: AchievementTier | null
): number {
  const nextTier = getNextTier(currentTier, tiers);
  if (!nextTier || !tiers[nextTier]) return 100;

  const currentThreshold = currentTier && tiers[currentTier] ? tiers[currentTier].threshold : 0;
  const nextThreshold = tiers[nextTier].threshold;

  const progressInTier = currentProgress - currentThreshold;
  const tierRange = nextThreshold - currentThreshold;

  if (tierRange <= 0) return 100;
  return Math.min(100, Math.max(0, (progressInTier / tierRange) * 100));
}