import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, InteractionManager, NativeModules } from 'react-native';
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

// Native module for querying Apple Health Activity Summary (goals)
const { ActivitySummaryModule } = NativeModules;

interface ActivityGoalsResult {
  moveGoal: number;
  exerciseGoal: number;
  standGoal: number;
  moveCalories?: number;
  exerciseMinutes?: number;
  standHours?: number;
  hasData: boolean;
}

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

      console.log('[AppleHealth] Module loaded, available exports:', Object.keys(HealthKit));

      // The library exports functions directly in v13.x
      const {
        requestAuthorization,
        isHealthDataAvailable,
      } = HealthKit;

      console.log('[AppleHealth] requestAuthorization type:', typeof requestAuthorization);
      console.log('[AppleHealth] isHealthDataAvailable type:', typeof isHealthDataAvailable);

      // Check if HealthKit is available on this device
      if (typeof isHealthDataAvailable === 'function') {
        const available = await isHealthDataAvailable();
        console.log('[AppleHealth] isHealthDataAvailable result:', available);
        if (!available) {
          console.error('[AppleHealth] HealthKit is not available on this device');
          return false;
        }
      } else {
        console.log('[AppleHealth] isHealthDataAvailable not a function, skipping check');
      }

      console.log('[AppleHealth] HealthKit available, requesting permissions...');

      // In v13.x, permissions are string literals typed as ObjectTypeIdentifier
      const readPermissions = [
        'HKQuantityTypeIdentifierActiveEnergyBurned',
        'HKQuantityTypeIdentifierAppleExerciseTime',
        'HKQuantityTypeIdentifierAppleStandTime',
        'HKQuantityTypeIdentifierStepCount',
        'HKQuantityTypeIdentifierDistanceWalkingRunning',
        'HKQuantityTypeIdentifierFlightsClimbed',
        'HKQuantityTypeIdentifierHeartRate',
        'HKQuantityTypeIdentifierRestingHeartRate',
        'HKQuantityTypeIdentifierBodyMass',
        'HKQuantityTypeIdentifierHeight',
        'HKQuantityTypeIdentifierBodyMassIndex',
        'HKActivitySummaryTypeIdentifier', // For Apple Watch activity rings/goals
      ] as const;

      console.log('[AppleHealth] Read permissions to request:', readPermissions);

      // Request authorization using v13.x API (object with toRead property)
      if (typeof requestAuthorization === 'function') {
        console.log('[AppleHealth] Calling requestAuthorization with toRead object...');
        await requestAuthorization({ toRead: readPermissions });
        console.log('[AppleHealth] requestAuthorization completed');
      } else {
        console.error('[AppleHealth] requestAuthorization is not a function');
        return false;
      }
      
      console.log('[AppleHealth] Permissions granted successfully');
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('[AppleHealth] Error requesting permissions:', error);
      console.error('[AppleHealth] Error message:', error instanceof Error ? error.message : String(error));
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

      const { queryQuantitySamples } = HealthKit;

      console.log('[AppleHealth] fetchMetrics: Starting to fetch metrics...');

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const now = new Date();

      // Fetch Activity Summary FIRST - this is the official Apple data that matches the Watch
      console.log('[AppleHealth] fetchMetrics: Fetching activity summary...');
      const activitySummary = await withTimeout(
        this.getActivitySummary(today, now),
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

      // Extract goals from Activity Summary if available and valid (non-zero)
      const hasValidGoals = activitySummary &&
        activitySummary.activeEnergyBurnedGoal > 0 &&
        activitySummary.appleExerciseTimeGoal > 0 &&
        activitySummary.appleStandHoursGoal > 0;

      console.log('[AppleHealth] fetchMetrics: Goals from activity summary:', {
        moveGoal: activitySummary?.activeEnergyBurnedGoal,
        exerciseGoal: activitySummary?.appleExerciseTimeGoal,
        standGoal: activitySummary?.appleStandHoursGoal,
        hasValidGoals,
      });

      const goals = hasValidGoals ? {
        moveCalories: activitySummary.activeEnergyBurnedGoal,
        exerciseMinutes: activitySummary.appleExerciseTimeGoal,
        standHours: activitySummary.appleStandHoursGoal,
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

  private async getActivitySummary(date: Date, endDate: Date): Promise<any | null> {
    try {
      // In v13.x, we need to query individual metrics instead of using queryActivitySummary
      // We'll aggregate the data from separate calls
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      console.log('[AppleHealth] getActivitySummary: Fetching individual metrics from', startOfDay.toISOString(), 'to', endDate.toISOString());
      console.log('[AppleHealth] getActivitySummary: Time range in local time - Start:', startOfDay.toLocaleString(), 'End:', endDate.toLocaleString());

      // Fetch the three main metrics - use endDate (now) instead of end of day
      const [activeEnergy, exerciseTime, standTime] = await Promise.all([
        this.getActiveEnergyBurned(startOfDay, endDate),
        this.getExerciseTime(startOfDay, endDate),
        this.getStandTime(startOfDay, endDate),
      ]);

      console.log('[AppleHealth] getActivitySummary: Raw values from HealthKit:', {
        activeEnergy,
        exerciseTime,
        standTime,
      });

      // Try to fetch goals from Apple Health via native module
      let moveGoal = 500;
      let exerciseGoal = 30;
      let standGoal = 12;

      console.log('[AppleHealth] getActivitySummary: Platform:', Platform.OS, 'ActivitySummaryModule available:', !!ActivitySummaryModule);

      if (Platform.OS === 'ios' && ActivitySummaryModule) {
        try {
          console.log('[AppleHealth] getActivitySummary: Fetching goals from native ActivitySummaryModule...');

          // Add timeout to prevent hanging if native module doesn't respond
          const timeoutMs = 10000; // 10 seconds
          const goalsResult: ActivityGoalsResult = await Promise.race([
            ActivitySummaryModule.getActivityGoals(),
            new Promise<ActivityGoalsResult>((_, reject) =>
              setTimeout(() => reject(new Error('Native module timeout after 10s')), timeoutMs)
            ),
          ]);

          console.log('[AppleHealth] getActivitySummary: Native module returned:', JSON.stringify(goalsResult));

          if (goalsResult.hasData) {
            // Use goals from Apple Health, but only if they're valid (non-zero)
            if (goalsResult.moveGoal > 0) moveGoal = goalsResult.moveGoal;
            if (goalsResult.exerciseGoal > 0) exerciseGoal = goalsResult.exerciseGoal;
            if (goalsResult.standGoal > 0) standGoal = goalsResult.standGoal;
            console.log('[AppleHealth] getActivitySummary: Using goals from Apple Health:', { moveGoal, exerciseGoal, standGoal });
          } else {
            console.log('[AppleHealth] getActivitySummary: No activity summary data from Apple Health (hasData=false). This usually means:');
            console.log('  - User doesn\'t have an Apple Watch, or');
            console.log('  - No activity has been recorded yet today, or');
            console.log('  - Goals haven\'t been set in the Health app');
            // Fall back to store goals if no Apple Health data
            const storeGoals = useHealthStore.getState().goals;
            moveGoal = storeGoals.moveCalories || 500;
            exerciseGoal = storeGoals.exerciseMinutes || 30;
            standGoal = storeGoals.standHours || 12;
          }
        } catch (nativeError) {
          console.error('[AppleHealth] getActivitySummary: Native module error:', nativeError);
          // Fall back to store goals on error
          const storeGoals = useHealthStore.getState().goals;
          moveGoal = storeGoals.moveCalories || 500;
          exerciseGoal = storeGoals.exerciseMinutes || 30;
          standGoal = storeGoals.standHours || 12;
        }
      } else {
        // Non-iOS or native module not available
        if (Platform.OS === 'ios') {
          console.warn('[AppleHealth] getActivitySummary: ActivitySummaryModule is NOT available! The app may need to be rebuilt with: cd ios && pod install && npx expo run:ios');
        }
        const storeGoals = useHealthStore.getState().goals;
        moveGoal = storeGoals.moveCalories || 500;
        exerciseGoal = storeGoals.exerciseMinutes || 30;
        standGoal = storeGoals.standHours || 12;
      }

      return {
        activeEnergyBurned: activeEnergy || 0,
        appleExerciseTime: exerciseTime || 0,
        appleStandHours: standTime || 0,
        activeEnergyBurnedGoal: moveGoal,
        appleExerciseTimeGoal: exerciseGoal,
        appleStandHoursGoal: standGoal,
      };
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

      const { queryQuantitySamples } = HealthKit;

      const samples = await queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', {
        filter: {
          date: {
            startDate: new Date(0),
            endDate: new Date(),
          },
        },
        limit: 1,
        ascending: false, // Most recent first
      });

      if (samples && samples.length > 0) {
        const latest = samples[0];
        const rawWeight = latest.quantity || 0;
        // HealthKit returns weight in the unit stored in the sample
        // If weight > 200, it's likely already in pounds (no conversion needed)
        // If weight <= 200, it's likely in kg and needs conversion to pounds
        const weightInPounds = rawWeight > 200 ? rawWeight : rawWeight * 2.20462;
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

      const { queryQuantitySamples } = HealthKit;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const samples = await queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', {
        filter: {
          date: {
            startDate: startDate,
            endDate: new Date(),
          },
        },
        limit: -1,
        ascending: false,
      });

      return (samples || []).map((sample) => {
        const rawWeight = sample.quantity || 0;
        // HealthKit returns weight in the unit stored in the sample
        // If weight > 200, it's likely already in pounds (no conversion needed)
        // If weight <= 200, it's likely in kg and needs conversion to pounds
        const weightInPounds = rawWeight > 200 ? rawWeight : rawWeight * 2.20462;
        return {
          date: sample.startDate?.toISOString() || new Date().toISOString(),
          weight: weightInPounds,
        };
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
      const HealthKit = await loadHealthKitModule();
      if (!HealthKit) return null;

      const { queryQuantitySamples } = HealthKit;

      const samples = await queryQuantitySamples('HKQuantityTypeIdentifierBodyMassIndex', {
        filter: {
          date: {
            startDate: new Date(0),
            endDate: new Date(),
          },
        },
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
      console.log('[AppleHealth] getActiveEnergyBurned: Querying from', startDate.toLocaleString(), 'to', endDate.toLocaleString());

      const HealthKit = await loadHealthKitModule();
      if (!HealthKit) return 0;

      const { queryQuantitySamples } = HealthKit;

      const samples = await queryQuantitySamples('HKQuantityTypeIdentifierActiveEnergyBurned', {
        filter: {
          date: {
            startDate: startDate,
            endDate: endDate,
          },
        },
        limit: -1, // Fetch all samples
        ascending: false,
      });

      console.log('[AppleHealth] getActiveEnergyBurned: Received', samples?.length || 0, 'samples');

      if (!samples || samples.length === 0) {
        console.log('[AppleHealth] getActiveEnergyBurned: No samples found, returning 0');
        return 0;
      }

      // Filter to only include samples from Apple Watch (the Move ring source)
      // The Move ring only counts calories burned through movement detected by Apple Watch,
      // not manually added workouts or third-party app data
      const appleWatchSamples = samples.filter(sample => {
        const sourceName = sample.sourceRevision?.source?.name || '';
        const sourceBundleId = sample.sourceRevision?.source?.bundleIdentifier || '';

        // Include only Apple Watch sources - exclude manually added data and third-party apps
        const isAppleWatch = sourceName.toLowerCase().includes('watch') ||
                            sourceBundleId.includes('com.apple.health.') ||
                            sourceName === 'iPhone';

        return isAppleWatch;
      });

      console.log('[AppleHealth] getActiveEnergyBurned: Filtered to', appleWatchSamples.length, 'Apple Watch samples from', samples.length, 'total');

      // Log source information for debugging
      if (samples.length > 0) {
        const uniqueSources = new Set(samples.map(s => s.sourceRevision?.source?.name || 'Unknown'));
        console.log('[AppleHealth] getActiveEnergyBurned: Data sources found:', Array.from(uniqueSources));

        console.log('[AppleHealth] getActiveEnergyBurned: First 3 samples (all sources):', samples.slice(0, 3).map(s => ({
          quantity: s.quantity,
          source: s.sourceRevision?.source?.name,
          bundleId: s.sourceRevision?.source?.bundleIdentifier,
        })));
      }

      const total = appleWatchSamples.reduce((sum, sample) => sum + (sample.quantity || 0), 0);
      console.log('[AppleHealth] getActiveEnergyBurned: Total Move ring calories (Apple Watch only):', total);
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

      const { queryQuantitySamples } = HealthKit;

      const samples = await queryQuantitySamples('HKQuantityTypeIdentifierAppleExerciseTime', {
        filter: {
          date: {
            startDate: startDate,
            endDate: endDate,
          },
        },
        limit: -1, // Fetch all samples
        ascending: false,
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

      const { queryQuantitySamples } = HealthKit;

      const samples = await queryQuantitySamples('HKQuantityTypeIdentifierAppleStandTime', {
        filter: {
          date: {
            startDate: startDate,
            endDate: endDate,
          },
        },
        limit: -1, // Fetch all samples
        ascending: false,
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

      const { queryQuantitySamples } = HealthKit;

      const samples = await queryQuantitySamples('HKQuantityTypeIdentifierStepCount', {
        filter: {
          date: {
            startDate: startDate,
            endDate: endDate,
          },
        },
        limit: -1, // Fetch all samples
        ascending: false,
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

      const { queryQuantitySamples } = HealthKit;

      const samples = await queryQuantitySamples('HKQuantityTypeIdentifierDistanceWalkingRunning', {
        filter: {
          date: {
            startDate: startDate,
            endDate: endDate,
          },
        },
        limit: -1, // Fetch all samples
        ascending: false,
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

      const { queryQuantitySamples } = HealthKit;

      const samples = await queryQuantitySamples('HKQuantityTypeIdentifierFlightsClimbed', {
        filter: {
          date: {
            startDate: startDate,
            endDate: endDate,
          },
        },
        limit: -1, // Fetch all samples
        ascending: false,
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

      const { queryQuantitySamples } = HealthKit;

      const samples = await queryQuantitySamples('HKQuantityTypeIdentifierHeartRate', {
        filter: {
          date: {
            startDate: startDate,
            endDate: endDate,
          },
        },
        limit: -1, // Fetch all samples
        ascending: false,
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

      const { queryWorkoutSamples } = HealthKit;

      // Wrap in try-catch since workouts might not be authorized
      let workouts;
      try {
        workouts = await queryWorkoutSamples({
          filter: {
            date: {
              startDate: startDate,
              endDate: endDate,
            },
          },
          limit: 100,
          ascending: false,
        });
      } catch (workoutError) {
        console.log('[AppleHealth] getWorkouts: Not authorized or error fetching workouts:', workoutError);
        return [];
      }

      if (!workouts || workouts.length === 0) return [];

      // Workout activity type mapping (using string identifiers in v13.x)
      const workoutTypeMap: Record<string, WorkoutType> = {
        'HKWorkoutActivityTypeRunning': 'running',
        'HKWorkoutActivityTypeWalking': 'walking',
        'HKWorkoutActivityTypeCycling': 'cycling',
        'HKWorkoutActivityTypeSwimming': 'swimming',
        'HKWorkoutActivityTypeTraditionalStrengthTraining': 'strength',
        'HKWorkoutActivityTypeHighIntensityIntervalTraining': 'hiit',
        'HKWorkoutActivityTypeYoga': 'yoga',
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
  customStartWeight: number | null;
  customStartWeightsByUser: Record<string, number>;
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
  setCustomStartWeight: (weight: number | null, userId?: string) => Promise<void>;
  loadCustomStartWeight: (userId: string) => Promise<void>;
  getCustomStartWeight: (userId?: string) => number | null;
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
      customStartWeight: null,
      customStartWeightsByUser: {},
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
            // Use a longer delay (3s) to give HealthKit authorization time to fully settle
            InteractionManager.runAfterInteractions(() => {
              setTimeout(async () => {
                try {
                  await get().syncHealthData(undefined, { showSpinner: false });
                  await get().syncWeight();
                } catch (e) {
                  console.error('[HealthStore] Background sync after connect failed:', e);
                  set({ isSyncing: false });
                }
              }, 3000);
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
          } else {
            // metrics is null - still reset isSyncing to prevent spinner from getting stuck
            console.log('[HealthStore] syncHealthData: fetchMetrics returned null');
            if (showSpinner) {
              set({ isSyncing: false });
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
              .from('user_fitness')
              .update({
                move_goal: goals.moveCalories,
                exercise_goal: goals.exerciseMinutes,
                stand_goal: goals.standHours,
                // Note: steps_goal doesn't exist in the database
              })
              .eq('user_id', userId);

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
            .from('user_fitness')
            .select('move_goal, exercise_goal, stand_goal')
            .eq('user_id', userId)
            .maybeSingle();

          if (error) {
            console.error('[HealthStore] Error loading goals:', error);
            return;
          }

          // No data found (e.g., demo user or new user) - use defaults
          if (!data) {
            return;
          }

          if (data) {
            set({
              goals: {
                moveCalories: data.move_goal || 500,
                exerciseMinutes: data.exercise_goal || 30,
                standHours: data.stand_goal || 12,
                steps: 10000, // Default steps goal, not stored in DB
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
            adapter.fetchWeightHistory(90),
          ]);

          // Always update with fresh data - if no weight data exists in HealthKit, clear it
          // Don't keep stale persisted data
          set({
            weight,
            bmi,
            weightHistory: weightHistory,
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
              .from('user_fitness')
              .update({ target_weight: goal })
              .eq('user_id', userId);

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
            .from('user_fitness')
            .select('target_weight')
            .eq('user_id', userId)
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

      setCustomStartWeight: async (weight: number | null, userId?: string) => {
        set({ customStartWeight: weight });

        if (userId) {
          set((state) => {
            const newCustomStartWeightsByUser = { ...state.customStartWeightsByUser };
            if (weight !== null) {
              newCustomStartWeightsByUser[userId] = weight;
            } else {
              delete newCustomStartWeightsByUser[userId];
            }
            return { customStartWeightsByUser: newCustomStartWeightsByUser };
          });
        }

        if (userId && isSupabaseConfigured() && supabase) {
          try {
            const { error } = await supabase
              .from('user_fitness')
              .update({ start_weight: weight })
              .eq('user_id', userId);

            if (error) {
              console.error('[HealthStore] Error saving start weight:', error);
            }
          } catch (e) {
            console.error('[HealthStore] Exception saving start weight:', e);
          }
        }
      },

      loadCustomStartWeight: async (userId: string) => {
        if (!isSupabaseConfigured() || !supabase) return;

        try {
          const { data, error } = await supabase
            .from('user_fitness')
            .select('start_weight')
            .eq('user_id', userId)
            .single();

          if (error && error.code !== 'PGRST116') {
            console.error('[HealthStore] Error loading start weight:', error);
            return;
          }

          if (data?.start_weight) {
            const startWeight = data.start_weight;
            console.log('[HealthStore] Loaded custom start weight:', startWeight);

            set((state) => {
              const newCustomStartWeightsByUser = { ...state.customStartWeightsByUser };
              newCustomStartWeightsByUser[userId] = startWeight;
              return {
                customStartWeight: startWeight,
                customStartWeightsByUser: newCustomStartWeightsByUser,
              };
            });
          }
        } catch (error) {
          console.error('[HealthStore] Exception loading start weight:', error);
        }
      },

      getCustomStartWeight: (userId?: string) => {
        if (userId) {
          return get().customStartWeightsByUser[userId] ?? get().customStartWeight;
        }
        return get().customStartWeight;
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
        currentMetrics: state.currentMetrics,
        goals: state.goals,
        weight: state.weight,
        bmi: state.bmi,
        weightHistory: state.weightHistory,
        weightGoal: state.weightGoal,
        weightGoalsByUser: state.weightGoalsByUser,
        customStartWeight: state.customStartWeight,
        customStartWeightsByUser: state.customStartWeightsByUser,
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