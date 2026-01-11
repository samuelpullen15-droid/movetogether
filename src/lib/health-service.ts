import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, NativeModules } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';
import AppleHealthKit, {
  HealthKitPermissions,
  HealthValue,
  HealthActivitySummary,
} from 'react-native-health';
import {
  HealthProviderType,
  HealthProvider,
  HealthMetrics,
  HealthGoals,
  WorkoutSession,
  HEALTH_PROVIDERS,
  WorkoutType,
} from './health-types';

// Get the native module directly
const { AppleHealthKit: NativeHealthKit } = NativeModules;

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
// HealthKit Permissions Configuration
// ============================================

const healthKitPermissions = {
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
      'BodyMassIndex',
      'SleepAnalysis',
      'ActivitySummary',
    ],
    write: [],
  },
};

// ============================================
// Apple Health Adapter (REAL HealthKit)
// ============================================

// Singleton instance
let appleHealthAdapterInstance: AppleHealthAdapter | null = null;

class AppleHealthAdapter implements HealthProviderAdapter {
  private isInitialized = false;

  static getInstance(): AppleHealthAdapter {
    if (!appleHealthAdapterInstance) {
      appleHealthAdapterInstance = new AppleHealthAdapter();
    }
    return appleHealthAdapterInstance;
  }

  isAvailable(): boolean {
    return Platform.OS === 'ios';
  }

