import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';
import { useAuthStore } from './auth-store';

interface OnboardingStore {
  hasCompletedOnboarding: boolean;
  _hasHydrated: boolean;
  setHasHydrated: (hasHydrated: boolean) => void;
  setHasCompletedOnboarding: (completed: boolean) => void;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
}

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      _hasHydrated: false,
      
      setHasHydrated: (hasHydrated) => {
        set({ _hasHydrated: hasHydrated });
      },

      setHasCompletedOnboarding: (completed: boolean) => {
        set({ hasCompletedOnboarding: completed });
      },

      completeOnboarding: async () => {
        // Update local state immediately
        set({ hasCompletedOnboarding: true });
        
        // Save to Supabase profiles table
        const user = useAuthStore.getState().user;
        if (user?.id && isSupabaseConfigured() && supabase) {
          try {
            const { error } = await supabase
              .from('profiles')
              .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
              .eq('id', user.id);
            
            if (error) {
              console.error('Error saving onboarding_completed to Supabase:', error);
              // Don't throw - local state is already updated
            } else {
              console.log('Successfully saved onboarding_completed to Supabase');
            }
          } catch (e) {
            console.error('Error updating onboarding_completed:', e);
            // Don't throw - local state is already updated
          }
        }
      },

      resetOnboarding: async () => {
        // Update local state immediately
        set({ hasCompletedOnboarding: false });
        
        // Save to Supabase profiles table
        const user = useAuthStore.getState().user;
        if (user?.id && isSupabaseConfigured() && supabase) {
          try {
            const { error } = await supabase
              .from('profiles')
              .update({ onboarding_completed: false, updated_at: new Date().toISOString() })
              .eq('id', user.id);
            
            if (error) {
              console.error('Error resetting onboarding_completed in Supabase:', error);
            }
          } catch (e) {
            console.error('Error resetting onboarding_completed:', e);
          }
        }
      },
    }),
    {
      name: 'onboarding-storage',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => {
        return (state, error) => {
          // Called after rehydration completes
          if (error) {
            console.error('Error rehydrating onboarding store:', error);
            // Mark as hydrated even on error (defaults will be used)
            useOnboardingStore.getState().setHasHydrated(true);
          } else if (state) {
            // Mark as hydrated when rehydration completes successfully
            state.setHasHydrated(true);
            console.log('Onboarding store hydrated:', { hasCompletedOnboarding: state.hasCompletedOnboarding });
          } else {
            // No state (first time, no persisted data) - mark as hydrated with defaults
            useOnboardingStore.getState().setHasHydrated(true);
            console.log('Onboarding store hydrated with defaults (first time)');
          }
        };
      },
    }
  )
);
