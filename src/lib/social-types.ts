// Social Feed Types

export type ActivityType =
  | 'workout_completed'
  | 'rings_closed'
  | 'streak_milestone'
  | 'medal_earned'
  | 'competition_won'
  | 'competition_joined';

export type ReactionType = 'heart' | 'fire' | 'clap' | 'muscle';

export interface Reaction {
  type: ReactionType;
  userId: string;
  userName: string;
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  timestamp: string;
}

export interface ActivityPost {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  type: ActivityType;
  timestamp: string;
  // Activity-specific data
  workoutType?: string;
  workoutDuration?: number; // minutes
  workoutCalories?: number;
  workoutDistance?: number; // meters
  streakDays?: number;
  medalName?: string;
  medalType?: 'gold' | 'silver' | 'bronze';
  competitionName?: string;
  ringsProgress?: {
    move: number;
    exercise: number;
    stand: number;
  };
  // Social data
  reactions: Reaction[];
  comments: Comment[];
}

export interface FriendProfile {
  id: string;
  name: string;
  username: string;
  avatar: string;
  bio: string;
  memberSince: string;
  subscriptionTier: 'starter' | 'mover' | 'crusher';
  stats: {
    totalPoints: number;
    currentStreak: number;
    longestStreak: number;
    competitionsWon: number;
    competitionsJoined: number;
    workoutsThisMonth: number;
  };
  medals: {
    gold: number;
    silver: number;
    bronze: number;
  };
  recentAchievements: {
    id: string;
    name: string;
    type: 'bronze' | 'silver' | 'gold' | 'platinum';
    earnedDate: string;
  }[];
  currentRings: {
    move: number;
    moveGoal: number;
    exercise: number;
    exerciseGoal: number;
    stand: number;
    standGoal: number;
  };
}

export const REACTION_CONFIG: Record<ReactionType, { emoji: string; label: string }> = {
  heart: { emoji: '❤️', label: 'Love' },
  fire: { emoji: '🔥', label: 'Fire' },
  clap: { emoji: '👏', label: 'Clap' },
  muscle: { emoji: '💪', label: 'Strong' },
};

