import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';
// Lazy load to avoid native module initialization at startup
// import AppleHealthKit, {
//   HealthKitPermissions,
//   HealthValue,
//   HealthActivitySummary,
// } from 'react-native-health';
import {
  HealthProviderType,
  HealthProvider,
  HealthMetrics,
  HealthGoals,
  WorkoutSession,
  HEALTH_PROVIDERS,
  WorkoutType,
} from './health-types';

// ============================================
// Provider Adapter Interface
// ============================================

interface HealthProviderAdapter {
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  requestPermissions(): Promise<boolean>;
  fetchMetrics(): Promise<HealthMetrics | null>;
  fetchWorkouts(startDate: Date, endDate: Date): Promise<WorkoutSession[]>;
  fetchWeight(): Promise<{ value: number; date: string } | null>;
  fetchWeightHistory(days?: number): Promise<{ date: string; weight: number }[]>;
  fetchBMI(): Promise<{ value: number; date: string } | null>;
  isAvailable(): boolean;
}

// ============================================
// Apple Health Adapter
// ============================================

// Singleton instance
let appleHealthAdapterInstance: AppleHealthAdapter | null = null;

// Lazy load AppleHealthKit module
let AppleHealthKitModule: any = null;
const loadHealthKitModule = async () => {
  if (!AppleHealthKitModule && Platform.OS === 'ios') {
    try {
      AppleHealthKitModule = await import('react-native-health');
      return AppleHealthKitModule.default || AppleHealthKitModule;
    } catch (error) {
      console.error('[AppleHealth] Failed to load react-native-health:', error);
      return null;
    }
  }
  return AppleHealthKitModule?.default || AppleHealthKitModule;
};

class AppleHealthAdapter implements HealthProviderAdapter {
  private isInitialized: boolean = false;

  static getInstance(): AppleHealthAdapter {
    if (!appleHealthAdapterInstance) {
      appleHealthAdapterInstance = new AppleHealthAdapter();
    }
    return appleHealthAdapterInstance;
  }

  isAvailable(): boolean {
    return Platform.OS === 'ios';
  }

  async requestPermissions(): Promise<boolean> {
    if (!this.isAvailable()) {
      console.log('[AppleHealth] Not available on this platform');
      return false;
    }

    try {
      console.log('[AppleHealth] Loading HealthKit module...');
      const AppleHealthKit = await loadHealthKitModule();
      if (!AppleHealthKit) {
        console.error('[AppleHealth] Failed to load HealthKit module');
        return false;
      }

      console.log('[AppleHealth] HealthKit module loaded, requesting permissions...');

      return new Promise((resolve) => {
        const permissions = {
          permissions: {
            read: [
              'ActiveEnergyBurned',
              'AppleExerciseTime',
              'AppleStandTime',
              'StepCount',
              'DistanceWalkingRunning',
              'FlightsClimbed',
              'HeartRate',
              'RestingHeartRate',
              'Workout',
              'Weight',
              'Height',
              'BodyMassIndex',
              'ActivitySummary',
            ],
          },
        };

        AppleHealthKit.initHealthKit(permissions, (error: any) => {
          if (error) {
            console.error('[AppleHealth] Permission error:', error);
            resolve(false);
            return;
          }
          console.log('[AppleHealth] Permissions granted successfully');
          this.isInitialized = true;
          resolve(true);
        });
      });
    } catch (error) {
      console.error('[AppleHealth] Error requesting permissions:', error);
      return false;
    }
  }

  async connect(): Promise<boolean> {
    console.log('[AppleHealth] connect() called');
    if (!this.isAvailable()) {
      console.log('[AppleHealth] Not available on this platform');
      return false;
    }

    // Request permissions if not already initialized
    if (!this.isInitialized) {
      console.log('[AppleHealth] Not initialized, requesting permissions...');
      const hasPermissions = await this.requestPermissions();
      console.log('[AppleHealth] Permission request result:', hasPermissions);
      return hasPermissions;
    }

    console.log('[AppleHealth] Already initialized');
    return true;
  }

  async disconnect(): Promise<void> {
    this.isInitialized = false;
  }

