import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAvatarUrl } from './avatar-utils';

export interface UserProfile {
  height: number; // in cm
  weight: number; // in kg
  targetWeight: number; // in kg
  age: number;
  gender: 'male' | 'female' | 'other';
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  moveCalories: number;
  exerciseMinutes: number;
  standHours: number;
  moveGoal: number;
  exerciseGoal: number;
  standGoal: number;
  totalPoints: number;
  streak: number;
  profile: UserProfile;
}

export interface PendingInvitation {
  id: string;
  inviteeId: string;
  inviteeName: string;
  inviteeAvatar: string;
  invitedAt: string;
}

export interface Competition {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  participants: Participant[];
  type: 'weekly' | 'weekend' | 'monthly' | 'custom';
  status: 'active' | 'upcoming' | 'completed';
  scoringType?: string; // Scoring method: 'ring_close', 'percentage', 'raw_numbers', 'step_count', 'workout'
  creatorId?: string; // Optional creator ID for checking if user is creator
  pendingInvitations?: PendingInvitation[]; // Pending invitations (only visible to creator)
  isPublic?: boolean; // Whether the competition is publicly discoverable
}

export interface Participant {
  id: string;
  name: string;
  avatar: string;
  points: number;
  moveProgress: number;
  exerciseProgress: number;
  standProgress: number;
  moveCalories?: number; // Raw calories for raw_numbers scoring
  exerciseMinutes?: number; // Raw minutes for raw_numbers scoring
  standHours?: number; // Raw hours for raw_numbers scoring
  stepCount?: number; // Raw step count for step_count scoring
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: 'gold' | 'silver' | 'bronze';
  earned: boolean;
  earnedDate?: string;
  category: 'move' | 'exercise' | 'stand' | 'competition' | 'streak';
}

interface FitnessStore {
  currentUser: User;
  competitions: Competition[];
  achievements: Achievement[];
  isFetchingCompetitions: boolean;
  setCurrentUser: (user: User) => void;
  updateActivity: (move: number, exercise: number, stand: number) => void;
  updateUserName: (name: string) => void;
  updateUserProfile: (profile: Partial<UserProfile>) => void;
  updateActivityGoals: (goals: { moveGoal?: number; exerciseGoal?: number; standGoal?: number }) => void;
  leaveCompetition: (competitionId: string) => void;
  deleteCompetition: (competitionId: string) => void;
  createCompetition: (settings: {
    name: string;
    startDate: Date;
    endDate: Date;
    invitedFriends: string[];
    invitedFriendDetails?: Array<{ id: string; name: string; avatar: string }>; // Optional friend details
    creatorData?: { id: string; name: string; avatar: string }; // Optional creator user data
  }) => string;
  loadCompetitions: (competitions: Competition[]) => void;
  fetchUserCompetitions: (userId: string) => Promise<void>;
}

const mockUser: User = {
  id: '1',
  name: 'Alex',
  avatar: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=200&h=200&fit=crop',
  moveCalories: 420,
  exerciseMinutes: 25,
  standHours: 8,
  moveGoal: 500,
  exerciseGoal: 30,
  standGoal: 12,
  totalPoints: 2450,
  streak: 7,
  profile: {
    height: 178,
    weight: 75,
    targetWeight: 72,
    age: 28,
    gender: 'male',
  },
};