  async connect(): Promise<boolean> {
    console.log('[AppleHealth] connect() called');
    
    if (!this.isAvailable()) {
      console.log('[AppleHealth] Not available on this platform');
      return false;
    }

    return new Promise((resolve) => {
      console.log('[AppleHealth] Initializing HealthKit with permissions...');
      try {
        NativeHealthKit.initHealthKit(healthKitPermissions, (err: string | null, result: any) => {
          console.log('[AppleHealth] initHealthKit callback:', { err, result });
          if (err) {
            console.log('[AppleHealth] Init error:', err);
            resolve(false);
            return;
          }

          this.isInitialized = true;
          console.log('[AppleHealth] Successfully connected');
          resolve(true);
        });
      } catch (e) {
        console.log('[AppleHealth] Exception calling initHealthKit:', e);
        resolve(false);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.isInitialized = false;
    console.log('[AppleHealth] Disconnected');
  }

  async requestPermissions(): Promise<boolean> {
    // Permissions are requested during initHealthKit
    return this.isInitialized;
  }

  async fetchMetrics(): Promise<HealthMetrics | null> {
    if (!this.isInitialized) {
      console.log('[AppleHealth] Not initialized, attempting to connect...');
      const connected = await this.connect();
      if (!connected) {
        console.log('[AppleHealth] Failed to auto-connect');
        return null;
      }
    }

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    try {
      console.log('[AppleHealth] Fetching metrics...');
      // Fetch all metrics in parallel
      const [
        activeCalories,
        exerciseMinutes,
        standHours,
        steps,
        distance,
        flights,
        heartRate,
        restingHeartRate,
        activitySummary,
      ] = await Promise.all([
        this.getActiveCalories(startOfDay),
        this.getExerciseMinutes(startOfDay),
        this.getStandHours(startOfDay),
        this.getSteps(startOfDay),
        this.getDistance(startOfDay),
        this.getFlightsClimbed(startOfDay),
        this.getHeartRate(),
        this.getRestingHeartRate(),
        this.getActivitySummary(startOfDay),
      ]);

      console.log('[AppleHealth] Metrics fetched:', { activeCalories, exerciseMinutes, standHours, steps });
      console.log('[AppleHealth] Activity Summary:', activitySummary);

      // Prefer ActivitySummary values as they match Apple's Activity app exactly
      const finalActiveCalories = activitySummary?.activeEnergyBurned ?? activeCalories;
      const finalExerciseMinutes = activitySummary?.appleExerciseTime ?? exerciseMinutes;
      const finalStandHours = activitySummary?.appleStandHours ?? standHours;

      console.log('[AppleHealth] Using values:', { 
        activeCalories: finalActiveCalories, 
        exerciseMinutes: finalExerciseMinutes, 
        standHours: finalStandHours 
      });

      return {
        activeCalories: Math.round(finalActiveCalories),
        exerciseMinutes: Math.round(finalExerciseMinutes),
        standHours: Math.round(finalStandHours),
        steps,
        distanceMeters: distance,
        floorsClimbed: flights,
        heartRateAvg: heartRate,
        heartRateResting: restingHeartRate,
        heartRateMax: 0,
        workoutsCompleted: 0,
        lastUpdated: new Date().toISOString(),
        provider: 'apple_health',
        // Include goals from Apple Health
        goals: activitySummary ? {
          moveCalories: activitySummary.activeEnergyBurnedGoal || 500,
          exerciseMinutes: activitySummary.appleExerciseTimeGoal || 30,
          standHours: activitySummary.appleStandHoursGoal || 12,
        } : undefined,
      };
    } catch (error) {
      console.error('[AppleHealth] Error fetching metrics:', error);
      return null;
    }
  }

  private getActivitySummary(startDate: Date): Promise<any> {
    return new Promise((resolve) => {
      try {
        NativeHealthKit.getActivitySummary(
          {
            startDate: startDate.toISOString(),
            endDate: new Date().toISOString(),
          },
          (err: any, results: any) => {
            console.log('[AppleHealth] getActivitySummary:', { err, results });
            if (err || !results || results.length === 0) {
              resolve(null);
              return;
            }
            // Get today's summary (most recent)
            const todaySummary = results[results.length - 1];
            resolve(todaySummary);
          }
        );
      } catch (e) {
        console.log('[AppleHealth] Exception in getActivitySummary:', e);
        resolve(null);
      }
    });
  }

  // Individual metric fetchers using NativeHealthKit
  private getActiveCalories(startDate: Date): Promise<number> {
    return new Promise((resolve) => {
      try {
        NativeHealthKit.getActiveEnergyBurned(
          {
            startDate: startDate.toISOString(),
            endDate: new Date().toISOString(),
          },
          (err: any, results: any) => {
            console.log('[AppleHealth] getActiveEnergyBurned:', { err, results });
            if (err || !results) {
              resolve(0);
              return;
            }
            if (Array.isArray(results)) {
              const total = results.reduce((sum: number, r: any) => sum + (r.value || 0), 0);
              resolve(Math.round(total));
            } else {
              resolve(Math.round(results.value || 0));
            }
          }
        );
      } catch (e) {
        console.log('[AppleHealth] Exception in getActiveCalories:', e);
        resolve(0);
      }
    });
  }

  private getExerciseMinutes(startDate: Date): Promise<number> {
    return new Promise((resolve) => {
      try {
        NativeHealthKit.getAppleExerciseTime(
          {
            startDate: startDate.toISOString(),
            endDate: new Date().toISOString(),
          },
          (err: any, results: any) => {
            console.log('[AppleHealth] getAppleExerciseTime:', { err, results });
            if (err || !results) {
              resolve(0);
              return;
            }
            if (Array.isArray(results)) {
              // Values are in seconds, convert to minutes
              const totalSeconds = results.reduce((sum: number, r: any) => sum + (r.value || 0), 0);
              resolve(Math.round(totalSeconds / 60));
            } else {
              resolve(Math.round((results.value || 0) / 60));
            }
          }
        );
      } catch (e) {
        console.log('[AppleHealth] Exception in getExerciseMinutes:', e);
        resolve(0);
      }
    });
  }

  private getStandHours(startDate: Date): Promise<number> {
    return new Promise((resolve) => {
      try {
        NativeHealthKit.getAppleStandTime(
          {
            startDate: startDate.toISOString(),
            endDate: new Date().toISOString(),
          },
          (err: any, results: any) => {
            console.log('[AppleHealth] getAppleStandTime:', { err, results });
            if (err || !results) {
              resolve(0);
              return;
            }
            if (Array.isArray(results)) {
              // Each result represents an hour where standing occurred
              // Count hours where user stood for at least 1 minute (60 seconds)
              const standingHours = results.filter((r: any) => (r.value || 0) >= 60).length;
              resolve(standingHours);
            } else {
              resolve(results.value >= 60 ? 1 : 0);
            }
          }
        );
      } catch (e) {
        console.log('[AppleHealth] Exception in getStandHours:', e);
        resolve(0);
      }
    });
  }

  private getSteps(startDate: Date): Promise<number> {
    return new Promise((resolve) => {
      try {
        NativeHealthKit.getStepCount(
          {
            startDate: startDate.toISOString(),
            endDate: new Date().toISOString(),
          },
          (err: any, results: any) => {
            console.log('[AppleHealth] getStepCount:', { err, results });
            if (err || !results) {
              resolve(0);
              return;
            }
            resolve(Math.round(results.value || 0));
          }
        );
      } catch (e) {
        console.log('[AppleHealth] Exception in getSteps:', e);
        resolve(0);
      }
    });
  }

  private getDistance(startDate: Date): Promise<number> {
    return new Promise((resolve) => {
      try {
        NativeHealthKit.getDistanceWalkingRunning(
          {
            startDate: startDate.toISOString(),
            endDate: new Date().toISOString(),
          },
          (err: any, results: any) => {
            console.log('[AppleHealth] getDistanceWalkingRunning:', { err, results });
            if (err || !results) {
              resolve(0);
              return;
            }
            // Returns in miles, convert to meters
            resolve(Math.round((results.value || 0) * 1609.34));
          }
        );
      } catch (e) {
        console.log('[AppleHealth] Exception in getDistance:', e);
        resolve(0);
      }
    });
  }

  private getFlightsClimbed(startDate: Date): Promise<number> {
    return new Promise((resolve) => {
      try {
        NativeHealthKit.getFlightsClimbed(
          {
            startDate: startDate.toISOString(),
            endDate: new Date().toISOString(),
          },
          (err: any, results: any) => {
            console.log('[AppleHealth] getFlightsClimbed:', { err, results });
            if (err || !results) {
              resolve(0);
              return;
            }
            resolve(Math.round(results.value || 0));
          }
        );
      } catch (e) {
        console.log('[AppleHealth] Exception in getFlightsClimbed:', e);
        resolve(0);
      }
    });
  }

  private getHeartRate(): Promise<number> {
    return new Promise((resolve) => {
      try {
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);

        NativeHealthKit.getHeartRateSamples(
          {
            startDate: startDate.toISOString(),
            endDate: new Date().toISOString(),
            limit: 100,
          },
          (err: any, results: any) => {
            console.log('[AppleHealth] getHeartRateSamples:', { err, resultsCount: results?.length });
            if (err || !results || results.length === 0) {
              resolve(0);
              return;
            }
            const avg = results.reduce((sum: number, r: any) => sum + (r.value || 0), 0) / results.length;
            resolve(Math.round(avg));
          }
        );
      } catch (e) {
        console.log('[AppleHealth] Exception in getHeartRate:', e);
        resolve(0);
      }
    });
  }

  private getRestingHeartRate(): Promise<number> {
    return new Promise((resolve) => {
      try {
        NativeHealthKit.getRestingHeartRate(
          {
            startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            endDate: new Date().toISOString(),
          },
          (err: any, results: any) => {
            console.log('[AppleHealth] getRestingHeartRate:', { err, results });
            if (err || !results || results.length === 0) {
              resolve(0);
              return;
            }
            // Get most recent
            resolve(Math.round(results[results.length - 1]?.value || 0));
          }
        );
      } catch (e) {
        console.log('[AppleHealth] Exception in getRestingHeartRate:', e);
        resolve(0);
      }
    });
  }

  async fetchWorkouts(startDate: Date, endDate: Date): Promise<WorkoutSession[]> {
    if (!this.isInitialized) {
      const connected = await this.connect();
      if (!connected) return [];
    }

    return new Promise((resolve) => {
      try {
        NativeHealthKit.getSamples(
          {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            type: 'Workout',
          },
          (err: any, results: any) => {
            console.log('[AppleHealth] getSamples (Workout):', { 
              err, 
              resultsCount: results?.length,
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
            });
            
            if (err) {
              console.error('[AppleHealth] Error fetching workouts:', err);
              resolve([]);
              return;
            }
            
            if (!results || results.length === 0) {
              console.log('[AppleHealth] No workout results found');
              resolve([]);
              return;
            }

            // Log all available fields to debug
            if (results.length > 0) {
              console.log('[AppleHealth] First workout sample keys:', Object.keys(results[0]));
              console.log('[AppleHealth] First workout sample full:', JSON.stringify(results[0], null, 2));
            }

            const workouts: WorkoutSession[] = results
              .filter((w: any) => {
                // Filter out workouts without valid dates
                const hasValidDates = w.startDate || w.start || w.date;
                if (!hasValidDates) {
                  console.warn('[AppleHealth] Workout missing dates:', {
                    activityName: w.activityName,
                    availableKeys: Object.keys(w),
                  });
                }
                return hasValidDates;
              })
              .map((w: any) => {
                // Try different possible field names for dates
                const startDate = w.startDate || w.start || w.date || w.creationDate;
                const endDate = w.endDate || w.end || w.finishDate;
                
                if (!startDate) {
                  console.error('[AppleHealth] Cannot find start date in workout:', w);
                  return null;
                }

                const start = new Date(startDate);
                const end = endDate ? new Date(endDate) : new Date(start.getTime() + (w.duration || 0) * 60000);
                
                return {
                  id: w.id || w.uuid || `${startDate}-${w.activityName}`,
                  type: this.mapWorkoutType(w.activityName),
                  startTime: start.toISOString(),
                  endTime: end.toISOString(),
                  duration: Math.round((end.getTime() - start.getTime()) / 60000),
                  calories: Math.round(w.calories || w.totalEnergyBurned || 0),
                  heartRateAvg: w.metadata?.HKAverageHeartRate || w.heartRateAvg,
                  distance: w.distance ? Math.round(w.distance * 1609.34) : undefined,
                  provider: 'apple_health',
                  sourceName: w.sourceName || w.source?.name,
                  sourceId: w.sourceId || w.source?.id || w.source?.bundleIdentifier,
                };
              })
              .filter((w: any) => w !== null) as WorkoutSession[];

            console.log('[AppleHealth] Mapped workouts:', workouts.map(w => ({
              type: w.type,
              startTime: w.startTime,
              duration: w.duration,
              calories: w.calories,
            })));

            resolve(workouts);
          }
        );
      } catch (e) {
        console.log('[AppleHealth] Exception in fetchWorkouts:', e);
        resolve([]);
      }
    });
  }

  async fetchWeight(): Promise<{ value: number; date: string } | null> {
    if (!this.isInitialized) {
      const connected = await this.connect();
      if (!connected) return null;
    }

    return new Promise((resolve) => {
      try {
        NativeHealthKit.getLatestWeight(
          { unit: 'pound' },
          (err: any, results: any) => {
            console.log('[AppleHealth] getLatestWeight:', { err, results });
            if (err || !results) {
              resolve(null);
              return;
            }
            resolve({
              value: results.value,
              date: results.startDate,
            });
          }
        );
      } catch (e) {
        console.log('[AppleHealth] Exception in fetchWeight:', e);
        resolve(null);
      }
    });
  }

  async fetchWeightHistory(days: number = 90): Promise<{ date: string; weight: number }[]> {
    if (!this.isInitialized) {
      const connected = await this.connect();
      if (!connected) return [];
    }

    return new Promise((resolve) => {
      try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        NativeHealthKit.getWeightSamples(
          {
            startDate: startDate.toISOString(),
            endDate: new Date().toISOString(),
            unit: 'pound',
            ascending: true,
          },
          (err: any, results: any) => {
            console.log('[AppleHealth] getWeightSamples:', { err, resultsCount: results?.length });
            if (err || !results || results.length === 0) {
              resolve([]);
              return;
            }
            
            // Map results to our format
            const history = results.map((r: any) => ({
              date: r.startDate,
              weight: r.value,
            }));
            
            resolve(history);
          }
        );
      } catch (e) {
        console.log('[AppleHealth] Exception in fetchWeightHistory:', e);
        resolve([]);
      }
    });
  }

  async fetchBMI(): Promise<{ value: number; date: string } | null> {
    if (!this.isInitialized) {
      const connected = await this.connect();
      if (!connected) return null;
    }

    return new Promise((resolve) => {
      try {
        NativeHealthKit.getLatestBmi(
          {},
          (err: any, results: any) => {
            console.log('[AppleHealth] getLatestBmi:', { err, results });
            if (err || !results) {
              resolve(null);
              return;
            }
            resolve({
              value: results.value,
              date: results.startDate,
            });
          }
        );
      } catch (e) {
        console.log('[AppleHealth] Exception in fetchBMI:', e);
        resolve(null);
      }
    });
  }

  private mapWorkoutType(activityName: string): WorkoutType {
    const mapping: Record<string, WorkoutType> = {
      Running: 'running',
      Walking: 'walking',
      Cycling: 'cycling',
      Swimming: 'swimming',
      TraditionalStrengthTraining: 'strength',
      FunctionalStrengthTraining: 'strength',
      HighIntensityIntervalTraining: 'hiit',
      Yoga: 'yoga',
    };
    return mapping[activityName] || 'other';
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

      restoreProviderConnection: async () => {
        const { activeProvider } = get();
        
        // If no activeProvider, don't try to restore - user needs to manually connect
        // This handles the case where app was deleted and permissions were revoked
        if (!activeProvider) {
          return;
        }

        // Check if provider is already marked as connected
        const provider = get().providers.find((p) => p.id === activeProvider);
        if (provider?.connected) {
          // Already connected, just sync data
          await get().syncHealthData();
          await get().syncWeight();
          return;
        }

        // Try to reconnect
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

          // Attempt to reconnect (this will request permissions if needed)
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

            // Save goals to Supabase if userId is provided and goals were updated from Apple Health
            if (userId && metrics.goals) {
              await get().updateGoals(newGoals, userId);
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
            // First, check if user_fitness row exists
            const { data: existing } = await supabase
              .from('user_fitness')
              .select('id, target_weight')
              .eq('user_id', userId)
              .single();

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

            if (existing) {
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
              // Create new row with all goals
              const currentGoals = get().goals;
              const { error } = await supabase
                .from('user_fitness')
                .insert({
                  user_id: userId,
                  move_goal: goals.moveCalories ?? currentGoals.moveCalories,
                  exercise_goal: goals.exerciseMinutes ?? currentGoals.exerciseMinutes,
                  stand_goal: goals.standHours ?? currentGoals.standHours,
                  target_weight: null, // Will be set separately if needed
                  updated_at: new Date().toISOString(),
                });

              if (error) {
                console.error('[HealthStore] Error creating goals in Supabase:', error);
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
    }
  )
);
