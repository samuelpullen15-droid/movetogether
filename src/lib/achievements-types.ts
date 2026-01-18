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
    bronze: { threshold: number };
    silver: { threshold: number };
    gold: { threshold: number };
    platinum: { threshold: number };
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
      primary: '#B8E0FF',
      secondary: '#E0F4FF',
      accent: '#FFFFFF',
      gradient: ['#FFFFFF', '#B8E0FF', '#FFFFFF', '#E0F4FF', '#FFFFFF'],
    },
  },
};

export const TIER_ORDER: AchievementTier[] = ['bronze', 'silver', 'gold', 'platinum'];

export function getNextTier(currentTier: AchievementTier | null): AchievementTier | null {
  if (!currentTier) return 'bronze';
  const currentIndex = TIER_ORDER.indexOf(currentTier);
  if (currentIndex === -1 || currentIndex === TIER_ORDER.length - 1) return null;
  return TIER_ORDER[currentIndex + 1];
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
  const nextTier = getNextTier(currentTier);
  if (!nextTier) return 100;

  const currentThreshold = currentTier ? tiers[currentTier].threshold : 0;
  const nextThreshold = tiers[nextTier].threshold;
  
  const progressInTier = currentProgress - currentThreshold;
  const tierRange = nextThreshold - currentThreshold;
  
  return Math.min(100, Math.max(0, (progressInTier / tierRange) * 100));
}