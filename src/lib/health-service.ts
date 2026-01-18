import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, InteractionManager } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';
import {
  HealthProviderType,
  HealthProvider,
  HealthMetrics,
  HealthGoals,
  WorkoutSession,
  HEALTH_PROVIDERS,
  WorkoutType,
} from './health-types';
// Import auth-store statically to avoid dynamic import causing Metro bundling freeze
import { useAuthStore } from './auth-store';

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
// Apple Health Adapter (@kingstinct/react-native-healthkit)
// ============================================

// Singleton instance
let appleHealthAdapterInstance: AppleHealthAdapter | null = null;

// Lazy load HealthKit module with caching
let cachedHealthKitModule: typeof import('@kingstinct/react-native-healthkit') | null = null;
let hasLoggedModuleLoad = false;

const loadHealthKitModule = async () => {
  // Return cached module if already loaded
  if (cachedHealthKitModule) {
    return cachedHealthKitModule;
  }
  
  if (Platform.OS !== 'ios') {
    return null;
  }

  try {
    const module = await import('@kingstinct/react-native-healthkit');
    cachedHealthKitModule = module;
    if (!hasLoggedModuleLoad) {
      console.log('[AppleHealth] HealthKit module loaded via @kingstinct/react-native-healthkit');
      hasLoggedModuleLoad = true;
    }
    return cachedHealthKitModule;
  } catch (error) {
    console.error('[AppleHealth] Failed to load @kingstinct/react-native-healthkit:', error);
    return null;
  }
};

