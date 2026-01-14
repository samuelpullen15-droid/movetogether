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
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:47',message:'loadHealthKitModule entry',data:{hasModule:!!AppleHealthKitModule,platform:Platform.OS},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  if (!AppleHealthKitModule && Platform.OS === 'ios') {
    try {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:50',message:'importing react-native-health',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      AppleHealthKitModule = await import('react-native-health');
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:52',message:'import successful',data:{hasDefault:!!AppleHealthKitModule.default,hasModule:!!AppleHealthKitModule},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      const result = AppleHealthKitModule.default || AppleHealthKitModule;
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:55',message:'returning module',data:{hasResult:!!result,hasInitHealthKit:!!result?.initHealthKit},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return result;
    } catch (error) {
      console.error('[AppleHealth] Failed to load react-native-health:', error);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:53',message:'import failed',data:{errorMessage:error instanceof Error?error.message:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return null;
    }
  }
  const result = AppleHealthKitModule?.default || AppleHealthKitModule;
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:57',message:'returning cached module',data:{hasResult:!!result},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  return result;
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
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:74',message:'requestPermissions entry',data:{isAvailable:this.isAvailable(),isInitialized:this.isInitialized},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (!this.isAvailable()) {
      console.log('[AppleHealth] Not available on this platform');
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:76',message:'not available on platform',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return false;
    }

    try {
      console.log('[AppleHealth] Loading HealthKit module...');
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:81',message:'loading module start',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      const AppleHealthKit = await loadHealthKitModule();
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:83',message:'module loaded result',data:{hasModule:!!AppleHealthKit,moduleType:typeof AppleHealthKit},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      if (!AppleHealthKit) {
        console.error('[AppleHealth] Failed to load HealthKit module');
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:85',message:'module load failed',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        return false;
      }

      console.log('[AppleHealth] HealthKit module loaded, requesting permissions...');
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:88',message:'about to call initHealthKit',data:{hasInitHealthKit:typeof AppleHealthKit.initHealthKit},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

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
            ],
            write: ['Weight', 'Workout'],
          },
        };

        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:111',message:'calling initHealthKit',data:{permissionsReadCount:permissions.permissions.read.length,permissionsWriteCount:permissions.permissions.write.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        AppleHealthKit.initHealthKit(permissions, (error: any) => {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:112',message:'initHealthKit callback',data:{hasError:!!error,errorMessage:error?.message,errorCode:error?.code},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          if (error) {
            console.error('[AppleHealth] Permission error:', error);
            console.error('[AppleHealth] Error details:', JSON.stringify(error, null, 2));
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:115',message:'initHealthKit error resolved',data:{errorString:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            resolve(false);
            return;
          }
          console.log('[AppleHealth] Permissions granted successfully');
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:119',message:'permissions granted',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          this.isInitialized = true;
          resolve(true);
        });
      });
    } catch (error) {
      console.error('[AppleHealth] Error requesting permissions:', error);
      console.error('[AppleHealth] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:124',message:'requestPermissions catch error',data:{errorMessage:error instanceof Error?error.message:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      return false;
    }
  }

  async connect(): Promise<boolean> {
    console.log('[AppleHealth] connect() called');
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:130',message:'connect entry',data:{isAvailable:this.isAvailable(),isInitialized:this.isInitialized},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    if (!this.isAvailable()) {
      console.log('[AppleHealth] Not available on this platform');
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:133',message:'connect not available',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      return false;
    }

    // Request permissions if not already initialized
    if (!this.isInitialized) {
      console.log('[AppleHealth] Not initialized, requesting permissions...');
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:139',message:'calling requestPermissions from connect',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      const hasPermissions = await this.requestPermissions();
      console.log('[AppleHealth] Permission request result:', hasPermissions);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:142',message:'requestPermissions result in connect',data:{hasPermissions},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      return hasPermissions;
    }

    console.log('[AppleHealth] Already initialized');
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:145',message:'already initialized',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
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

      // Fetch all metrics in parallel
      const [
        activeCalories,
        exerciseMinutes,
        standHours,
        steps,
        distance,
        floorsClimbed,
        heartRate,
        workouts,
      ] = await Promise.all([
        this.getActiveEnergyBurned(today, now),
        this.getExerciseTime(today, now),
        this.getStandTime(today, now),
        this.getStepCount(today, now),
        this.getDistance(today, now),
        this.getFloorsClimbed(today, now),
        this.getHeartRate(today, now),
        this.getWorkouts(today, now),
      ]);

      return {
        activeCalories: activeCalories || 0,
        exerciseMinutes: exerciseMinutes || 0,
        standHours: standHours || 0,
        steps: steps || 0,
        distanceMeters: distance || 0,
        floorsClimbed: floorsClimbed || 0,
        heartRateAvg: heartRate || 0,
        heartRateResting: 0, // Would need separate query
        heartRateMax: 0, // Would need separate query
        workoutsCompleted: workouts?.length || 0,
        lastUpdated: new Date().toISOString(),
        provider: 'apple_health',
      };
    } catch (error) {
      console.error('[AppleHealth] Error fetching metrics:', error);
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

        AppleHealthKit.getBodyMassIndexSamples(options, (error: any, results: any[]) => {
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
          if (error || !results || results.length === 0) {
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
          if (error || !results || results.length === 0) {
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
          if (error || !results || results.length === 0) {
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
          if (error || !results || results.length === 0) {
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
          if (error || !results || results.length === 0) {
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
          if (error || !results || results.length === 0) {
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
          if (error || !results || results.length === 0) {
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
          if (error || !results || results.length === 0) {
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

            return {
              id: workout.id || `${workout.startDate}-${workout.endDate}`,
              type: workoutTypeMap[workout.activityType] || 'other',
              startTime: workout.startDate,
              endTime: workout.endDate,
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
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:700',message:'connectProvider start',data:{providerId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        set({ isConnecting: true, lastSyncError: null });

        try {
          const adapter = getAdapter(providerId);
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:704',message:'adapter obtained',data:{providerId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion

          if (!adapter.isAvailable()) {
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:706',message:'adapter not available',data:{providerId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            set({
              isConnecting: false,
              lastSyncError: 'This provider is not available on your device',
            });
            return false;
          }

          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:723',message:'about to call requestPermissions',data:{providerId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          const hasPermissions = await adapter.requestPermissions();
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:725',message:'requestPermissions result',data:{providerId,hasPermissions},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          if (!hasPermissions) {
            // For HealthKit, permissions are requested during connect
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:728',message:'hasPermissions false, continuing to connect',data:{providerId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
          }

          const connected = await adapter.connect();
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'health-service.ts:719',message:'connect result',data:{providerId,connected},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion

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
