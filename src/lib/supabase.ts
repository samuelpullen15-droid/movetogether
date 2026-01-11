import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Get the URL - handle both full URLs and just project IDs
const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawSupabaseUrl.startsWith('http')
  ? rawSupabaseUrl
  : rawSupabaseUrl
    ? `https://${rawSupabaseUrl}.supabase.co`
    : '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Check if Supabase is configured
export const isSupabaseConfigured = () => {
  return Boolean(supabaseUrl && supabaseAnonKey);
};

// Custom storage adapter for React Native
const ExpoSecureStoreAdapter = {
  getItem: async (key: string) => {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      // Handle error silently
    }
  },
  removeItem: async (key: string) => {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // Handle error silently
    }
  },
};

// Only create the client if Supabase is configured
let supabaseClient: SupabaseClient | null = null;

if (isSupabaseConfigured()) {
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });
}

export const supabase = supabaseClient;

// Database types for TypeScript
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          username: string | null;
          phone_number: string | null;
          full_name: string | null;
          avatar_url: string | null;
          primary_device: string | null;
          subscription_tier: string;
          ai_messages_used: number;
          ai_messages_reset_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          username?: string | null;
          phone_number?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          primary_device?: string | null;
          subscription_tier?: string;
          ai_messages_used?: number;
          ai_messages_reset_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          username?: string | null;
          phone_number?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          primary_device?: string | null;
          subscription_tier?: string;
          ai_messages_used?: number;
          ai_messages_reset_at?: string | null;
          updated_at?: string;
        };
      };
      user_fitness: {
        Row: {
          id: string;
          user_id: string;
          move_goal: number;
          exercise_goal: number;
          stand_goal: number;
          height: number | null;
          weight: number | null;
          target_weight: number | null;
          age: number | null;
          gender: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          move_goal?: number;
          exercise_goal?: number;
          stand_goal?: number;
          height?: number | null;
          weight?: number | null;
          target_weight?: number | null;
          age?: number | null;
          gender?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          move_goal?: number;
          exercise_goal?: number;
          stand_goal?: number;
          height?: number | null;
          weight?: number | null;
          target_weight?: number | null;
          age?: number | null;
          gender?: string | null;
          updated_at?: string;
        };
      };
      competitions: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          start_date: string;
          end_date: string;
          type: 'weekly' | 'weekend' | 'monthly';
          status: 'active' | 'upcoming' | 'completed';
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          start_date: string;
          end_date: string;
          type: 'weekly' | 'weekend' | 'monthly';
          status?: 'active' | 'upcoming' | 'completed';
          created_by: string;
          created_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          start_date?: string;
          end_date?: string;
          type?: 'weekly' | 'weekend' | 'monthly';
          status?: 'active' | 'upcoming' | 'completed';
        };
      };
      competition_participants: {
        Row: {
          id: string;
          competition_id: string;
          user_id: string;
          points: number;
          move_progress: number;
          exercise_progress: number;
          stand_progress: number;
          joined_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          user_id: string;
          points?: number;
          move_progress?: number;
          exercise_progress?: number;
          stand_progress?: number;
          joined_at?: string;
        };
        Update: {
          points?: number;
          move_progress?: number;
          exercise_progress?: number;
          stand_progress?: number;
        };
      };
    };
  };
}