  async fetchMetrics(): Promise<HealthMetrics | null> {
    if (!this.isAvailable() || !this.isInitialized) {
      return null;
    }

    try {
      const AppleHealthKit = await loadHealthKitModule();
      if (!AppleHealthKit) {
        return null;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const now = new Date();

      // Fetch Activity Summary FIRST - this is the official Apple data that matches the Watch
      const activitySummary = await this.getActivitySummary(today);

      // Fetch additional metrics in parallel (only what's not in Activity Summary)
      const [
        steps,
        distance,
        floorsClimbed,
        heartRate,
        workouts,
      ] = await Promise.all([
        this.getStepCount(today, now),
        this.getDistance(today, now),
        this.getFloorsClimbed(today, now),
        this.getHeartRate(today, now),
        this.getWorkouts(today, now),
      ]);

      // Use Activity Summary values when available - these match Apple Watch exactly
      // Fall back to individual queries only if Activity Summary is not available
      let activeCalories = 0;
      let exerciseMinutes = 0;
      let standHours = 0;

      if (activitySummary) {
        // Use official Apple Activity Summary data - matches Watch/Fitness app exactly
        activeCalories = activitySummary.activeEnergyBurned || 0;
        exerciseMinutes = activitySummary.appleExerciseTime || 0;
        standHours = activitySummary.appleStandHours || 0;
      } else {
        // Fallback to individual queries if no Activity Summary
        const [fallbackCalories, fallbackExercise, fallbackStand] = await Promise.all([
          this.getActiveEnergyBurned(today, now),
          this.getExerciseTime(today, now),
          this.getStandTime(today, now),
        ]);
        activeCalories = fallbackCalories;
        exerciseMinutes = fallbackExercise;
        standHours = fallbackStand;
      }

      // Extract goals from Activity Summary if available
      const goals = activitySummary ? {
        moveCalories: activitySummary.activeEnergyBurnedGoal || 0,
        exerciseMinutes: activitySummary.appleExerciseTimeGoal || 0,
        standHours: activitySummary.appleStandHoursGoal || 0,
      } : undefined;

      return {
        activeCalories,
        exerciseMinutes,
        standHours,
        steps: steps || 0,
        distanceMeters: distance || 0,
        floorsClimbed: floorsClimbed || 0,
        heartRateAvg: heartRate || 0,
        heartRateResting: 0, // Would need separate query
        heartRateMax: 0, // Would need separate query
        workoutsCompleted: workouts?.length || 0,
        lastUpdated: new Date().toISOString(),
        provider: 'apple_health',
        goals,
      };
    } catch (error) {
      console.error('[AppleHealth] Error fetching metrics:', error);
      return null;
    }
  }

  private async getActivitySummary(date: Date): Promise<any | null> {
    const AppleHealthKit = await loadHealthKitModule();
    if (!AppleHealthKit) return null;

    return new Promise((resolve) => {
      try {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        AppleHealthKit.getActivitySummary(
          {
            startDate: startOfDay.toISOString(),
            endDate: endOfDay.toISOString(),
          },
          (err: any, results: any) => {
            if (err || !results || results.length === 0) {
              resolve(null);
              return;
            }

            // Find the summary for the specific date by matching dateComponents
            const targetYear = date.getFullYear();
            const targetMonth = date.getMonth() + 1;
            const targetDay = date.getDate();

            let matchingSummary = null;
            for (const summary of results) {
              if (summary.dateComponents) {
                const summaryYear = summary.dateComponents.year || summary.dateComponents.era;
                const summaryMonth = summary.dateComponents.month;
                const summaryDay = summary.dateComponents.day;

                if (summaryYear === targetYear && summaryMonth === targetMonth && summaryDay === targetDay) {
                  matchingSummary = summary;
                  break;
                }
              }
            }

            // If no matching summary found, use the last result (for today)
            if (!matchingSummary && results.length > 0) {
              matchingSummary = results[results.length - 1];
            }

            resolve(matchingSummary);
          }
        );
      } catch (e) {
        resolve(null);
      }
    });
  }

  async fetchWorkouts(startDate: Date, endDate: Date): Promise<WorkoutSession[]> {
    return this.getWorkouts(startDate, endDate);
  }

  async fetchWeight(): Promise<{ value: number; date: string } | null> {
    if (!this.isAvailable() || !this.isInitialized) {
      return null;
    }

    try {
      const AppleHealthKit = await loadHealthKitModule();
      if (!AppleHealthKit) {
        return null;
      }

      return new Promise((resolve) => {
        const options = {
          unit: 'pound', // or 'gram'
          startDate: new Date(0).toISOString(),
        };

        AppleHealthKit.getWeightSamples(options, (error: any, results: any[]) => {
          if (error) {
            console.error('[AppleHealth] Error fetching weight:', error);
            resolve(null);
            return;
          }

          if (results && results.length > 0) {
            const latest = results[results.length - 1];
            resolve({
              value: latest.value,
              date: latest.startDate,
            });
          } else {
            resolve(null);
          }
        });
      });
    } catch (error) {
      console.error('[AppleHealth] Error fetching weight:', error);
      return null;
    }
  }

  async fetchWeightHistory(days: number = 30): Promise<{ date: string; weight: number }[]> {
    if (!this.isAvailable() || !this.isInitialized) {
      return [];
    }

    try {
      const AppleHealthKit = await loadHealthKitModule();
      if (!AppleHealthKit) {
        return [];
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      return new Promise((resolve) => {
        const options = {
          unit: 'pound',
          startDate: startDate.toISOString(),
          endDate: new Date().toISOString(),
        };

        AppleHealthKit.getWeightSamples(options, (error: any, results: any[]) => {
          if (error) {
            console.error('[AppleHealth] Error fetching weight history:', error);
            resolve([]);
            return;
          }

          const weights = (results || []).map((sample) => ({
            date: sample.startDate,
            weight: sample.value,
          }));

          resolve(weights);
        });
      });
    } catch (error) {
      console.error('[AppleHealth] Error fetching weight history:', error);
      return [];
    }
  }

  async fetchBMI(): Promise<{ value: number; date: string } | null> {
    if (!this.isAvailable() || !this.isInitialized) {
      return null;
    }

    try {
      const AppleHealthKit = await loadHealthKitModule();
      if (!AppleHealthKit) {
        return null;
      }

      return new Promise((resolve) => {
        const options = {
          unit: 'bmi',
          startDate: new Date(0).toISOString(),
        };

        AppleHealthKit.getBmiSamples(options, (error: any, results: any[]) => {
          if (error) {
            console.error('[AppleHealth] Error fetching BMI:', error);
            resolve(null);
            return;
          }

          if (results && results.length > 0) {
            const latest = results[results.length - 1];
            resolve({
              value: latest.value,
              date: latest.startDate,
            });
          } else {
            resolve(null);
          }
        });
      });
    } catch (error) {
      console.error('[AppleHealth] Error fetching BMI:', error);
      return null;
    }
  }

  // Helper methods for fetching specific metrics
  private async getActiveEnergyBurned(startDate: Date, endDate: Date): Promise<number> {
    const AppleHealthKit = await loadHealthKitModule();
    if (!AppleHealthKit) return 0;

    return new Promise((resolve) => {
      AppleHealthKit.getActiveEnergyBurned(
        {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        (error: any, results: any[]) => {
          if (error || !results || !Array.isArray(results) || results.length === 0) {
            resolve(0);
            return;
          }
          const total = results.reduce((sum, sample) => sum + (sample.value || 0), 0);
          resolve(total);
        }
      );
    });
  }

  private async getExerciseTime(startDate: Date, endDate: Date): Promise<number> {
    const AppleHealthKit = await loadHealthKitModule();
    if (!AppleHealthKit) return 0;

    return new Promise((resolve) => {
      AppleHealthKit.getAppleExerciseTime(
        {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        (error: any, results: any[]) => {
          if (error || !results || !Array.isArray(results) || results.length === 0) {
            resolve(0);
            return;
          }
          const total = results.reduce((sum, sample) => sum + (sample.value || 0), 0);
          resolve(Math.round(total / 60)); // Convert seconds to minutes
        }
      );
    });
  }

  private async getStandTime(startDate: Date, endDate: Date): Promise<number> {
    const AppleHealthKit = await loadHealthKitModule();
    if (!AppleHealthKit) return 0;

    return new Promise((resolve) => {
      AppleHealthKit.getAppleStandTime(
        {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        (error: any, results: any[]) => {
          if (error || !results || !Array.isArray(results) || results.length === 0) {
            resolve(0);
            return;
          }
          // Count unique hours with stand data
          const standHours = new Set(
            results.map((sample) => new Date(sample.startDate).getHours())
          ).size;
          resolve(standHours);
        }
      );
    });
  }

  private async getStepCount(startDate: Date, endDate: Date): Promise<number> {
    const AppleHealthKit = await loadHealthKitModule();
    if (!AppleHealthKit) return 0;

    return new Promise((resolve) => {
      AppleHealthKit.getStepCount(
        {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        (error: any, results: any[]) => {
          if (error || !results || !Array.isArray(results) || results.length === 0) {
            resolve(0);
            return;
          }
          const total = results.reduce((sum, sample) => sum + (sample.value || 0), 0);
          resolve(Math.round(total));
        }
      );
    });
  }

  private async getDistance(startDate: Date, endDate: Date): Promise<number> {
    const AppleHealthKit = await loadHealthKitModule();
    if (!AppleHealthKit) return 0;

    return new Promise((resolve) => {
      AppleHealthKit.getDistanceWalkingRunning(
        {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        (error: any, results: any[]) => {
          if (error || !results || !Array.isArray(results) || results.length === 0) {
            resolve(0);
            return;
          }
          const total = results.reduce((sum, sample) => sum + (sample.value || 0), 0);
          resolve(Math.round(total)); // meters
        }
      );
    });
  }

  private async getFloorsClimbed(startDate: Date, endDate: Date): Promise<number> {
    const AppleHealthKit = await loadHealthKitModule();
    if (!AppleHealthKit) return 0;

    return new Promise((resolve) => {
      AppleHealthKit.getFlightsClimbed(
        {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        (error: any, results: any[]) => {
          if (error || !results || !Array.isArray(results) || results.length === 0) {
            resolve(0);
            return;
          }
          const total = results.reduce((sum, sample) => sum + (sample.value || 0), 0);
          resolve(Math.round(total));
        }
      );
    });
  }

  private async getHeartRate(startDate: Date, endDate: Date): Promise<number> {
    const AppleHealthKit = await loadHealthKitModule();
    if (!AppleHealthKit) return 0;

    return new Promise((resolve) => {
      AppleHealthKit.getHeartRateSamples(
        {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        (error: any, results: any[]) => {
          if (error || !results || !Array.isArray(results) || results.length === 0) {
            resolve(0);
            return;
          }
          const avg = results.reduce((sum, sample) => sum + (sample.value || 0), 0) / results.length;
          resolve(Math.round(avg));
        }
      );
    });
  }

  private async getWorkouts(startDate: Date, endDate: Date): Promise<WorkoutSession[]> {
    const AppleHealthKit = await loadHealthKitModule();
    if (!AppleHealthKit) return [];

    return new Promise((resolve) => {
      AppleHealthKit.getSamples(
        {
          type: 'Workout',
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        (error: any, results: any[]) => {
          if (error || !results || !Array.isArray(results) || results.length === 0) {
            resolve([]);
            return;
          }

          const workouts: WorkoutSession[] = results.map((workout) => {
            const workoutTypeMap: Record<string, WorkoutType> = {
              Running: 'running',
              Walking: 'walking',
              Cycling: 'cycling',
              Swimming: 'swimming',
              TraditionalStrengthTraining: 'strength',
              HIIT: 'hiit',
              Yoga: 'yoga',
            };

            const duration = workout.duration
              ? Math.round(workout.duration / 60) // Convert seconds to minutes
              : 0;

            // Try multiple possible date field names from Apple Health
            const workoutStartDate = workout.startDate || workout.start || workout.startTime;
            const workoutEndDate = workout.endDate || workout.end || workout.endTime;

            return {
              id: workout.id || `${workoutStartDate}-${workoutEndDate}`,
              type: workoutTypeMap[workout.activityType] || 'other',
              startTime: workoutStartDate,
              endTime: workoutEndDate,
              duration,
              calories: workout.totalEnergyBurned || 0,
              distance: workout.totalDistance ? Math.round(workout.totalDistance) : undefined,
              provider: 'apple_health',
              sourceName: workout.sourceName,
              sourceId: workout.sourceId,
            };
          });

          resolve(workouts);
        }
      );
    });
  }
}

// ============================================
// Mock Adapter (for development/testing)
// ============================================

class MockHealthAdapter implements HealthProviderAdapter {
  private providerId: HealthProviderType;

  constructor(providerId: HealthProviderType) {
    this.providerId = providerId;
  }

  isAvailable(): boolean {
    return true;
  }

  async connect(): Promise<boolean> {
    console.log(`[MockHealth] Connected to ${this.providerId}`);
    return true;
  }

  async disconnect(): Promise<void> {
    console.log(`[MockHealth] Disconnected from ${this.providerId}`);
  }

  async requestPermissions(): Promise<boolean> {
    return true;
  }

  async fetchMetrics(): Promise<HealthMetrics> {
    // Generate realistic mock data
    return {
      activeCalories: Math.floor(Math.random() * 400) + 100,
      exerciseMinutes: Math.floor(Math.random() * 45) + 5,
      standHours: Math.floor(Math.random() * 8) + 4,
      steps: Math.floor(Math.random() * 8000) + 2000,
      distanceMeters: Math.floor(Math.random() * 5000) + 1000,
      floorsClimbed: Math.floor(Math.random() * 15) + 1,
      heartRateAvg: Math.floor(Math.random() * 30) + 60,
      heartRateResting: Math.floor(Math.random() * 15) + 55,
      heartRateMax: Math.floor(Math.random() * 40) + 140,
      workoutsCompleted: Math.floor(Math.random() * 2),
      lastUpdated: new Date().toISOString(),
      provider: this.providerId,
    };
  }

  async fetchWorkouts(): Promise<WorkoutSession[]> {
    return [];
  }

  async fetchWeight(): Promise<{ value: number; date: string } | null> {
    return {
      value: 175,
      date: new Date().toISOString(),
    };
  }

  async fetchWeightHistory(): Promise<{ date: string; weight: number }[]> {
    return [];
  }

  async fetchBMI(): Promise<{ value: number; date: string } | null> {
    return {
      value: 24.5,
      date: new Date().toISOString(),
    };
  }
}

// ============================================
// Adapter Factory
// ============================================

function getAdapter(providerId: HealthProviderType, useMock = false): HealthProviderAdapter {
  // Use mock in development if explicitly requested
  if (useMock) {
    return new MockHealthAdapter(providerId);
  }

  switch (providerId) {
    case 'apple_health':
      return AppleHealthAdapter.getInstance();
    default:
      return new MockHealthAdapter(providerId);
  }
}

// ============================================
// Health Store
// ============================================

interface HealthStore {
  // Provider state
  providers: HealthProvider[];
  activeProvider: HealthProviderType | null;

  // Health data
  currentMetrics: HealthMetrics | null;
  goals: HealthGoals;
  workouts: WorkoutSession[];
  weight: { value: number; date: string } | null;
  bmi: { value: number; date: string } | null;
  weightHistory: { date: string; weight: number }[];
  weightGoal: number | null;
  weightGoalsByUser: Record<string, number>; // Store weight goals per user ID
  activityStreak: number;

  // UI state
  isConnecting: boolean;
  isSyncing: boolean;
  lastSyncError: string | null;

  // Actions
  connectProvider: (providerId: HealthProviderType) => Promise<boolean>;
  disconnectProvider: (providerId: HealthProviderType) => Promise<void>;
  setProviderConnected: (providerId: string, connected: boolean) => void;
  restoreProviderConnection: () => Promise<void>;
  syncHealthData: (userId?: string) => Promise<void>;
  syncWorkouts: (startDate: Date, endDate: Date) => Promise<void>;
  syncWeight: () => Promise<void>;
  logWeight: (weight: number) => void;
  setWeightGoal: (goal: number, userId?: string) => Promise<void>;
  getWeightGoal: (userId?: string) => number | null;
  loadWeightGoalFromSupabase: (userId: string) => Promise<void>;
  updateGoals: (goals: Partial<HealthGoals>, userId?: string) => Promise<void>;
  loadGoalsFromSupabase: (userId: string) => Promise<void>;
  calculateStreak: () => Promise<void>;
  getConnectedProviders: () => HealthProvider[];
  getWorkoutCount: (startDate: Date, endDate: Date) => Promise<number>;
}

export const useHealthStore = create<HealthStore>()(
  persist(
    (set, get) => ({
      providers: HEALTH_PROVIDERS,
      activeProvider: null,
      currentMetrics: null,
      goals: {
        moveCalories: 500,
        exerciseMinutes: 30,
        standHours: 12,
        steps: 10000,
      },
      workouts: [],
      weight: null,
      bmi: null,
      weightHistory: [],
      weightGoal: null,
      weightGoalsByUser: {},
      activityStreak: 0,
      isConnecting: false,
      isSyncing: false,
      lastSyncError: null,

      connectProvider: async (providerId: HealthProviderType) => {
        set({ isConnecting: true, lastSyncError: null });

        try {
          const adapter = getAdapter(providerId);

          if (!adapter.isAvailable()) {
            set({
              isConnecting: false,
              lastSyncError: 'This provider is not available on your device',
            });
            return false;
          }

          const hasPermissions = await adapter.requestPermissions();
          if (!hasPermissions) {
            // For HealthKit, permissions are requested during connect
          }

          const connected = await adapter.connect();

          if (connected) {
            set((state) => ({
              providers: state.providers.map((p) =>
                p.id === providerId
                  ? { ...p, connected: true, lastSync: new Date().toISOString() }
                  : p
              ),
              activeProvider: providerId,
              isConnecting: false,
            }));

            // Fetch initial data
            await get().syncHealthData();
            await get().syncWeight();
            return true;
          }

          set({ isConnecting: false });
          return false;
        } catch (error) {
          set({
            isConnecting: false,
            lastSyncError: error instanceof Error ? error.message : 'Connection failed',
          });
          return false;
        }
      },

      disconnectProvider: async (providerId: HealthProviderType) => {
        const adapter = getAdapter(providerId);
        await adapter.disconnect();

        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === providerId ? { ...p, connected: false, lastSync: undefined } : p
          ),
          activeProvider: state.activeProvider === providerId ? null : state.activeProvider,
        }));
      },

      // Set provider connected status (used by OAuth flow)
      setProviderConnected: (providerId: string, connected: boolean) => {
        console.log(`[Health] Setting provider ${providerId} connected: ${connected}`);
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === providerId
              ? {
                  ...p,
                  connected,
                  lastSync: connected ? new Date().toISOString() : undefined,
                }
              : p
          ),
          activeProvider: connected && !state.activeProvider ? providerId : state.activeProvider,
        }));

        // Persist to AsyncStorage
        const currentState = get();
        AsyncStorage.setItem('health-storage', JSON.stringify(currentState)).catch((e) => {
          console.error('[Health] Failed to persist state:', e);
        });
      },

      restoreProviderConnection: async () => {
        const { activeProvider } = get();
        
        // If no activeProvider, don't try to restore - user needs to manually connect
        if (!activeProvider) {
          return;
        }

        // Always try to reconnect the adapter on app restart
        // The adapter's isInitialized state is not persisted, so we need to re-initialize
        try {
          const adapter = getAdapter(activeProvider);
          
          if (!adapter.isAvailable()) {
            // Provider not available, clear it and mark as disconnected
            set((state) => ({
              activeProvider: null,
              providers: state.providers.map((p) =>
                p.id === activeProvider ? { ...p, connected: false, lastSync: undefined } : p
              ),
            }));
            return;
          }

          // Always call connect() to re-initialize the adapter
          // This is needed because isInitialized is lost on app restart
          const connected = await adapter.connect();
          
          if (connected) {
            set((state) => ({
              providers: state.providers.map((p) =>
                p.id === activeProvider
                  ? { ...p, connected: true, lastSync: new Date().toISOString() }
                  : p
              ),
            }));

            // Sync data after reconnection
            await get().syncHealthData();
            await get().syncWeight();
            await get().calculateStreak();
          } else {
            // Connection failed, clear active provider and mark as disconnected
            set((state) => ({
              activeProvider: null,
              providers: state.providers.map((p) =>
                p.id === activeProvider ? { ...p, connected: false, lastSync: undefined } : p
              ),
            }));
          }
        } catch (error) {
          console.error('Failed to restore provider connection:', error);
          // On error, clear active provider and mark as disconnected so user can reconnect
          set((state) => ({
            activeProvider: null,
            providers: state.providers.map((p) =>
              p.id === activeProvider ? { ...p, connected: false, lastSync: undefined } : p
            ),
          }));
        }
      },

      syncHealthData: async (userId?: string) => {
        const { activeProvider } = get();
        if (!activeProvider) return;

        // Try to get userId from auth store if not provided
        let effectiveUserId = userId;
        if (!effectiveUserId) {
          try {
            const { useAuthStore } = await import('./auth-store');
            effectiveUserId = useAuthStore.getState().user?.id;
          } catch (e) {
            // Auth store not available, continue without userId
          }
        }

        set({ isSyncing: true, lastSyncError: null });

        try {
          const adapter = getAdapter(activeProvider);
          const metrics = await adapter.fetchMetrics();

          if (metrics) {
            // Update goals from Apple Health if available
            const newGoals = metrics.goals ? {
              moveCalories: metrics.goals.moveCalories,
              exerciseMinutes: metrics.goals.exerciseMinutes,
              standHours: metrics.goals.standHours,
              steps: get().goals.steps, // Keep steps goal as-is (not from Apple)
            } : get().goals;

            set((state) => ({
              currentMetrics: metrics,
              goals: newGoals,
              providers: state.providers.map((p) =>
                p.id === activeProvider ? { ...p, lastSync: new Date().toISOString() } : p
              ),
              isSyncing: false,
            }));

            // Save goals to Supabase if userId is available and goals were updated from Apple Health
            if (effectiveUserId && metrics.goals) {
              await get().updateGoals(newGoals, effectiveUserId);
            }

            // Sync activity data using Edge Functions (server handles all calculations)
            if (effectiveUserId && isSupabaseConfigured() && supabase) {
              const today = new Date();
              const todayStr = today.toISOString().split('T')[0]; // Format: YYYY-MM-DD
              
              // Fetch today's workout count from provider
              const startOfDay = new Date(todayStr + 'T00:00:00Z');
              const endOfDay = new Date(todayStr + 'T23:59:59Z');
              const adapter = getAdapter(activeProvider);
              let workoutsCompleted = 0;
              try {
                const todayWorkouts = await adapter.fetchWorkouts(startOfDay, endOfDay);
                workoutsCompleted = todayWorkouts.length;
              } catch (e) {
                console.error('[HealthStore] Failed to fetch today workouts:', e);
              }

              // Get session for authorization
              const { data: sessionData } = await supabase.auth.getSession();
              
              if (activeProvider === 'apple_health') {
                // For Apple Health, call calculate-daily-score Edge Function
                try {
                  const { data, error: functionError } = await supabase.functions.invoke(
                    'calculate-daily-score',
                    {
                      body: {
                        userId: effectiveUserId,
                        date: todayStr,
                        moveCalories: Math.round(metrics.activeCalories || 0),
                        exerciseMinutes: Math.round(metrics.exerciseMinutes || 0),
                        standHours: Math.round(metrics.standHours || 0),
                        steps: Math.round(metrics.steps || 0),
                        distanceMeters: Math.round((metrics.distance || 0) * 100) / 100,
                        workoutsCompleted,
                      },
                      headers: {
                        Authorization: `Bearer ${sessionData.session?.access_token}`,
                      },
                    }
                  );

                  if (functionError) {
                    console.error('[HealthStore] Error calling calculate-daily-score:', functionError);
                  } else {
                    console.log('[HealthStore] Daily score calculated via Edge Function:', data);
                  }
                } catch (e) {
                  console.error('[HealthStore] Exception calling calculate-daily-score:', e);
                }
              } else {
                // For other providers (Fitbit, Garmin, etc.), call sync-provider-data Edge Function
                try {
                  const { data, error: functionError } = await supabase.functions.invoke(
                    'sync-provider-data',
                    {
                      body: {
                        provider: activeProvider,
                        date: todayStr,
                      },
                      headers: {
                        Authorization: `Bearer ${sessionData.session?.access_token}`,
                      },
                    }
                  );

                  if (functionError) {
                    console.error('[HealthStore] Error calling sync-provider-data:', functionError);
                  } else {
                    console.log('[HealthStore] Provider data synced via Edge Function:', data);
                  }
                } catch (e) {
                  console.error('[HealthStore] Exception calling sync-provider-data:', e);
                }
              }
            }

            // Sync weight and BMI data
            try {
              await get().syncWeight();
            } catch (e) {
              console.error('[HealthStore] Failed to sync weight/BMI:', e);
              // Don't fail the entire sync if weight sync fails
            }
          } else {
            set({ isSyncing: false });
          }
        } catch (error) {
          set({
            isSyncing: false,
            lastSyncError: error instanceof Error ? error.message : 'Sync failed',
          });
        }
      },

      syncWorkouts: async (startDate: Date, endDate: Date) => {
        const { activeProvider } = get();
        if (!activeProvider) {
          console.log('[HealthStore] syncWorkouts: No active provider');
          return;
        }

        try {
          console.log('[HealthStore] syncWorkouts: Fetching workouts', {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            activeProvider,
          });
          
          const adapter = getAdapter(activeProvider);
          const fetchedWorkouts = await adapter.fetchWorkouts(startDate, endDate);
          
          console.log('[HealthStore] syncWorkouts: Fetched workouts', {
            count: fetchedWorkouts.length,
            workouts: fetchedWorkouts.map(w => ({
              type: w.type,
              startTime: w.startTime,
              duration: w.duration,
            })),
          });
          
          set({ workouts: fetchedWorkouts });
        } catch (error) {
          console.error('[HealthStore] Failed to sync workouts:', error);
        }
      },

      syncWeight: async () => {
        const { activeProvider } = get();
        if (!activeProvider) return;

        try {
          const adapter = getAdapter(activeProvider);
          const [weight, bmi, historyFromHealth] = await Promise.all([
            adapter.fetchWeight(), 
            adapter.fetchBMI(),
            adapter.fetchWeightHistory(1095), // Get last 3 years of weight data
          ]);
          
          // Use history from Apple Health if available, otherwise keep existing
          let newHistory = historyFromHealth.length > 0 
            ? historyFromHealth 
            : get().weightHistory;
          
          // Sort by date and keep last 500 entries (plenty for multi-year history)
          newHistory = newHistory
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(-500);
          
          set({ weight, bmi, weightHistory: newHistory });
        } catch (error) {
          console.error('Failed to sync weight:', error);
        }
      },

      updateGoals: async (goals: Partial<HealthGoals>, userId?: string) => {
        // Update local state
        set((state) => ({
          goals: { ...state.goals, ...goals },
        }));

        // Save to Supabase if userId is provided and Supabase is configured
        if (userId && isSupabaseConfigured() && supabase) {
          try {
            // First, check if user_fitness row exists (use maybeSingle to avoid errors)
            const { data: existing, error: checkError } = await supabase
              .from('user_fitness')
              .select('id, target_weight')
              .eq('user_id', userId)
              .maybeSingle();

            // Prepare update data
            const updateData: any = {
              updated_at: new Date().toISOString(),
            };

            if (goals.moveCalories !== undefined) {
              updateData.move_goal = goals.moveCalories;
            }
            if (goals.exerciseMinutes !== undefined) {
              updateData.exercise_goal = goals.exerciseMinutes;
            }
            if (goals.standHours !== undefined) {
              updateData.stand_goal = goals.standHours;
            }

            if (existing && !checkError) {
              // Update existing row
              const { error } = await supabase
                .from('user_fitness')
                .update(updateData)
                .eq('user_id', userId);

              if (error) {
                console.error('[HealthStore] Error updating goals in Supabase:', error);
              } else {
                console.log('[HealthStore] Goals updated in Supabase:', updateData);
              }
            } else {
              // Try to create new row - use upsert to handle race conditions
              const currentGoals = get().goals;
              const { error } = await supabase
                .from('user_fitness')
                .upsert({
                  user_id: userId,
                  move_goal: goals.moveCalories ?? currentGoals.moveCalories,
                  exercise_goal: goals.exerciseMinutes ?? currentGoals.exerciseMinutes,
                  stand_goal: goals.standHours ?? currentGoals.standHours,
                  target_weight: null, // Will be set separately if needed
                  updated_at: new Date().toISOString(),
                }, {
                  onConflict: 'user_id',
                });

              if (error) {
                // If it's a duplicate key error, try updating instead
                if (error.code === '23505') {
                  const { error: updateError } = await supabase
                    .from('user_fitness')
                    .update(updateData)
                    .eq('user_id', userId);
                  
                  if (updateError) {
                    console.error('[HealthStore] Error updating goals in Supabase (fallback):', updateError);
                  } else {
                    console.log('[HealthStore] Goals updated in Supabase (fallback):', updateData);
                  }
                } else {
                  console.error('[HealthStore] Error creating goals in Supabase:', error);
                }
              } else {
                console.log('[HealthStore] Goals created in Supabase');
              }
            }
          } catch (error) {
            console.error('[HealthStore] Exception saving goals to Supabase:', error);
          }
        }
      },

      loadGoalsFromSupabase: async (userId: string) => {
        if (!isSupabaseConfigured() || !supabase) {
          return;
        }

        try {
          const { data, error } = await supabase
            .from('user_fitness')
            .select('move_goal, exercise_goal, stand_goal')
            .eq('user_id', userId)
            .single();

          if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
            console.error('[HealthStore] Error loading goals from Supabase:', error);
            return;
          }

          if (data) {
            const loadedGoals: Partial<HealthGoals> = {};
            if (data.move_goal) loadedGoals.moveCalories = data.move_goal;
            if (data.exercise_goal) loadedGoals.exerciseMinutes = data.exercise_goal;
            if (data.stand_goal) loadedGoals.standHours = data.stand_goal;

            if (Object.keys(loadedGoals).length > 0) {
              console.log('[HealthStore] Loaded goals from Supabase:', loadedGoals);
              
              // Update local state
              set((state) => ({
                goals: { ...state.goals, ...loadedGoals },
              }));
            }
          }
        } catch (error) {
          console.error('[HealthStore] Exception loading goals from Supabase:', error);
        }
      },

      setWeightGoal: async (goal: number, userId?: string) => {
        // Update local state
        set((state) => {
          const newWeightGoalsByUser = { ...state.weightGoalsByUser };
          if (userId) {
            newWeightGoalsByUser[userId] = goal;
          }
          // Also store globally for backward compatibility
          return { 
            weightGoal: goal,
            weightGoalsByUser: newWeightGoalsByUser
          };
        });

        // Save to Supabase if userId is provided and Supabase is configured
        if (userId && isSupabaseConfigured() && supabase) {
          try {
            // First, check if user_fitness row exists
            const { data: existing } = await supabase
              .from('user_fitness')
              .select('id, move_goal, exercise_goal, stand_goal')
              .eq('user_id', userId)
              .single();

            // Upsert the weight goal in user_fitness table
            // If row exists, preserve existing goals; if not, use defaults
            const upsertData: any = {
              user_id: userId,
              target_weight: goal,
              updated_at: new Date().toISOString(),
            };

            if (existing) {
              // Preserve existing goals
              upsertData.move_goal = existing.move_goal;
              upsertData.exercise_goal = existing.exercise_goal;
              upsertData.stand_goal = existing.stand_goal;
            } else {
              // Use defaults for new row
              const currentGoals = get().goals;
              upsertData.move_goal = currentGoals.moveCalories;
              upsertData.exercise_goal = currentGoals.exerciseMinutes;
              upsertData.stand_goal = currentGoals.standHours;
            }

            const { error } = await supabase
              .from('user_fitness')
              .upsert(upsertData, {
                onConflict: 'user_id',
              });

            if (error) {
              console.error('[HealthStore] Error saving weight goal to Supabase:', error);
            } else {
              console.log('[HealthStore] Weight goal saved to Supabase:', goal);
            }
          } catch (error) {
            console.error('[HealthStore] Exception saving weight goal to Supabase:', error);
          }
        }
      },

      loadWeightGoalFromSupabase: async (userId: string) => {
        if (!isSupabaseConfigured() || !supabase) {
          return;
        }

        try {
          const { data, error } = await supabase
            .from('user_fitness')
            .select('target_weight')
            .eq('user_id', userId)
            .single();

          if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
            console.error('[HealthStore] Error loading weight goal from Supabase:', error);
            return;
          }

          if (data?.target_weight) {
            const goal = data.target_weight;
            console.log('[HealthStore] Loaded weight goal from Supabase:', goal);
            
            // Update local state
            set((state) => {
              const newWeightGoalsByUser = { ...state.weightGoalsByUser };
              newWeightGoalsByUser[userId] = goal;
              return {
                weightGoal: goal,
                weightGoalsByUser: newWeightGoalsByUser,
              };
            });
          }
        } catch (error) {
          console.error('[HealthStore] Exception loading weight goal from Supabase:', error);
        }
      },

      getWeightGoal: (userId?: string) => {
        if (userId) {
          // Try user-specific goal first, fall back to global for backward compatibility
          return get().weightGoalsByUser[userId] ?? get().weightGoal;
        }
        return get().weightGoal;
      },

      logWeight: (weightValue: number) => {
        const { weightHistory } = get();
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        
        let newHistory = [...weightHistory];
        
        // Check if we already have an entry for today
        const existingIndex = newHistory.findIndex(
          (entry) => entry.date.split('T')[0] === today
        );
        
        const newEntry = { date: now.toISOString(), weight: weightValue };
        
        if (existingIndex >= 0) {
          // Update today's entry
          newHistory[existingIndex] = newEntry;
        } else {
          // Add new entry
          newHistory.push(newEntry);
        }
        
        // Sort by date and keep last 30 entries
        newHistory = newHistory
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(-30);
        
        // Update both current weight and history
        set({ 
          weight: { value: weightValue, date: now.toISOString() },
          weightHistory: newHistory 
        });
      },

      calculateStreak: async () => {
        const { activeProvider } = get();
        if (!activeProvider) {
          set({ activityStreak: 0 });
          return;
        }

        try {
          const adapter = getAdapter(activeProvider);
          
          // Fetch workouts from the last 60 days to calculate streak
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - 60);
          
          const workouts = await adapter.fetchWorkouts(startDate, endDate);
          
          if (workouts.length === 0) {
            set({ activityStreak: 0 });
            return;
          }

          // Get unique workout dates
          const workoutDates = new Set(
            workouts.map(w => new Date(w.startTime).toDateString())
          );

          // Calculate streak by counting consecutive days backwards from today
          let streak = 0;
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          for (let i = 0; i < 60; i++) {
            const checkDate = new Date(today);
            checkDate.setDate(checkDate.getDate() - i);
            
            if (workoutDates.has(checkDate.toDateString())) {
              streak++;
            } else if (i === 0) {
              // If no workout today, that's okay - check if yesterday started streak
              continue;
            } else {
              // Streak broken
              break;
            }
          }

          set({ activityStreak: streak });
        } catch (error) {
          console.error('Failed to calculate streak:', error);
          set({ activityStreak: 0 });
        }
      },

      getConnectedProviders: () => {
        return get().providers.filter((p) => p.connected);
      },

      // Get workout count from Apple Health for a date range
      getWorkoutCount: async (startDate: Date, endDate: Date): Promise<number> => {
        const { activeProvider } = get();
        if (!activeProvider) return 0;

        try {
          const adapter = getAdapter(activeProvider);
          const workouts = await adapter.fetchWorkouts(startDate, endDate);
          return workouts.length;
        } catch (error) {
          console.error('[HealthStore] Failed to get workout count:', error);
          return 0;
        }
      },
    }),
    {
      name: 'health-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        providers: state.providers,
        activeProvider: state.activeProvider,
        goals: state.goals,
        weight: state.weight,
        bmi: state.bmi,
        weightHistory: state.weightHistory,
        weightGoal: state.weightGoal,
        weightGoalsByUser: state.weightGoalsByUser,
        activityStreak: state.activityStreak,
      }),
      // Merge persisted provider connection state with fresh provider metadata
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<typeof currentState>;
        // Merge providers: use fresh HEALTH_PROVIDERS metadata but keep persisted connection state
        const mergedProviders = HEALTH_PROVIDERS.map((freshProvider) => {
          const persistedProvider = persisted.providers?.find((p) => p.id === freshProvider.id);
          if (persistedProvider) {
            // Keep connection state from persisted, but use fresh metadata
            return {
              ...freshProvider,
              connected: persistedProvider.connected,
              lastSync: persistedProvider.lastSync,
            };
          }
          return freshProvider;
        });
        
        return {
          ...currentState,
          ...persisted,
          providers: mergedProviders,
        };
      },
    }
  )
);
