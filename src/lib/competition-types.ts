// Competition Creation Types

export type ScoringType =
  | 'ring_close'
  | 'percentage'
  | 'raw_numbers'
  | 'step_count'
  | 'workout';

export type WorkoutType = 'cycling' | 'running' | 'swimming' | 'walking';

export type WorkoutMetric = 'distance' | 'heart_rate' | 'steps';

export type RepeatOption = 'none' | 'weekly' | 'biweekly' | 'monthly';

export interface ScoringConfig {
  type: ScoringType;
  // For workout scoring
  workoutTypes?: WorkoutType[];
  workoutMetric?: WorkoutMetric;
}

export interface CompetitionSettings {
  name: string;
  startDate: Date;
  endDate: Date;
  repeat: RepeatOption;
  isPublic: boolean;
  scoring: ScoringConfig;
  invitedFriends: string[]; // User IDs
}

export interface ScoringTypeInfo {
  id: ScoringType;
  name: string;
  description: string;
  icon: string;
  color: string;
  learnMore?: string;
}

export const SCORING_TYPES: ScoringTypeInfo[] = [
  {
    id: 'ring_close',
    name: 'Ring Close Count',
    description: 'Points for closing each activity ring',
    icon: 'circle',
    color: '#FA114F',
    learnMore: 'Every ring you close (Move, Exercise, Stand) earns you 1 point. Close all three rings in a day to earn 3 points. This scoring method rewards consistency in completing your daily goals.',
  },
  {
    id: 'percentage',
    name: 'Percentage of Goals',
    description: 'Points based on goal completion percentage',
    icon: 'percent',
    color: '#92E82A',
    learnMore: 'Every 1% of an activity ring filled earns 1 point. Fill your Move ring to 150%? That\'s 150 points! This method rewards going above and beyond your daily goals.',
  },
  {
    id: 'raw_numbers',
    name: 'Raw Numbers',
    description: 'Points for every calorie, minute, and hour',
    icon: 'hash',
    color: '#00D4FF',
    learnMore: 'Every calorie burned earns 1 point, every exercise minute earns 1 point, and every stand hour earns 1 point. No daily maximum—the more you do, the more points you earn!',
  },
  {
    id: 'step_count',
    name: 'Step Count',
    description: 'Points for every step taken',
    icon: 'footprints',
    color: '#FFD700',
    learnMore: 'Every step you take earns 1 point. Simple and straightforward—just keep moving! Great for walking challenges and daily activity goals.',
  },
  {
    id: 'workout',
    name: 'Workout Based',
    description: 'Points only during specific workout types',
    icon: 'dumbbell',
    color: '#FF6B35',
    learnMore: 'Only activity logged during selected workout types counts toward points. Choose which workouts count and which metric to track (distance, heart rate, or steps).',
  },
];

export const WORKOUT_TYPES: { id: WorkoutType; name: string; icon: string }[] = [
  { id: 'cycling', name: 'Cycling', icon: 'bike' },
  { id: 'running', name: 'Running', icon: 'running' },
  { id: 'swimming', name: 'Swimming', icon: 'waves' },
  { id: 'walking', name: 'Walking', icon: 'footprints' },
];

export const WORKOUT_METRICS: { id: WorkoutMetric; name: string; description: string }[] = [
  { id: 'distance', name: 'Distance', description: '1 point per meter' },
  { id: 'heart_rate', name: 'Heart Rate', description: '1 point per beat above resting' },
  { id: 'steps', name: 'Steps', description: '1 point per step during workout' },
];

export const REPEAT_OPTIONS: { id: RepeatOption; name: string }[] = [
  { id: 'none', name: 'Does not repeat' },
  { id: 'weekly', name: 'Repeats weekly' },
  { id: 'biweekly', name: 'Repeats every 2 weeks' },
  { id: 'monthly', name: 'Repeats monthly' },
];

// Mock friends for invite system
export interface Friend {
  id: string;
  name: string;
  avatar: string;
  username: string;
  subscriptionTier?: 'starter' | 'mover' | 'crusher' | null;
}

export const MOCK_FRIENDS: Friend[] = [
  { id: '2', name: 'Jordan', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop', username: '@jordan_fit' },
  { id: '3', name: 'Taylor', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop', username: '@taylor_runs' },
  { id: '4', name: 'Casey', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop', username: '@casey_active' },
  { id: '5', name: 'Morgan', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop', username: '@morgan_moves' },
  { id: '6', name: 'Riley', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop', username: '@riley_strong' },
  { id: '7', name: 'Sam', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop', username: '@sam_wellness' },
  { id: '8', name: 'Drew', avatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=200&h=200&fit=crop', username: '@drew_daily' },
  { id: '9', name: 'Jamie', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop', username: '@jamie_athlete' },
];