// Mock activity feed data
export const MOCK_ACTIVITY_FEED: ActivityPost[] = [
  {
    id: '1',
    userId: '2',
    userName: 'Jordan',
    userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
    type: 'workout_completed',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 min ago
    workoutType: 'Running',
    workoutDuration: 32,
    workoutCalories: 320,
    workoutDistance: 5200,
    reactions: [
      { type: 'fire', userId: '3', userName: 'Taylor' },
      { type: 'muscle', userId: '4', userName: 'Casey' },
      { type: 'heart', userId: '5', userName: 'Morgan' },
    ],
    comments: [
      {
        id: 'c1',
        userId: '3',
        userName: 'Taylor',
        userAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
        text: 'Crushing it! 🏃‍♀️',
        timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      },
    ],
  },
  {
    id: '2',
    userId: '3',
    userName: 'Taylor',
    userAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
    type: 'rings_closed',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    ringsProgress: { move: 1.0, exercise: 1.0, stand: 1.0 },
    reactions: [
      { type: 'clap', userId: '2', userName: 'Jordan' },
      { type: 'heart', userId: '1', userName: 'Alex' },
    ],
    comments: [],
  },
  {
    id: '3',
    userId: '4',
    userName: 'Casey',
    userAvatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop',
    type: 'streak_milestone',
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
    streakDays: 30,
    reactions: [
      { type: 'fire', userId: '2', userName: 'Jordan' },
      { type: 'fire', userId: '3', userName: 'Taylor' },
      { type: 'muscle', userId: '5', userName: 'Morgan' },
      { type: 'clap', userId: '6', userName: 'Riley' },
    ],
    comments: [
      {
        id: 'c2',
        userId: '2',
        userName: 'Jordan',
        userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
        text: '30 days is incredible! So inspiring 🙌',
        timestamp: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'c3',
        userId: '5',
        userName: 'Morgan',
        userAvatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop',
        text: 'Goals!! Keep it up!',
        timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
  {
    id: '4',
    userId: '5',
    userName: 'Morgan',
    userAvatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop',
    type: 'medal_earned',
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
    medalName: 'Century Club',
    medalType: 'gold',
    reactions: [
      { type: 'clap', userId: '2', userName: 'Jordan' },
      { type: 'heart', userId: '3', userName: 'Taylor' },
    ],
    comments: [],
  },
  {
    id: '5',
    userId: '6',
    userName: 'Riley',
    userAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop',
    type: 'workout_completed',
    timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), // 8 hours ago
    workoutType: 'Cycling',
    workoutDuration: 45,
    workoutCalories: 450,
    workoutDistance: 15000,
    reactions: [
      { type: 'fire', userId: '4', userName: 'Casey' },
    ],
    comments: [],
  },
  {
    id: '6',
    userId: '2',
    userName: 'Jordan',
    userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
    type: 'competition_won',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    competitionName: 'Weekend Warriors',
    reactions: [
      { type: 'clap', userId: '3', userName: 'Taylor' },
      { type: 'clap', userId: '4', userName: 'Casey' },
      { type: 'heart', userId: '5', userName: 'Morgan' },
      { type: 'fire', userId: '6', userName: 'Riley' },
      { type: 'muscle', userId: '7', userName: 'Sam' },
    ],
    comments: [
      {
        id: 'c4',
        userId: '3',
        userName: 'Taylor',
        userAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
        text: 'Congrats champion! 🏆',
        timestamp: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
  {
    id: '7',
    userId: '7',
    userName: 'Sam',
    userAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop',
    type: 'workout_completed',
    timestamp: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(), // 1 day ago
    workoutType: 'Swimming',
    workoutDuration: 60,
    workoutCalories: 500,
    workoutDistance: 2000,
    reactions: [
      { type: 'muscle', userId: '2', userName: 'Jordan' },
    ],
    comments: [],
  },
];

// Mock friend profiles
export const MOCK_FRIEND_PROFILES: Record<string, FriendProfile> = {
  '2': {
    id: '2',
    name: 'Jordan',
    username: '@jordan_fit',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
    bio: 'Running enthusiast | Early morning workout crew | Chasing goals',
    memberSince: '2024-06-15',
    stats: {
      totalPoints: 12450,
      currentStreak: 14,
      longestStreak: 45,
      competitionsWon: 8,
      competitionsJoined: 15,
      workoutsThisMonth: 22,
    },
    medals: { gold: 5, silver: 8, bronze: 12 },
    recentAchievements: [
      { id: '1', name: 'Competition Victor', type: 'gold', earnedDate: '2025-01-05' },
      { id: '2', name: '14-Day Streak', type: 'silver', earnedDate: '2025-01-04' },
      { id: '3', name: 'Early Bird', type: 'bronze', earnedDate: '2025-01-02' },
    ],
    currentRings: {
      move: 520, moveGoal: 500,
      exercise: 35, exerciseGoal: 30,
      stand: 10, standGoal: 12,
    },
  },
  '3': {
    id: '3',
    name: 'Taylor',
    username: '@taylor_runs',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
    bio: 'Trail runner | Outdoor adventurer | Coffee lover',
    memberSince: '2024-08-01',
    stats: {
      totalPoints: 9800,
      currentStreak: 21,
      longestStreak: 30,
      competitionsWon: 4,
      competitionsJoined: 12,
      workoutsThisMonth: 18,
    },
    medals: { gold: 3, silver: 6, bronze: 9 },
    recentAchievements: [
      { id: '1', name: '21-Day Streak', type: 'gold', earnedDate: '2025-01-06' },
      { id: '2', name: 'Move Champion', type: 'silver', earnedDate: '2025-01-01' },
    ],
    currentRings: {
      move: 480, moveGoal: 450,
      exercise: 28, exerciseGoal: 30,
      stand: 11, standGoal: 12,
    },
  },
  '4': {
    id: '4',
    name: 'Casey',
    username: '@casey_active',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop',
    bio: '30 day streak and counting! | Yoga & HIIT | Plant-based athlete',
    memberSince: '2024-05-20',
    stats: {
      totalPoints: 15200,
      currentStreak: 30,
      longestStreak: 30,
      competitionsWon: 6,
      competitionsJoined: 20,
      workoutsThisMonth: 25,
    },
    medals: { gold: 7, silver: 10, bronze: 15 },
    recentAchievements: [
      { id: '1', name: '30-Day Streak', type: 'gold', earnedDate: '2025-01-06' },
      { id: '2', name: 'Perfect Week', type: 'gold', earnedDate: '2025-01-05' },
      { id: '3', name: 'Century Club', type: 'gold', earnedDate: '2024-12-28' },
    ],
    currentRings: {
      move: 600, moveGoal: 550,
      exercise: 45, exerciseGoal: 30,
      stand: 12, standGoal: 12,
    },
  },
  '5': {
    id: '5',
    name: 'Morgan',
    username: '@morgan_moves',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop',
    bio: 'Fitness is a journey | Strength training | Mindful movement',
    memberSince: '2024-09-10',
    stats: {
      totalPoints: 7500,
      currentStreak: 7,
      longestStreak: 21,
      competitionsWon: 2,
      competitionsJoined: 8,
      workoutsThisMonth: 15,
    },
    medals: { gold: 2, silver: 4, bronze: 7 },
    recentAchievements: [
      { id: '1', name: 'Century Club', type: 'gold', earnedDate: '2025-01-06' },
      { id: '2', name: '7-Day Streak', type: 'bronze', earnedDate: '2025-01-05' },
    ],
    currentRings: {
      move: 380, moveGoal: 400,
      exercise: 20, exerciseGoal: 30,
      stand: 8, standGoal: 12,
    },
  },
  '6': {
    id: '6',
    name: 'Riley',
    username: '@riley_strong',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop',
    bio: 'Cyclist | Weekend warrior | Love a good challenge',
    memberSince: '2024-07-25',
    stats: {
      totalPoints: 8900,
      currentStreak: 12,
      longestStreak: 28,
      competitionsWon: 3,
      competitionsJoined: 10,
      workoutsThisMonth: 16,
    },
    medals: { gold: 3, silver: 5, bronze: 8 },
    recentAchievements: [
      { id: '1', name: 'Distance Champion', type: 'gold', earnedDate: '2025-01-04' },
      { id: '2', name: '12-Day Streak', type: 'silver', earnedDate: '2025-01-06' },
    ],
    currentRings: {
      move: 450, moveGoal: 450,
      exercise: 32, exerciseGoal: 30,
      stand: 9, standGoal: 12,
    },
  },
  '7': {
    id: '7',
    name: 'Sam',
    username: '@sam_wellness',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop',
    bio: 'Swimmer | Mind & body balance | Early riser',
    memberSince: '2024-10-01',
    stats: {
      totalPoints: 6200,
      currentStreak: 5,
      longestStreak: 14,
      competitionsWon: 1,
      competitionsJoined: 6,
      workoutsThisMonth: 12,
    },
    medals: { gold: 1, silver: 3, bronze: 5 },
    recentAchievements: [
      { id: '1', name: 'Swimmer Pro', type: 'silver', earnedDate: '2025-01-05' },
    ],
    currentRings: {
      move: 320, moveGoal: 400,
      exercise: 25, exerciseGoal: 30,
      stand: 7, standGoal: 12,
    },
  },
};