const mockCompetitions: Competition[] = [
  {
    id: '1',
    name: 'Weekend Warriors',
    description: 'Close your rings all weekend!',
    startDate: '2025-01-04',
    endDate: '2025-01-05',
    type: 'weekend',
    status: 'active',
    participants: [
      { id: '1', name: 'Alex', avatar: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=200&h=200&fit=crop', points: 850, moveProgress: 0.84, exerciseProgress: 0.83, standProgress: 0.67 },
      { id: '2', name: 'Jordan', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop', points: 920, moveProgress: 0.92, exerciseProgress: 0.88, standProgress: 0.75 },
      { id: '3', name: 'Taylor', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop', points: 780, moveProgress: 0.78, exerciseProgress: 0.72, standProgress: 0.83 },
      { id: '4', name: 'Casey', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop', points: 650, moveProgress: 0.65, exerciseProgress: 0.58, standProgress: 0.58 },
      { id: '5', name: 'Morgan', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop', points: 540, moveProgress: 0.54, exerciseProgress: 0.45, standProgress: 0.5 },
    ],
  },
  {
    id: '2',
    name: 'January Jumpstart',
    description: 'Start the year strong with your crew!',
    startDate: '2025-01-01',
    endDate: '2025-01-31',
    type: 'monthly',
    status: 'active',
    participants: [
      { id: '2', name: 'Jordan', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop', points: 4200, moveProgress: 0.95, exerciseProgress: 0.92, standProgress: 0.88 },
      { id: '1', name: 'Alex', avatar: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=200&h=200&fit=crop', points: 3850, moveProgress: 0.84, exerciseProgress: 0.83, standProgress: 0.67 },
      { id: '6', name: 'Riley', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop', points: 3600, moveProgress: 0.82, exerciseProgress: 0.78, standProgress: 0.72 },
      { id: '7', name: 'Sam', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop', points: 3200, moveProgress: 0.75, exerciseProgress: 0.68, standProgress: 0.7 },
    ],
  },
  {
    id: '3',
    name: 'Work Buddies',
    description: 'Compete with your coworkers',
    startDate: '2025-01-06',
    endDate: '2025-01-12',
    type: 'weekly',
    status: 'upcoming',
    participants: [
      { id: '1', name: 'Alex', avatar: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=200&h=200&fit=crop', points: 0, moveProgress: 0, exerciseProgress: 0, standProgress: 0 },
      { id: '8', name: 'Drew', avatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=200&h=200&fit=crop', points: 0, moveProgress: 0, exerciseProgress: 0, standProgress: 0 },
      { id: '9', name: 'Jamie', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop', points: 0, moveProgress: 0, exerciseProgress: 0, standProgress: 0 },
    ],
  },
];

const mockAchievements: Achievement[] = [
  { id: '1', name: '7-Day Streak', description: 'Close all rings for 7 days straight', icon: 'flame', type: 'gold', earned: true, earnedDate: '2025-01-05', category: 'streak' },
  { id: '2', name: 'Move Champion', description: 'Double your Move goal', icon: 'zap', type: 'gold', earned: true, earnedDate: '2025-01-03', category: 'move' },
  { id: '3', name: 'Competition Victor', description: 'Win a group competition', icon: 'trophy', type: 'gold', earned: false, category: 'competition' },
  { id: '4', name: 'Early Bird', description: 'Complete Exercise goal before 9 AM', icon: 'sunrise', type: 'silver', earned: true, earnedDate: '2025-01-02', category: 'exercise' },
  { id: '5', name: 'Stand Master', description: 'Hit Stand goal for 5 days', icon: 'activity', type: 'silver', earned: true, earnedDate: '2024-12-28', category: 'stand' },
  { id: '6', name: 'First Steps', description: 'Join your first competition', icon: 'users', type: 'bronze', earned: true, earnedDate: '2024-12-20', category: 'competition' },
  { id: '7', name: 'Century Club', description: 'Burn 1000 calories in one day', icon: 'flame', type: 'gold', earned: false, category: 'move' },
  { id: '8', name: 'Marathon Mind', description: 'Exercise for 60 minutes straight', icon: 'timer', type: 'silver', earned: false, category: 'exercise' },
  { id: '9', name: 'Perfect Week', description: 'Close all rings every day for a week', icon: 'award', type: 'gold', earned: false, category: 'streak' },
  { id: '10', name: 'Social Butterfly', description: 'Compete in 5 different competitions', icon: 'users', type: 'bronze', earned: true, earnedDate: '2025-01-01', category: 'competition' },
];

export const useFitnessStore = create<FitnessStore>()(
  persist(
    (set, get) => ({
      currentUser: mockUser,
      competitions: mockCompetitions,
      achievements: mockAchievements,
      isFetchingCompetitions: false,
      setCurrentUser: (user) => set({ currentUser: user }),
      updateActivity: (move, exercise, stand) =>
        set((state) => ({
          currentUser: {
            ...state.currentUser,
            moveCalories: move,
            exerciseMinutes: exercise,
            standHours: stand,
          },
        })),
      updateUserName: (name) =>
        set((state) => ({
          currentUser: {
            ...state.currentUser,
            name,
          },
        })),
      updateUserProfile: (profile) =>
        set((state) => ({
          currentUser: {
            ...state.currentUser,
            profile: {
              ...state.currentUser.profile,
              ...profile,
            },
          },
        })),
      updateActivityGoals: (goals) =>
        set((state) => ({
          currentUser: {
            ...state.currentUser,
            ...goals,
          },
        })),
      leaveCompetition: (competitionId) =>
        set((state) => ({
          competitions: state.competitions.map((competition) =>
            competition.id === competitionId
              ? {
                  ...competition,
                  participants: competition.participants.filter(
                    (p) => p.id !== state.currentUser.id
                  ),
                }
              : competition
          ),
        })),
      deleteCompetition: (competitionId) =>
        set((state) => ({
          competitions: state.competitions.filter((c) => c.id !== competitionId),
        })),
      createCompetition: (settings) => {
        const { currentUser } = get();
        
        const newId = `competition-${Date.now()}`;
        
        // Calculate duration to determine type
        const start = new Date(settings.startDate);
        const end = new Date(settings.endDate);
        const durationDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end day
        
        // Determine competition type with specific constraints
        let type: 'weekend' | 'weekly' | 'monthly' | 'custom' = 'custom';
        
        // Weekend: Must be exactly Sat-Sun (2 days, starting on Saturday)
        const startDay = start.getDay(); // 0 = Sunday, 6 = Saturday
        if (durationDays === 2 && startDay === 6) {
          type = 'weekend';
        }
        // Weekly: Exactly 7 days
        else if (durationDays === 7) {
          type = 'weekly';
        }
        // Monthly: 28-31 days
        else if (durationDays >= 28 && durationDays <= 31) {
          type = 'monthly';
        }
        // Everything else is custom

        // Determine status
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startDateNormalized = new Date(start);
        startDateNormalized.setHours(0, 0, 0, 0);
        
        const status: 'active' | 'upcoming' = startDateNormalized <= today ? 'active' : 'upcoming';

        // Build participants list - start with current user using REAL auth data
        // Use provided creator data if available, otherwise fall back to fitness store currentUser
        const userId = settings.creatorData?.id || currentUser.id;
        const userDisplayName = settings.creatorData?.name || currentUser.name;
        const userAvatar = settings.creatorData?.avatar || currentUser.avatar;
        
        // Log for debugging - remove later if needed
        if (settings.creatorData) {
          console.log('Creating competition with creator data:', {
            id: settings.creatorData.id,
            name: settings.creatorData.name,
            avatar: settings.creatorData.avatar,
          });
        } else {
          console.log('Creating competition with fallback currentUser:', {
            id: currentUser.id,
            name: currentUser.name,
            avatar: currentUser.avatar,
          });
        }
        
        // Use avatar from creatorData if provided, otherwise generate from name
        const finalAvatar = userAvatar || getAvatarUrl(null, userDisplayName);
        
        const participants: Participant[] = [
          {
            id: userId,
            name: userDisplayName,
            avatar: finalAvatar,
            points: 0,
            moveProgress: 0,
            exerciseProgress: 0,
            standProgress: 0,
          },
        ];

        // Add invited friends - use provided friend details if available, otherwise fall back to mock data
        if (settings.invitedFriendDetails && settings.invitedFriendDetails.length > 0) {
          // Use real friend details from search results
          settings.invitedFriendDetails.forEach((friend) => {
            if (friend.id !== userId) { // Don't add creator again
              participants.push({
                id: friend.id,
                name: friend.name,
                avatar: friend.avatar,
                points: 0,
                moveProgress: 0,
                exerciseProgress: 0,
                standProgress: 0,
              });
            }
          });
        } else {
          // Fallback to mock friends for backward compatibility
          const mockFriends = [
            { id: '2', name: 'Jordan', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop' },
            { id: '3', name: 'Taylor', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop' },
            { id: '4', name: 'Casey', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop' },
            { id: '5', name: 'Morgan', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop' },
            { id: '6', name: 'Riley', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop' },
            { id: '7', name: 'Sam', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop' },
            { id: '8', name: 'Drew', avatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=200&h=200&fit=crop' },
            { id: '9', name: 'Jamie', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop' },
          ];

          settings.invitedFriends.forEach((friendId) => {
            const friend = mockFriends.find((f) => f.id === friendId);
            if (friend && friend.id !== userId) { // Don't add creator again
              participants.push({
                id: friend.id,
                name: friend.name,
                avatar: friend.avatar,
                points: 0,
                moveProgress: 0,
                exerciseProgress: 0,
                standProgress: 0,
              });
            }
          });
        }

        // Generate description based on type
        let description: string;
        if (type === 'weekend') {
          description = 'Close your rings all weekend!';
        } else if (type === 'weekly') {
          description = 'A full week of competition!';
        } else if (type === 'monthly') {
          description = 'A month-long challenge!';
        } else {
          description = `${durationDays}-day challenge`;
        }

        const newCompetition: Competition = {
          id: newId,
          name: settings.name,
          description,
          startDate: start.toISOString().split('T')[0],
          endDate: end.toISOString().split('T')[0],
          type,
          status,
          participants,
        };

        set((state) => ({
          competitions: [newCompetition, ...state.competitions],
        }));

        return newId;
      },
      loadCompetitions: (competitions) => {
        const currentCompetitions = get().competitions;
        // Only update if we're setting competitions (not clearing), or if current is already empty
        if (competitions.length > 0 || currentCompetitions.length === 0) {
          set({ competitions });
        }
      },
      fetchUserCompetitions: async (userId) => {
        // Set fetching flag immediately to prevent concurrent fetches
        if (get().isFetchingCompetitions) {
          console.log('fetchUserCompetitions: Already fetching, skipping');
          return;
        }
        // Preserve existing competitions while fetching (don't clear them)
        const existingCompetitions = get().competitions;
        console.log('fetchUserCompetitions: Starting fetch for user', userId, 'existing competitions:', existingCompetitions.length);
        set({ isFetchingCompetitions: true });
        try {
          const { fetchUserCompetitions: fetchFromSupabase } = await import('./competition-service');
          const competitions = await fetchFromSupabase(userId);
          console.log('fetchUserCompetitions: Fetch completed, updating competitions', { fetchedCount: competitions.length, existingCount: existingCompetitions.length });
          // Update with fresh data from server - this is the source of truth
          set({ competitions, isFetchingCompetitions: false });
        } catch (error) {
          console.error('Error fetching user competitions:', error);
          // Keep existing competitions on error
          set({ isFetchingCompetitions: false });
        }
      },
    }),
    {
      name: 'fitness-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        currentUser: state.currentUser,
        competitions: state.competitions,
        achievements: state.achievements,
      }),
      onRehydrateStorage: () => (state) => {
        // When store rehydrates, preserve competitions if they exist
        if (state?.competitions && state.competitions.length > 0) {
          console.log('Store rehydrated with', state.competitions.length, 'competitions from persistence');
        }
      },
    }
  )
);
