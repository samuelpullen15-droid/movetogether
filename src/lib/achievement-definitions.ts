// achievement-definitions.ts - All achievement definitions for MoveTogether

import { AchievementDefinition } from './achievements-types';

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  // COMPETITION ACHIEVEMENTS
  {
    id: 'competitions_won',
    name: 'Champion',
    description: 'Win competitions to prove your dominance',
    category: 'competition',
    icon: 'trophy',
    tiers: {
      bronze: { threshold: 5 },
      silver: { threshold: 25 },
      gold: { threshold: 100 },
      platinum: { threshold: 500 },
    },
  },
  {
    id: 'win_streak',
    name: 'Unstoppable',
    description: 'Win consecutive competitions without a loss',
    category: 'competition',
    icon: 'flame',
    tiers: {
      bronze: { threshold: 2 },
      silver: { threshold: 5 },
      gold: { threshold: 10 },
      platinum: { threshold: 25 },
    },
  },
  {
    id: 'first_blood',
    name: 'First Blood',
    description: 'Win your very first competition',
    category: 'competition',
    icon: 'swords',
    tiers: {
      bronze: { threshold: 1 },
      silver: { threshold: 1 },
      gold: { threshold: 1 },
      platinum: { threshold: 1 },
    },
  },
  {
    id: 'underdog',
    name: 'Underdog',
    description: 'Come from last place to win a competition',
    category: 'competition',
    icon: 'trending-up',
    tiers: {
      bronze: { threshold: 1 },
      silver: { threshold: 5 },
      gold: { threshold: 15 },
      platinum: { threshold: 50 },
    },
  },
  {
    id: 'photo_finish',
    name: 'Photo Finish',
    description: 'Win a competition by less than 1% margin',
    category: 'competition',
    icon: 'camera',
    tiers: {
      bronze: { threshold: 1 },
      silver: { threshold: 5 },
      gold: { threshold: 15 },
      platinum: { threshold: 50 },
    },
  },
  {
    id: 'dominant_victory',
    name: 'Dominant',
    description: 'Win a competition by more than 50% margin',
    category: 'competition',
    icon: 'crown',
    tiers: {
      bronze: { threshold: 1 },
      silver: { threshold: 10 },
      gold: { threshold: 25 },
      platinum: { threshold: 100 },
    },
  },

  // CONSISTENCY ACHIEVEMENTS
  {
    id: 'daily_streak',
    name: 'Iron Will',
    description: 'Log activity every day without missing',
    category: 'consistency',
    icon: 'calendar-check',
    tiers: {
      bronze: { threshold: 7 },
      silver: { threshold: 30 },
      gold: { threshold: 100 },
      platinum: { threshold: 365 },
    },
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    description: 'Log activity before 6am',
    category: 'consistency',
    icon: 'sunrise',
    tiers: {
      bronze: { threshold: 7 },
      silver: { threshold: 30 },
      gold: { threshold: 100 },
      platinum: { threshold: 365 },
    },
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Log activity after 10pm',
    category: 'consistency',
    icon: 'moon',
    tiers: {
      bronze: { threshold: 7 },
      silver: { threshold: 30 },
      gold: { threshold: 100 },
      platinum: { threshold: 365 },
    },
  },
  {
    id: 'weekend_warrior',
    name: 'Weekend Warrior',
    description: 'Complete activity on both Saturday and Sunday',
    category: 'consistency',
    icon: 'calendar',
    tiers: {
      bronze: { threshold: 4 },
      silver: { threshold: 12 },
      gold: { threshold: 52 },
      platinum: { threshold: 104 },
    },
  },

  // MILESTONE ACHIEVEMENTS
  {
    id: 'total_calories',
    name: 'Furnace',
    description: 'Total calories burned across all activities',
    category: 'milestone',
    icon: 'flame',
    tiers: {
      bronze: { threshold: 10000 },
      silver: { threshold: 50000 },
      gold: { threshold: 250000 },
      platinum: { threshold: 1000000 },
    },
  },
  {
    id: 'total_steps',
    name: 'Wanderer',
    description: 'Total steps taken across all activities',
    category: 'milestone',
    icon: 'footprints',
    tiers: {
      bronze: { threshold: 100000 },
      silver: { threshold: 500000 },
      gold: { threshold: 2000000 },
      platinum: { threshold: 10000000 },
    },
  },
  {
    id: 'total_active_minutes',
    name: 'Time Lord',
    description: 'Total active minutes logged',
    category: 'milestone',
    icon: 'clock',
    tiers: {
      bronze: { threshold: 1000 },
      silver: { threshold: 5000 },
      gold: { threshold: 20000 },
      platinum: { threshold: 100000 },
    },
  },
  {
    id: 'daily_record_calories',
    name: 'Inferno',
    description: 'Set a personal record for calories burned in a single day',
    category: 'milestone',
    icon: 'zap',
    tiers: {
      bronze: { threshold: 500 },
      silver: { threshold: 1000 },
      gold: { threshold: 2000 },
      platinum: { threshold: 3500 },
    },
  },

  // SOCIAL ACHIEVEMENTS
  {
    id: 'unique_opponents',
    name: 'Social Butterfly',
    description: 'Compete against different people',
    category: 'social',
    icon: 'users',
    tiers: {
      bronze: { threshold: 5 },
      silver: { threshold: 15 },
      gold: { threshold: 50 },
      platinum: { threshold: 100 },
    },
  },
  {
    id: 'rivalry',
    name: 'Rival',
    description: 'Beat the same person multiple times',
    category: 'social',
    icon: 'swords',
    tiers: {
      bronze: { threshold: 3 },
      silver: { threshold: 5 },
      gold: { threshold: 10 },
      platinum: { threshold: 25 },
    },
  },
  {
    id: 'competitions_created',
    name: 'Organizer',
    description: 'Create competitions and invite friends',
    category: 'social',
    icon: 'plus-circle',
    tiers: {
      bronze: { threshold: 3 },
      silver: { threshold: 10 },
      gold: { threshold: 25 },
      platinum: { threshold: 100 },
    },
  },
  {
    id: 'invites_sent',
    name: 'Recruiter',
    description: 'Invite friends to join MoveTogether',
    category: 'social',
    icon: 'send',
    tiers: {
      bronze: { threshold: 3 },
      silver: { threshold: 10 },
      gold: { threshold: 25 },
      platinum: { threshold: 50 },
    },
  },
  {
    id: 'group_competitions',
    name: 'Party Animal',
    description: 'Participate in competitions with 4+ people',
    category: 'social',
    icon: 'users',
    tiers: {
      bronze: { threshold: 5 },
      silver: { threshold: 20 },
      gold: { threshold: 50 },
      platinum: { threshold: 100 },
    },
  },
];

export function getAchievementById(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENT_DEFINITIONS.find((a) => a.id === id);
}

export function getAchievementsByCategory(
  category: AchievementDefinition['category']
): AchievementDefinition[] {
  return ACHIEVEMENT_DEFINITIONS.filter((a) => a.category === category);
}