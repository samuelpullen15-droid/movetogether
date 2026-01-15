// Health Provider Types and Interfaces
// This file defines the structure for integrating with various health platforms

export type HealthProviderType =
  | 'apple_health'
  | 'fitbit'
  | 'garmin'
  | 'google_fit'
  | 'samsung_health'
  | 'whoop'
  | 'oura';

export interface HealthProvider {
  id: HealthProviderType;
  name: string;
  icon: string;
  color: string;
  description: string;
  connected: boolean;
  lastSync?: string;
  requiresOAuth: boolean;
  platforms: ('ios' | 'android' | 'web')[];
}

export interface HealthMetrics {
  // Activity
  activeCalories: number;      // Move ring
  exerciseMinutes: number;     // Exercise ring
  standHours: number;          // Stand ring

  // Steps & Distance
  steps: number;
  distanceMeters: number;
  floorsClimbed: number;

  // Heart
  heartRateAvg: number;
  heartRateResting: number;
  heartRateMax: number;

  // Sleep (if available)
  sleepHours?: number;
  sleepQuality?: number; // 0-100

  // Workouts
  workoutsCompleted: number;

  // Metadata
  lastUpdated: string;
  provider: HealthProviderType;

  // Goals from Apple Health (optional)
  goals?: {
    moveCalories: number;
    exerciseMinutes: number;
    standHours: number;
  };
}

export interface HealthGoals {
  moveCalories: number;
  exerciseMinutes: number;
  standHours: number;
  steps: number;
}

export interface WorkoutSession {
  id: string;
  type: WorkoutType;
  startTime: string;
  endTime: string;
  duration: number; // minutes
  calories: number;
  heartRateAvg?: number;
  distance?: number; // meters
  provider: HealthProviderType;
  sourceName?: string; // e.g., "Apple Watch", "Nike Run Club", "Strava"
  sourceId?: string; // Bundle identifier or source ID
}

export type WorkoutType =
  | 'running'
  | 'walking'
  | 'cycling'
  | 'swimming'
  | 'strength'
  | 'hiit'
  | 'yoga'
  | 'other';

// Provider configurations
export const HEALTH_PROVIDERS: HealthProvider[] = [
  {
    id: 'apple_health',
    name: 'Apple Health',
    icon: 'heart',
    color: '#FF2D55',
    description: 'Sync with your Apple Watch',
    connected: false,
    requiresOAuth: false, // Uses HealthKit
    platforms: ['ios'],
  },
  {
    id: 'google_fit',
    name: 'Google Fit',
    icon: 'activity',
    color: '#4285F4',
    description: 'Connect your Google Fit account',
    connected: false,
    requiresOAuth: true,
    platforms: ['android', 'web'],
  },
  {
    id: 'fitbit',
    name: 'Fitbit',
    icon: 'watch',
    color: '#00B0B9',
    description: 'Sync with your Fitbit device',
    connected: false,
    requiresOAuth: true,
    platforms: ['ios', 'android', 'web'],
  },
  {
    id: 'garmin',
    name: 'Garmin',
    icon: 'compass',
    color: '#007CC3',
    description: 'Connect your Garmin device',
    connected: false,
    requiresOAuth: true,
    platforms: ['ios', 'android', 'web'],
  },
  {
    id: 'samsung_health',
    name: 'Samsung Health',
    icon: 'smartphone',
    color: '#1428A0',
    description: 'Sync with Samsung Galaxy Watch',
    connected: false,
    requiresOAuth: true,
    platforms: ['android'],
  },
  {
    id: 'whoop',
    name: 'WHOOP',
    icon: 'zap',
    color: '#FFFFFF',
    description: 'Connect your WHOOP strap',
    connected: false,
    requiresOAuth: true,
    platforms: ['ios', 'android'],
  },
  {
    id: 'oura',
    name: 'Oura Ring',
    icon: 'circle',
    color: '#2F4A73',
    description: 'Sync with your Oura Ring',
    connected: false,
    requiresOAuth: true,
    platforms: ['ios', 'android'],
  },
];

// Environment variable keys for each provider
export const PROVIDER_ENV_KEYS: Record<HealthProviderType, { clientId: string; clientSecret: string }> = {
  apple_health: {
    clientId: 'EXPO_PUBLIC_APPLE_HEALTH_ENABLED', // Just a flag for HealthKit
    clientSecret: '', // Not needed for HealthKit
  },
  google_fit: {
    clientId: 'EXPO_PUBLIC_GOOGLE_FIT_CLIENT_ID',
    clientSecret: 'GOOGLE_FIT_CLIENT_SECRET',
  },
  fitbit: {
    clientId: 'EXPO_PUBLIC_FITBIT_CLIENT_ID',
    clientSecret: 'FITBIT_CLIENT_SECRET',
  },
  garmin: {
    clientId: 'EXPO_PUBLIC_GARMIN_CLIENT_ID',
    clientSecret: 'GARMIN_CLIENT_SECRET',
  },
  samsung_health: {
    clientId: 'EXPO_PUBLIC_SAMSUNG_HEALTH_CLIENT_ID',
    clientSecret: 'SAMSUNG_HEALTH_CLIENT_SECRET',
  },
  whoop: {
    clientId: 'EXPO_PUBLIC_WHOOP_CLIENT_ID',
    clientSecret: 'WHOOP_CLIENT_SECRET',
  },
  oura: {
    clientId: 'EXPO_PUBLIC_OURA_CLIENT_ID',
    clientSecret: 'OURA_CLIENT_SECRET',
  },
};