// Helper to wrap HealthKit calls with a timeout
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, fallback: T, silent: boolean = false): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => {
        if (!silent) {
          console.warn(`[AppleHealth] Operation timed out after ${timeoutMs}ms, using fallback`);
        }
        resolve(fallback);
      }, timeoutMs);
    }),
  ]);
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
      const HealthKit = await loadHealthKitModule();
      if (!HealthKit) {
        console.error('[AppleHealth] Failed to load HealthKit module');
        return false;
      }

      const { default: Healthkit, HKQuantityTypeIdentifier, HKCategoryTypeIdentifier } = HealthKit;

      // Check if HealthKit is available on this device
      const isAvailable = await Healthkit.isHealthDataAvailable();
      if (!isAvailable) {
        console.error('[AppleHealth] HealthKit is not available on this device');
        return false;
      }

      console.log('[AppleHealth] HealthKit available, requesting permissions...');

      // Define read permissions
      const readPermissions = [
        HKQuantityTypeIdentifier.activeEnergyBurned,
        HKQuantityTypeIdentifier.appleExerciseTime,
        HKQuantityTypeIdentifier.appleStandTime,
        HKQuantityTypeIdentifier.stepCount,
        HKQuantityTypeIdentifier.distanceWalkingRunning,
        HKQuantityTypeIdentifier.flightsClimbed,
        HKQuantityTypeIdentifier.heartRate,
        HKQuantityTypeIdentifier.restingHeartRate,
        HKQuantityTypeIdentifier.bodyMass,
        HKQuantityTypeIdentifier.height,
        HKQuantityTypeIdentifier.bodyMassIndex,
        'HKActivitySummaryType' as any, // Activity Summary
        'HKWorkoutType' as any, // Workouts
      ];

      // Request authorization
      await Healthkit.requestAuthorization(readPermissions, []);
      
      console.log('[AppleHealth] Permissions granted successfully');
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('[AppleHealth] Error requesting permissions:', error);
      console.error('[AppleHealth] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      return false;
    }
  }

  async connect(): Promise<boolean> {
    console.log('[AppleHealth] connect() called, isInitialized:', this.isInitialized);
    if (!this.isAvailable()) {
      console.log('[AppleHealth] Not available on this platform');
      return false;
    }

    // Request permissions if not already initialized
    if (!this.isInitialized) {
      console.log('[AppleHealth] Not initialized, requesting permissions...');
      const hasPermissions = await this.requestPermissions();
      console.log('[AppleHealth] Permission request result:', hasPermissions, 'isInitialized after:', this.isInitialized);
      return hasPermissions;
    }

    console.log('[AppleHealth] Already initialized');
    return true;
  }

  async disconnect(): Promise<void> {
    this.isInitialized = false;
  }

  async fetchMetrics(): Promise<HealthMetrics | null> {
    if (!this.isAvailable()) {
      console.log('[AppleHealth] fetchMetrics: Not available on this platform');
      return null;
    }
    
    if (!this.isInitialized) {
      console.warn('[AppleHealth] fetchMetrics: Not initialized - attempting to initialize now...');
      const initialized = await this.requestPermissions();
      if (!initialized) {
        console.error('[AppleHealth] fetchMetrics: Failed to initialize HealthKit');
        return null;
      }
    }
    
    console.log('[AppleHealth] fetchMetrics: Starting fetch, isInitialized:', this.isInitialized);

    const TIMEOUT_MS = 15000;

    try {
      const HealthKit = await loadHealthKitModule();
      if (!HealthKit) {
        console.error('[AppleHealth] fetchMetrics: Failed to load HealthKit module');
        return null;
      }

      const { default: Healthkit, HKQuantityTypeIdentifier } = HealthKit;

      console.log('[AppleHealth] fetchMetrics: Starting to fetch metrics...');

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const now = new Date();

      // Fetch Activity Summary FIRST - this is the official Apple data that matches the Watch
      console.log('[AppleHealth] fetchMetrics: Fetching activity summary...');
      const activitySummary = await withTimeout(
        this.getActivitySummary(today),
        TIMEOUT_MS,
        null,
        true
      );
      console.log('[AppleHealth] fetchMetrics: Activity summary result:', activitySummary ? 'found' : 'not found');

      // Fetch additional metrics in parallel with timeouts
      console.log('[AppleHealth] fetchMetrics: Fetching additional metrics...');
      const [
        steps,
        distance,
        floorsClimbed,
        heartRate,
        workouts,
      ] = await Promise.all([
        withTimeout(this.getStepCount(today, now), TIMEOUT_MS, 0, true),
        withTimeout(this.getDistance(today, now), TIMEOUT_MS, 0, true),
        withTimeout(this.getFloorsClimbed(today, now), TIMEOUT_MS, 0, true),
        withTimeout(this.getHeartRate(today, now), TIMEOUT_MS, 0, true),
        withTimeout(this.getWorkouts(today, now), TIMEOUT_MS, [], true),
      ]);
      console.log('[AppleHealth] fetchMetrics: Additional metrics fetched:', { steps, distance, floorsClimbed, heartRate, workoutsCount: workouts?.length || 0 });

      // Use Activity Summary values when available
      let activeCalories = 0;
      let exerciseMinutes = 0;
      let standHours = 0;

      if (activitySummary) {
        activeCalories = activitySummary.activeEnergyBurned || 0;
        exerciseMinutes = activitySummary.appleExerciseTime || 0;
        standHours = activitySummary.appleStandHours || 0;
      } else {
        // Fallback to individual queries if no Activity Summary
        console.log('[AppleHealth] fetchMetrics: Activity summary not available, using fallback queries...');
        const [fallbackCalories, fallbackExercise, fallbackStand] = await Promise.all([
          withTimeout(this.getActiveEnergyBurned(today, now), TIMEOUT_MS, 0, true),
          withTimeout(this.getExerciseTime(today, now), TIMEOUT_MS, 0, true),
          withTimeout(this.getStandTime(today, now), TIMEOUT_MS, 0, true),
        ]);
        console.log('[AppleHealth] fetchMetrics: Fallback values:', { fallbackCalories, fallbackExercise, fallbackStand });
        activeCalories = fallbackCalories;
        exerciseMinutes = fallbackExercise;
        standHours = fallbackStand;
      }
      
      console.log('[AppleHealth] fetchMetrics: Final metrics:', { activeCalories, exerciseMinutes, standHours, steps });

      // Extract goals from Activity Summary if available
      const goals = activitySummary ? {
        moveCalories: activitySummary.activeEnergyBurnedGoal || 0,
        exerciseMinutes: activitySummary.appleExerciseTimeGoal || 0,
        standHours: activitySummary.appleStandHoursGoal || 0,
      } : undefined;

      const metrics = {
        activeCalories,
        exerciseMinutes,
        standHours,
        steps: steps || 0,
        distanceMeters: distance || 0,
        floorsClimbed: floorsClimbed || 0,
        heartRateAvg: heartRate || 0,
        heartRateResting: 0,
        heartRateMax: 0,
        workoutsCompleted: workouts?.length || 0,
        lastUpdated: new Date().toISOString(),
        provider: 'apple_health',
        goals,
      };
      
      console.log('[AppleHealth] fetchMetrics: Returning metrics:', JSON.stringify(metrics, null, 2));
      return metrics;
    } catch (error) {
      console.error('[AppleHealth] Error fetching metrics:', error);
      return null;
    }
  }

  private async getActivitySummary(date: Date): Promise<any | null> {
    try {
      const HealthKit = await loadHealthKitModule();
      if (!HealthKit) return null;

      const { default: Healthkit } = HealthKit;

      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      // Query last 7 days to ensure we get data
      const weekAgo = new Date(startOfDay);
      weekAgo.setDate(weekAgo.getDate() - 7);

      console.log('[AppleHealth] getActivitySummary: Querying from', weekAgo.toISOString(), 'to', startOfDay.toISOString());

      const summaries = await Healthkit.queryActivitySummary({
        from: weekAgo,
        to: new Date(), // End of today
      });

      if (!summaries || summaries.length === 0) {
        console.log('[AppleHealth] getActivitySummary: No results returned');
        return null;
      }

      console.log('[AppleHealth] getActivitySummary: Received results:', summaries.length);

      // Find the summary for the specific date
      const targetYear = date.getFullYear();
      const targetMonth = date.getMonth() + 1;
      const targetDay = date.getDate();

      let matchingSummary = null;
      for (const summary of summaries) {
        // The summary has dateComponents or we need to parse the date
        const summaryDate = new Date(summary.startDate || summary.date);
        if (
          summaryDate.getFullYear() === targetYear &&
          summaryDate.getMonth() + 1 === targetMonth &&
          summaryDate.getDate() === targetDay
        ) {
          matchingSummary = summary;
          break;
        }
      }

      // If no matching summary found, use the last result
      if (!matchingSummary && summaries.length > 0) {
        matchingSummary = summaries[summaries.length - 1];
      }

      if (matchingSummary) {
        return {
          activeEnergyBurned: matchingSummary.activeEnergyBurned || 0,
          appleExerciseTime: matchingSummary.appleExerciseTime || 0,
          appleStandHours: matchingSummary.appleStandHours || 0,
          activeEnergyBurnedGoal: matchingSummary.activeEnergyBurnedGoal || 0,
          appleExerciseTimeGoal: matchingSummary.appleExerciseTimeGoal || 0,
          appleStandHoursGoal: matchingSummary.appleStandHoursGoal || 0,
        };
      }

      return null;
    } catch (error) {
      console.error('[AppleHealth] getActivitySummary error:', error);
      return null;
    }
  }

  async fetchWorkouts(startDate: Date, endDate: Date): Promise<WorkoutSession[]> {
    return this.getWorkouts(startDate, endDate);
  }

  async fetchWeight(): Promise<{ value: number; date: string } | null> {
    if (!this.isAvailable() || !this.isInitialized) {
      return null;
    }

    try {
      const HealthKit = await loadHealthKitModule();
      if (!HealthKit) return null;

      const { default: Healthkit, HKQuantityTypeIdentifier } = HealthKit;

      const samples = await Healthkit.queryQuantitySamples(HKQuantityTypeIdentifier.bodyMass, {
        from: new Date(0),
        to: new Date(),
        limit: 1,
        ascending: false, // Most recent first
      });

      if (samples && samples.length > 0) {
        const latest = samples[0];
        // Convert kg to pounds (the library returns kg by default)
        const weightInPounds = (latest.quantity || 0) * 2.20462;
        return {
          value: weightInPounds,
          date: latest.startDate?.toISOString() || new Date().toISOString(),
        };
      }
      return null;
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
      const HealthKit = await loadHealthKitModule();
      if (!HealthKit) return [];

      const { default: Healthkit, HKQuantityTypeIdentifier } = HealthKit;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const samples = await Healthkit.queryQuantitySamples(HKQuantityTypeIdentifier.bodyMass, {
        from: startDate,
        to: new Date(),
      });

      return (samples || []).map((sample) => ({
        date: sample.startDate?.toISOString() || new Date().toISOString(),
        weight: (sample.quantity || 0) * 2.20462, // Convert kg to pounds
      }));
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
      const HealthKit = await loadHealthKitModule();
      if (!HealthKit) return null;

      const { default: Healthkit, HKQuantityTypeIdentifier } = HealthKit;

      const samples = await Healthkit.queryQuantitySamples(HKQuantityTypeIdentifier.bodyMassIndex, {
        from: new Date(0),
        to: new Date(),
        limit: 1,
        ascending: false,
      });

      if (samples && samples.length > 0) {
        const latest = samples[0];
        return {
          value: latest.quantity || 0,
          date: latest.startDate?.toISOString() || new Date().toISOString(),
        };
      }
      return null;
    } catch (error) {
      console.error('[AppleHealth] Error fetching BMI:', error);
      return null;
    }
  }

  // Helper methods for fetching specific metrics
  private async getActiveEnergyBurned(startDate: Date, endDate: Date): Promise<number> {
    try {
      const HealthKit = await loadHealthKitModule();
      if (!HealthKit) return 0;

      const { default: Healthkit, HKQuantityTypeIdentifier } = HealthKit;

      const samples = await Healthkit.queryQuantitySamples(HKQuantityTypeIdentifier.activeEnergyBurned, {
        from: startDate,
        to: endDate,
      });

      if (!samples || samples.length === 0) return 0;
      
      const total = samples.reduce((sum, sample) => sum + (sample.quantity || 0), 0);
      return total; // Already in kcal
    } catch (error) {
      console.error('[AppleHealth] getActiveEnergyBurned: Error:', error);
      return 0;
    }
  }

  private async getExerciseTime(startDate: Date, endDate: Date): Promise<number> {
    try {
      const HealthKit = await loadHealthKitModule();
      if (!HealthKit) return 0;

      const { default: Healthkit, HKQuantityTypeIdentifier } = HealthKit;

      const samples = await Healthkit.queryQuantitySamples(HKQuantityTypeIdentifier.appleExerciseTime, {
        from: startDate,
        to: endDate,
      });

      if (!samples || samples.length === 0) return 0;
      
      const total = samples.reduce((sum, sample) => sum + (sample.quantity || 0), 0);
      return Math.round(total); // Already in minutes
    } catch (error) {
      console.error('[AppleHealth] getExerciseTime: Error:', error);
      return 0;
    }
  }

  private async getStandTime(startDate: Date, endDate: Date): Promise<number> {
    try {
      const HealthKit = await loadHealthKitModule();
      if (!HealthKit) return 0;

      const { default: Healthkit, HKQuantityTypeIdentifier } = HealthKit;

      const samples = await Healthkit.queryQuantitySamples(HKQuantityTypeIdentifier.appleStandTime, {
        from: startDate,
        to: endDate,
      });

      if (!samples || samples.length === 0) return 0;
      
      // Count unique hours with stand data
      const standHours = new Set(
        samples.map((sample) => new Date(sample.startDate || new Date()).getHours())
      ).size;
      return standHours;
    } catch (error) {
      console.error('[AppleHealth] getStandTime: Error:', error);
      return 0;
    }
  }

  private async getStepCount(startDate: Date, endDate: Date): Promise<number> {
    try {
      const HealthKit = await loadHealthKitModule();
      if (!HealthKit) return 0;

      const { default: Healthkit, HKQuantityTypeIdentifier } = HealthKit;

      const samples = await Healthkit.queryQuantitySamples(HKQuantityTypeIdentifier.stepCount, {
        from: startDate,
        to: endDate,
      });

      if (!samples || samples.length === 0) return 0;
      
      const total = samples.reduce((sum, sample) => sum + (sample.quantity || 0), 0);
      return Math.round(total);
    } catch (error) {
      console.error('[AppleHealth] getStepCount: Error:', error);
      return 0;
    }
  }

  private async getDistance(startDate: Date, endDate: Date): Promise<number> {
    try {
      const HealthKit = await loadHealthKitModule();
      if (!HealthKit) return 0;

      const { default: Healthkit, HKQuantityTypeIdentifier } = HealthKit;

      const samples = await Healthkit.queryQuantitySamples(HKQuantityTypeIdentifier.distanceWalkingRunning, {
        from: startDate,
        to: endDate,
      });

      if (!samples || samples.length === 0) return 0;
      
      const total = samples.reduce((sum, sample) => sum + (sample.quantity || 0), 0);
      return Math.round(total * 1000); // Convert km to meters
    } catch (error) {
      console.error('[AppleHealth] getDistance: Error:', error);
      return 0;
    }
  }

  private async getFloorsClimbed(startDate: Date, endDate: Date): Promise<number> {
    try {
      const HealthKit = await loadHealthKitModule();
      if (!HealthKit) return 0;

      const { default: Healthkit, HKQuantityTypeIdentifier } = HealthKit;

      const samples = await Healthkit.queryQuantitySamples(HKQuantityTypeIdentifier.flightsClimbed, {
        from: startDate,
        to: endDate,
      });

      if (!samples || samples.length === 0) return 0;
      
      const total = samples.reduce((sum, sample) => sum + (sample.quantity || 0), 0);
      return Math.round(total);
    } catch (error) {
      console.error('[AppleHealth] getFloorsClimbed: Error:', error);
      return 0;
    }
  }

  private async getHeartRate(startDate: Date, endDate: Date): Promise<number> {
    try {
      const HealthKit = await loadHealthKitModule();
      if (!HealthKit) return 0;

      const { default: Healthkit, HKQuantityTypeIdentifier } = HealthKit;

      const samples = await Healthkit.queryQuantitySamples(HKQuantityTypeIdentifier.heartRate, {
        from: startDate,
        to: endDate,
      });

      if (!samples || samples.length === 0) return 0;
      
      const avg = samples.reduce((sum, sample) => sum + (sample.quantity || 0), 0) / samples.length;
      return Math.round(avg);
    } catch (error) {
      console.error('[AppleHealth] getHeartRate: Error:', error);
      return 0;
    }
  }

  private async getWorkouts(startDate: Date, endDate: Date): Promise<WorkoutSession[]> {
    try {
      const HealthKit = await loadHealthKitModule();
      if (!HealthKit) return [];

      const { default: Healthkit, HKWorkoutActivityType } = HealthKit;

      const workouts = await Healthkit.queryWorkoutSamples({
        from: startDate,
        to: endDate,
      });

      if (!workouts || workouts.length === 0) return [];

      const workoutTypeMap: Record<number, WorkoutType> = {
        [HKWorkoutActivityType.running]: 'running',
        [HKWorkoutActivityType.walking]: 'walking',
        [HKWorkoutActivityType.cycling]: 'cycling',
        [HKWorkoutActivityType.swimming]: 'swimming',
        [HKWorkoutActivityType.traditionalStrengthTraining]: 'strength',
        [HKWorkoutActivityType.highIntensityIntervalTraining]: 'hiit',
        [HKWorkoutActivityType.yoga]: 'yoga',
      };

      return workouts.map((workout) => {
        const duration = workout.duration
          ? Math.round(workout.duration / 60) // Convert seconds to minutes
          : 0;

        const workoutStartDate = workout.startDate?.toISOString() || new Date().toISOString();
        const workoutEndDate = workout.endDate?.toISOString() || new Date().toISOString();

        return {
          id: workout.uuid || `${workoutStartDate}-${workoutEndDate}`,
          type: workoutTypeMap[workout.workoutActivityType] || 'other',
          startTime: workoutStartDate,
          endTime: workoutEndDate,
          duration,
          calories: workout.totalEnergyBurned || 0,
          distance: workout.totalDistance ? Math.round(workout.totalDistance * 1000) : undefined, // km to meters
          provider: 'apple_health',
          sourceName: workout.sourceRevision?.source?.name,
          sourceId: workout.sourceRevision?.source?.bundleIdentifier,
        };
      });
    } catch (error) {
      console.error('[AppleHealth] getWorkouts: Error:', error);
      return [];
    }
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

const getAdapter = (providerId: HealthProviderType): HealthProviderAdapter => {
  switch (providerId) {
    case 'apple_health':
      return AppleHealthAdapter.getInstance();
    // OAuth providers use MockHealthAdapter as placeholder
    // Actual data comes from server-side sync via Edge Functions
    case 'fitbit':
    case 'garmin':
    case 'whoop':
    case 'oura':
    case 'strava':
      return new MockHealthAdapter(providerId);
    default:
      return new MockHealthAdapter(providerId);
  }
};

// ============================================
// Health Store (Zustand)
// ============================================

interface HealthState {
  providers: HealthProvider[];
  activeProvider: HealthProviderType | null;
  currentMetrics: HealthMetrics | null;
  goals: HealthGoals;
  weight: { value: number; date: string } | null;
  bmi: { value: number; date: string } | null;
  weightHistory: { date: string; weight: number }[];
  weightGoal: number | null;
  weightGoalsByUser: Record<string, number>;
  activityStreak: number;
  personalRecords: {
    maxDailyCalories: number;
    maxDailySteps: number;
    maxWeeklyWorkouts: number;
  };
  isConnecting: boolean;
  isSyncing: boolean;
  lastSyncError: string | null;

  // Actions
  connectProvider: (providerId: HealthProviderType) => Promise<boolean>;
  disconnectProvider: (providerId: HealthProviderType) => Promise<void>;
  setProviderConnected: (providerId: string, connected: boolean) => void;
  syncHealthData: (userId?: string, options?: { showSpinner?: boolean }) => Promise<void>;
  restoreProviderConnection: () => Promise<void>;
  updateGoals: (goals: HealthGoals, userId?: string) => Promise<void>;
  loadGoals: (userId: string) => Promise<void>;
  syncWeight: () => Promise<void>;
  setWeightGoal: (goal: number | null, userId?: string) => Promise<void>;
  loadWeightGoal: (userId: string) => Promise<void>;
  getWeightGoal: (userId?: string) => number | null;
  logWeight: (weightValue: number) => void;
  calculateStreak: () => Promise<void>;
  getConnectedProviders: () => HealthProvider[];
  getWorkoutCount: (startDate: Date, endDate: Date) => Promise<number>;
}

export const useHealthStore = create<HealthState>()(
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
      weight: null,
      bmi: null,
      weightHistory: [],
      weightGoal: null,
      weightGoalsByUser: {},
      activityStreak: 0,
      personalRecords: {
        maxDailyCalories: 0,
        maxDailySteps: 0,
        maxWeeklyWorkouts: 0,
      },
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

          // Allow UI to update before starting HealthKit operations
          await new Promise((resolve) => setTimeout(resolve, 50));

          const hasPermissions = await withTimeout(
            adapter.requestPermissions(),
            15000,
            false
          );
          if (!hasPermissions) {
            // For HealthKit, permissions are requested during connect
          }

          const connected = await withTimeout(
            adapter.connect(),
            15000,
            false
          );

          if (connected) {
            // Clear connecting state immediately
            set((state) => ({
              providers: state.providers.map((p) =>
                p.id === providerId
                  ? { ...p, connected: true, lastSync: new Date().toISOString() }
                  : p
              ),
              activeProvider: providerId as HealthProviderType,
              isConnecting: false,
              isSyncing: false,
            }));

            // Fetch initial data in the background
            InteractionManager.runAfterInteractions(() => {
              setTimeout(async () => {
                try {
                  await get().syncHealthData(undefined, { showSpinner: false });
                  await get().syncWeight();
                } catch (e) {
                  console.error('[HealthStore] Background sync after connect failed:', e);
                  set({ isSyncing: false });
                }
              }, 1000);
            });

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
          activeProvider: connected && !state.activeProvider ? (providerId as HealthProviderType) : state.activeProvider,
        }));

        // Persist to AsyncStorage
        const currentState = get();
        AsyncStorage.setItem('health-storage', JSON.stringify(currentState)).catch((e) => {
          console.error('[Health] Failed to persist state:', e);
        });
      },

      restoreProviderConnection: async () => {
        const { activeProvider } = get();

        if (!activeProvider) {
          return;
        }

        InteractionManager.runAfterInteractions(() => {
          setTimeout(async () => {
            try {
              const currentActiveProvider = get().activeProvider;
              if (!currentActiveProvider) return;

              const adapter = getAdapter(currentActiveProvider);

              if (!adapter.isAvailable()) {
                set((state) => ({
                  activeProvider: null,
                  providers: state.providers.map((p) =>
                    p.id === currentActiveProvider ? { ...p, connected: false, lastSync: undefined } : p
                  ),
                }));
                return;
              }

              const connected = await withTimeout(
                adapter.connect(),
                15000,
                false
              );

              if (connected) {
                console.log('[HealthStore] restoreProviderConnection: Provider connected successfully');
                set((state) => ({
                  providers: state.providers.map((p) =>
                    p.id === currentActiveProvider
                      ? { ...p, connected: true, lastSync: new Date().toISOString() }
                      : p
                  ),
                }));

                console.log('[HealthStore] restoreProviderConnection: Waiting 1 second before sync...');
                await new Promise((resolve) => setTimeout(resolve, 1000));
                try {
                  console.log('[HealthStore] restoreProviderConnection: Starting sync...');
                  await get().syncHealthData(undefined, { showSpinner: false });
                  await get().syncWeight();
                  await get().calculateStreak();
                  console.log('[HealthStore] restoreProviderConnection: Sync completed successfully');
                } catch (e) {
                  console.error('[HealthStore] Background sync after restore failed:', e);
                }
              } else {
                set((state) => ({
                  activeProvider: null,
                  providers: state.providers.map((p) =>
                    p.id === currentActiveProvider ? { ...p, connected: false, lastSync: undefined } : p
                  ),
                }));
              }
            } catch (error) {
              console.error('Failed to restore provider connection:', error);
              const currentActiveProvider = get().activeProvider;
              if (currentActiveProvider) {
                set((state) => ({
                  activeProvider: null,
                  providers: state.providers.map((p) =>
                    p.id === currentActiveProvider ? { ...p, connected: false, lastSync: undefined } : p
                  ),
                }));
              }
            }
          }, 500);
        });
      },

      syncHealthData: async (userId?: string, options?: { showSpinner?: boolean }) => {
        const { activeProvider } = get();
        if (!activeProvider) {
          console.log('[HealthStore] syncHealthData: No active provider, skipping sync');
          return;
        }

        console.log('[HealthStore] syncHealthData: Starting sync for provider:', activeProvider);
        const showSpinner = options?.showSpinner ?? true;

        let effectiveUserId = userId;
        if (!effectiveUserId) {
          try {
            effectiveUserId = useAuthStore.getState().user?.id;
          } catch (e) {
            // Auth store not available
          }
        }

        if (showSpinner) {
          set({ isSyncing: true, lastSyncError: null });
        }

        await new Promise((resolve) => setTimeout(resolve, 50));

        try {
          const adapter = getAdapter(activeProvider);
          const metrics = await adapter.fetchMetrics();

          if (metrics) {
            console.log('[HealthStore] syncHealthData: Received metrics from adapter:', {
              activeCalories: metrics.activeCalories,
              exerciseMinutes: metrics.exerciseMinutes,
              standHours: metrics.standHours,
              steps: metrics.steps,
            });
            
            const newGoals = metrics.goals ? {
              moveCalories: metrics.goals.moveCalories,
              exerciseMinutes: metrics.goals.exerciseMinutes,
              standHours: metrics.goals.standHours,
              steps: get().goals.steps,
            } : get().goals;

            set((state) => {
              console.log('[HealthStore] syncHealthData: Updating store with metrics');
              return {
                currentMetrics: metrics,
                goals: newGoals,
                providers: state.providers.map((p) =>
                  p.id === activeProvider ? { ...p, lastSync: new Date().toISOString() } : p
                ),
                ...(showSpinner ? { isSyncing: false } : {}),
              };
            });

            if (effectiveUserId && metrics.goals) {
              await get().updateGoals(newGoals, effectiveUserId);
            }

            // Sync to Supabase Edge Functions
            if (effectiveUserId && isSupabaseConfigured() && supabase) {
              const today = new Date();
              const todayStr = today.toISOString().split('T')[0];
              
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

              let { data: sessionData, error: sessionError } = await supabase.auth.getSession();
              
              if (sessionError || !sessionData.session) {
                return;
              }
              
              let refreshData = sessionData;
              if (sessionData.session?.refresh_token) {
                const refreshResult = await supabase.auth.refreshSession();
                
                const isInvalidRefreshToken = refreshResult.error?.message?.includes('Invalid Refresh Token') || 
                                            refreshResult.error?.message?.includes('Refresh Token Not Found') ||
                                            refreshResult.error?.message?.includes('refresh_token_not_found');
                
                if (isInvalidRefreshToken) {
                  console.warn('[HealthStore] Invalid refresh token, using original session');
                } else if (refreshResult.error || !refreshResult.data?.session) {
                  if (!sessionData.session?.access_token) {
                    return;
                  }
                } else {
                  refreshData = refreshResult.data;
                }
              }
              
              sessionData = refreshData;
              
              if (!sessionData.session?.access_token) {
                return;
              }
              
              if (activeProvider === 'apple_health') {
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
                        distanceMeters: Math.round((metrics.distanceMeters || 0) * 100) / 100,
                        workoutsCompleted,
                      },
                      headers: {
                        Authorization: `Bearer ${sessionData.session.access_token}`,
                      },
                    }
                  );

                  if (functionError) {
                    // Silently handle
                  }
                } catch (e) {
                  // Silently handle
                }
              } else {
                try {
                  const { data, error: functionError } = await supabase.functions.invoke(
                    'sync-provider-data',
                    {
                      body: {
                        provider: activeProvider,
                        date: todayStr,
                      },
                      headers: {
                        Authorization: `Bearer ${sessionData.session.access_token}`,
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

            // Sync weight and BMI
            try {
              await get().syncWeight();
            } catch (e) {
              console.error('[HealthStore] Failed to sync weight/BMI:', e);
            }

            // Check for rings closed
            if (effectiveUserId && metrics) {
              const goals = get().goals;
              const moveProgress = metrics.activeCalories / goals.moveCalories;
              const exerciseProgress = metrics.exerciseMinutes / goals.exerciseMinutes;
              const standProgress = metrics.standHours / goals.standHours;
              
              if (moveProgress >= 1 && exerciseProgress >= 1 && standProgress >= 1) {
                try {
                  const todayStart = new Date();
                  todayStart.setHours(0, 0, 0, 0);
                  
                  const { data: existingActivity } = await supabase
                    .from('activity_feed')
                    .select('id')
                    .eq('user_id', effectiveUserId)
                    .eq('activity_type', 'rings_closed')
                    .gte('created_at', todayStart.toISOString())
                    .limit(1);
                  
                  if (!existingActivity || existingActivity.length === 0) {
                    await supabase.functions.invoke('create-activity', {
                      body: {
                        userId: effectiveUserId,
                        activityType: 'rings_closed',
                        metadata: {
                          moveCalories: Math.round(metrics.activeCalories),
                          exerciseMinutes: Math.round(metrics.exerciseMinutes),
                          standHours: Math.round(metrics.standHours),
                        },
                      },
                    });
                    console.log('[HealthStore] Created rings_closed activity');
                  }
                } catch (e) {
                  console.error('[HealthStore] Failed to create rings_closed activity:', e);
                }
              }
            }

            // Update achievements
            if (effectiveUserId && metrics) {
              try {
                const { data: sessionData } = await supabase.auth.getSession();
                if (sessionData?.session?.access_token) {
                  const { data, error } = await supabase.functions.invoke('update-achievements', {
                    body: {
                      userId: effectiveUserId,
                      eventType: 'activity_logged',
                      eventData: {
                        calories: metrics.activeCalories,
                        steps: metrics.steps,
                        exerciseMinutes: metrics.exerciseMinutes,
                        standHours: metrics.standHours,
                      },
                    },
                    headers: {
                      Authorization: `Bearer ${sessionData.session.access_token}`,
                    },
                  });
                  
                  if (error) {
                    console.error('[HealthStore] Achievement update error:', error);
                  } else if (data?.newUnlocks && data.newUnlocks.length > 0) {
                    console.log('[HealthStore] Achievement unlocks:', data.newUnlocks);
                  }
                }
              } catch (e) {
                console.error('[HealthStore] Failed to update achievements:', e);
              }
            }

            // Check for personal records
            if (effectiveUserId && metrics) {
              const { personalRecords } = get();
              let newRecords = { ...personalRecords };
              let recordsUpdated = false;

              if (metrics.activeCalories > personalRecords.maxDailyCalories) {
                newRecords.maxDailyCalories = metrics.activeCalories;
                recordsUpdated = true;
                
                if (personalRecords.maxDailyCalories > 0) {
                  try {
                    await supabase.functions.invoke('create-activity', {
                      body: {
                        userId: effectiveUserId,
                        activityType: 'personal_record',
                        metadata: {
                          metric: 'calories',
                          value: Math.round(metrics.activeCalories),
                          previousRecord: Math.round(personalRecords.maxDailyCalories),
                        },
                      },
                    });
                    console.log('[HealthStore] Created personal_record activity for calories:', metrics.activeCalories);
                  } catch (e) {
                    console.error('[HealthStore] Failed to create calorie record activity:', e);
                  }
                }
              }

              if (metrics.steps > personalRecords.maxDailySteps) {
                newRecords.maxDailySteps = metrics.steps;
                recordsUpdated = true;
                
                if (personalRecords.maxDailySteps > 0) {
                  try {
                    await supabase.functions.invoke('create-activity', {
                      body: {
                        userId: effectiveUserId,
                        activityType: 'personal_record',
                        metadata: {
                          metric: 'steps',
                          value: Math.round(metrics.steps),
                          previousRecord: Math.round(personalRecords.maxDailySteps),
                        },
                      },
                    });
                    console.log('[HealthStore] Created personal_record activity for steps:', metrics.steps);
                  } catch (e) {
                    console.error('[HealthStore] Failed to create steps record activity:', e);
                  }
                }
              }

              if (recordsUpdated) {
                set({ personalRecords: newRecords });
              }
            }
          }
        } catch (error) {
          console.error('[HealthStore] Sync error:', error);
          set({
            isSyncing: false,
            lastSyncError: error instanceof Error ? error.message : 'Sync failed',
          });
        }
      },

      updateGoals: async (goals: HealthGoals, userId?: string) => {
        set({ goals });

        if (userId && isSupabaseConfigured() && supabase) {
          try {
            const { error } = await supabase
              .from('user_profiles')
              .update({
                move_goal: goals.moveCalories,
                exercise_goal: goals.exerciseMinutes,
                stand_goal: goals.standHours,
                steps_goal: goals.steps,
              })
              .eq('id', userId);

            if (error) {
              console.error('[HealthStore] Failed to save goals to Supabase:', error);
            }
          } catch (e) {
            console.error('[HealthStore] Exception saving goals:', e);
          }
        }
      },

      loadGoals: async (userId: string) => {
        if (!isSupabaseConfigured() || !supabase) return;

        try {
          const { data, error } = await supabase
            .from('user_profiles')
            .select('move_goal, exercise_goal, stand_goal, steps_goal')
            .eq('id', userId)
            .single();

          if (error) {
            console.error('[HealthStore] Error loading goals:', error);
            return;
          }

          if (data) {
            set({
              goals: {
                moveCalories: data.move_goal || 500,
                exerciseMinutes: data.exercise_goal || 30,
                standHours: data.stand_goal || 12,
                steps: data.steps_goal || 10000,
              },
            });
          }
        } catch (e) {
          console.error('[HealthStore] Exception loading goals:', e);
        }
      },

      syncWeight: async () => {
        const { activeProvider } = get();
        if (!activeProvider) return;

        try {
          const adapter = getAdapter(activeProvider);
          const [weight, bmi, weightHistory] = await Promise.all([
            adapter.fetchWeight(),
            adapter.fetchBMI(),
            adapter.fetchWeightHistory(30),
          ]);

          set({
            weight,
            bmi,
            weightHistory: weightHistory.length > 0 ? weightHistory : get().weightHistory,
          });
        } catch (error) {
          console.error('[HealthStore] Error syncing weight:', error);
        }
      },

      setWeightGoal: async (goal: number | null, userId?: string) => {
        set({ weightGoal: goal });

        if (userId) {
          set((state) => {
            const newWeightGoalsByUser = { ...state.weightGoalsByUser };
            if (goal !== null) {
              newWeightGoalsByUser[userId] = goal;
            } else {
              delete newWeightGoalsByUser[userId];
            }
            return { weightGoalsByUser: newWeightGoalsByUser };
          });
        }

        if (userId && isSupabaseConfigured() && supabase) {
          try {
            const { error } = await supabase
              .from('user_profiles')
              .update({ target_weight: goal })
              .eq('id', userId);

            if (error) {
              console.error('[HealthStore] Error saving weight goal:', error);
            }
          } catch (e) {
            console.error('[HealthStore] Exception saving weight goal:', e);
          }
        }
      },

      loadWeightGoal: async (userId: string) => {
        if (!isSupabaseConfigured() || !supabase) return;

        try {
          const { data, error } = await supabase
            .from('user_profiles')
            .select('target_weight')
            .eq('id', userId)
            .single();

          if (error && error.code !== 'PGRST116') {
            console.error('[HealthStore] Error loading weight goal:', error);
            return;
          }

          if (data?.target_weight) {
            const goal = data.target_weight;
            console.log('[HealthStore] Loaded weight goal:', goal);
            
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
          console.error('[HealthStore] Exception loading weight goal:', error);
        }
      },

      getWeightGoal: (userId?: string) => {
        if (userId) {
          return get().weightGoalsByUser[userId] ?? get().weightGoal;
        }
        return get().weightGoal;
      },

      logWeight: (weightValue: number) => {
        const { weightHistory } = get();
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        
        let newHistory = [...weightHistory];
        
        const existingIndex = newHistory.findIndex(
          (entry) => entry.date.split('T')[0] === today
        );
        
        const newEntry = { date: now.toISOString(), weight: weightValue };
        
        if (existingIndex >= 0) {
          newHistory[existingIndex] = newEntry;
        } else {
          newHistory.push(newEntry);
        }
        
        newHistory = newHistory
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(-30);
        
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
          
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - 60);
          
          const workouts = await adapter.fetchWorkouts(startDate, endDate);
          
          if (workouts.length === 0) {
            set({ activityStreak: 0 });
            return;
          }

          const workoutDates = new Set(
            workouts.map(w => new Date(w.startTime).toDateString())
          );

          let streak = 0;
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          for (let i = 0; i < 60; i++) {
            const checkDate = new Date(today);
            checkDate.setDate(checkDate.getDate() - i);
            
            if (workoutDates.has(checkDate.toDateString())) {
              streak++;
            } else if (i === 0) {
              continue;
            } else {
              break;
            }
          }

          const previousStreak = get().activityStreak;
          const milestones = [7, 30, 100, 365];

          set({ activityStreak: streak });

          if (streak > previousStreak && milestones.includes(streak)) {
            try {
              const userId = useAuthStore.getState().user?.id;
              if (userId && isSupabaseConfigured() && supabase) {
                const { data: existingActivity } = await supabase
                  .from('activity_feed')
                  .select('id')
                  .eq('user_id', userId)
                  .eq('activity_type', 'streak_milestone')
                  .eq('metadata->>streakDays', streak.toString())
                  .limit(1);
                
                if (!existingActivity || existingActivity.length === 0) {
                  await supabase.functions.invoke('create-activity', {
                    body: {
                      userId,
                      activityType: 'streak_milestone',
                      metadata: { streakDays: streak },
                    },
                  });
                  console.log('[HealthStore] Created streak_milestone activity for', streak, 'days');
                }
              }
            } catch (e) {
              console.error('[HealthStore] Failed to create streak_milestone activity:', e);
            }
          }
        } catch (error) {
          console.error('Failed to calculate streak:', error);
          set({ activityStreak: 0 });
        }
      },

      getConnectedProviders: () => {
        return get().providers.filter((p) => p.connected);
      },

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
        personalRecords: state.personalRecords,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<typeof currentState>;
        const mergedProviders = HEALTH_PROVIDERS.map((freshProvider) => {
          const persistedProvider = persisted.providers?.find((p) => p.id === freshProvider.id);
          if (persistedProvider) {
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