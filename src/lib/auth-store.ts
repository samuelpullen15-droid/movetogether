import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';
import { Session, User } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { setOneSignalUserId, clearOneSignalUserId } from './onesignal-service';
import { isUsernameClean } from './username-utils';

// For Google Auth
WebBrowser.maybeCompleteAuthSession();

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  username: string | null;
  phoneNumber: string | null;
  provider: 'apple' | 'google' | 'email' | 'demo';
  createdAt: string;
}

interface FriendWithProfile {
  id: string;
  name: string;
  avatar: string;
  username: string;
  status?: 'pending' | 'accepted';
  friendshipId?: string;
}

interface AuthStore {
  user: AuthUser | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  isProfileLoaded: boolean; // True when profile has been fetched from Supabase
  error: string | null;
  needsOnboarding: boolean;
  friends: FriendWithProfile[];
  setUser: (user: AuthUser | null) => void;
  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setInitialized: (initialized: boolean) => void;
  setProfileLoaded: (loaded: boolean) => void;
  setNeedsOnboarding: (needs: boolean) => void;
  setFriends: (friends: FriendWithProfile[]) => void;
  initialize: () => Promise<void>;
  signInWithApple: () => Promise<boolean>;
  signInWithGoogle: () => Promise<boolean>;
  signOut: () => Promise<void>;
  createDemoUser: () => Promise<boolean>;
  updateUsername: (username: string) => Promise<boolean>;
  updateProfile: (firstName: string, lastName: string, age?: number, pronouns?: string, birthday?: Date) => Promise<boolean>;
  updatePhoneNumber: (phoneNumber: string) => Promise<boolean>;
  updateAvatar: (avatarUrl: string) => Promise<boolean>;
  updatePrimaryDevice: (device: string) => Promise<boolean>;
  checkUsernameAvailable: (username: string) => Promise<boolean>;
  refreshProfile: () => Promise<void>;
}

// Convert Supabase user to our AuthUser format
const mapSupabaseUser = (user: User, provider: AuthUser['provider'] = 'email'): AuthUser => {
  const metadata = user.user_metadata || {};
  const fullName = metadata.full_name || metadata.name || null;
  const nameParts = fullName?.split(' ') || [];

  return {
    id: user.id,
    email: user.email || null,
    firstName: nameParts[0] || null,
    lastName: nameParts.slice(1).join(' ') || null,
    fullName,
    avatarUrl: null, // Never use OAuth avatar - only use Supabase uploaded avatar
    username: null, // Will be set during onboarding
    phoneNumber: metadata.phone || null,
    provider,
    createdAt: user.created_at,
  };
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,
      isProfileLoaded: false,
      error: null,
      needsOnboarding: false,
      friends: [],

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setSession: (session) => set({ session }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      setInitialized: (isInitialized) => set({ isInitialized }),
      setProfileLoaded: (isProfileLoaded) => set({ isProfileLoaded }),
      setNeedsOnboarding: (needsOnboarding) => set({ needsOnboarding }),
      setFriends: (friends) => set({ friends }),

      initialize: async () => {
        // Prevent multiple initializations
        if (get().isInitialized) {
          console.log('Auth already initialized, skipping');
          return;
        }
        
        if (!isSupabaseConfigured() || !supabase) {
          console.log('Supabase not configured, skipping auth initialization');
          set({ isInitialized: true });
          return;
        }

        try {
          // Mark as initialized FIRST to prevent race conditions
          set({ isInitialized: true });
          
          // Get initial session
          const { data: { session }, error } = await supabase.auth.getSession();

          if (error) {
            console.error('Error getting session:', error);
            set({ isInitialized: true });
            return;
          }

          if (session?.user) {
            const provider = session.user.app_metadata?.provider as AuthUser['provider'] || 'email';
            const authUser = mapSupabaseUser(session.user, provider);
            
            // Set user IMMEDIATELY from session data (don't wait for profile query)
            // This allows UI to render immediately with basic user info
            // NOTE: isProfileLoaded stays false until profile is fetched
            set({ user: authUser, session, isAuthenticated: true });
            
            // Fetch profile and update user when it completes
            // isProfileLoaded will be set to true when this completes
            supabase
              .from('profiles')
              .select('username, full_name, avatar_url, phone_number, onboarding_completed')
              .eq('id', session.user.id)
              .single()
              .then(({ data: profile, error }) => {
                if (error) {
                  console.error('Error fetching profile in initialize:', error);
                  return;
                }

                if (profile) {
                  const updatedUser = { ...authUser };
                  updatedUser.username = profile.username;
                  if (profile.full_name) {
                    updatedUser.fullName = profile.full_name;
                    const nameParts = profile.full_name.split(' ');
                    updatedUser.firstName = nameParts[0] || null;
                    updatedUser.lastName = nameParts.slice(1).join(' ') || null;
                  }
                  // Only set avatar_url if we don't already have one from OAuth
                  // This preserves the OAuth avatar that's already visible
                  if (!updatedUser.avatarUrl && profile.avatar_url) {
                    updatedUser.avatarUrl = profile.avatar_url;
                  }
                  // Set phone number if present
                  if (profile.phone_number) {
                    updatedUser.phoneNumber = profile.phone_number;
                  }
                  
                  console.log('Initialize: Loaded profile from Supabase:', {
                    rawProfile: profile,
                    username: updatedUser.username,
                    fullName: updatedUser.fullName,
                    firstName: updatedUser.firstName,
                    lastName: updatedUser.lastName,
                    avatarUrl: updatedUser.avatarUrl,
                    phoneNumber: updatedUser.phoneNumber,
                  });

                  // PRIMARY: Use onboarding_completed flag from database as source of truth
                  const hasOnboardingFlag = profile.onboarding_completed === true;
                  let needsOnboarding = !hasOnboardingFlag;
                  
                  // Only check required fields as fallback if onboarding_completed is not set
                  if (!hasOnboardingFlag && profile.onboarding_completed === undefined) {
                    // Fallback: check if required fields exist (username, firstName, phoneNumber)
                    const hasRequiredFields = profile.username && updatedUser.firstName && profile.phone_number;
                    needsOnboarding = !hasRequiredFields;
                  }
                  
                  // Update onboarding store based on onboarding_completed flag
                  // IMPORTANT: Set isProfileLoaded AFTER onboarding store is updated
                  import('./onboarding-store').then(({ useOnboardingStore }) => {
                    if (hasOnboardingFlag) {
                      useOnboardingStore.getState().setHasCompletedOnboarding(true);
                    } else if (profile.onboarding_completed === false) {
                      // Explicitly set to false if the flag exists and is false
                      useOnboardingStore.getState().setHasCompletedOnboarding(false);
                    }
                    // Only mark profile as loaded AFTER onboarding store is updated
                    set({ user: updatedUser, needsOnboarding, isProfileLoaded: true });
                  }).catch(() => {
                    // Fallback if import fails
                    set({ user: updatedUser, needsOnboarding, isProfileLoaded: true });
                  });
                } else {
                  console.log('Initialize: No profile found in database');
                  // Still mark profile as loaded (with defaults)
                  set({ isProfileLoaded: true });
                }
              })
              .catch((error) => {
                console.error('Error in profile fetch promise:', error);
                // Still mark profile as loaded on error (use defaults)
                set({ isProfileLoaded: true });
              });
          } else {
            // No session - no profile to load
            set({ isProfileLoaded: true });
          }

          // Listen for auth changes
          if (supabase) {
            const supabaseClient = supabase; // Capture in local variable for type narrowing
            supabaseClient.auth.onAuthStateChange(async (event, session) => {
            console.log('Auth state changed:', event);
            console.log('Session exists:', !!session);
            console.log('Session user:', session?.user?.email);

            if (session?.user) {
              console.log('Auth listener: Processing user...');
              const provider = session.user.app_metadata?.provider as AuthUser['provider'] || 'email';
              
              const authUser = mapSupabaseUser(session.user, provider);
              // Remove OAuth avatar - we only want Supabase avatar
              authUser.avatarUrl = null;
              
              // Set authenticated state IMMEDIATELY - don't wait for profile
              // NOTE: isProfileLoaded stays false until profile is fetched
              console.log('Auth listener: Setting authenticated state immediately');
              set({ user: authUser, session, isAuthenticated: true, isProfileLoaded: false });
              
              // Set OneSignal user ID to link push notifications to this user
              setOneSignalUserId(session.user.id);
              
              // Pre-load profile IMMEDIATELY in parallel (don't wait for anything)
              // This ensures the Supabase avatar appears as soon as possible
              supabaseClient
                .from('profiles')
                .select('username, full_name, avatar_url, phone_number, onboarding_completed')
                .eq('id', session.user.id)
                .single()
                .then(({ data: profile, error }) => {
                  if (error) {
                    console.error('Auth listener: Profile pre-load error:', error);
                    return;
                  }
                  
                  if (profile) {
                    const latestUser = get().user;
                    if (latestUser && latestUser.id === session.user.id) {
                      const updatedUser = { ...latestUser };
                      updatedUser.username = profile.username || updatedUser.username;
                      if (profile.full_name) {
                        updatedUser.fullName = profile.full_name;
                        const nameParts = profile.full_name.split(' ');
                        updatedUser.firstName = nameParts[0] || null;
                        updatedUser.lastName = nameParts.slice(1).join(' ') || null;
                      }
                      // Always set Supabase avatar - we never want OAuth avatar
                      updatedUser.avatarUrl = profile.avatar_url || null;
                      if (profile.phone_number) {
                        updatedUser.phoneNumber = profile.phone_number;
                      }
                      
                      // Update onboarding store immediately based on profile data
                      // IMPORTANT: Set isProfileLoaded AFTER onboarding store is updated
                      const needsOnboarding = !profile.onboarding_completed;
                      import('./onboarding-store').then(({ useOnboardingStore }) => {
                        useOnboardingStore.getState().setHasCompletedOnboarding(profile.onboarding_completed === true);
                        // Only mark profile as loaded AFTER onboarding store is updated
                        set({ user: updatedUser, needsOnboarding, isProfileLoaded: true });
                      }).catch(() => {
                        // Fallback if import fails
                        set({ user: updatedUser, needsOnboarding, isProfileLoaded: true });
                      });
                    } else {
                      // Profile exists but user ID mismatch - still mark as loaded
                      set({ isProfileLoaded: true });
                    }
                  } else {
                    // No profile found - still mark as loaded (will use defaults)
                    set({ isProfileLoaded: true });
                  }
                })
                .catch((error) => {
                  console.error('Auth listener: Profile pre-load promise error:', error);
                  // Still mark profile as loaded on error
                  set({ isProfileLoaded: true });
                });
              
              // Pre-load friends IMMEDIATELY in parallel (don't wait for profile query)
              import('./friends-service').then(({ getUserFriends }) => {
                getUserFriends(session.user.id).then((friends) => {
                  console.log('Auth listener: Pre-loaded friends:', friends.length);
                  set({ friends });
                }).catch((error) => {
                  console.error('Auth listener: Error pre-loading friends:', error);
                });
              }).catch((error) => {
                console.error('Auth listener: Error importing friends service:', error);
              });
              
              // Fetch competitions immediately when user signs in (don't wait for home screen)
              // Use dynamic import but don't await - start it immediately
              import('./fitness-store').then(({ useFitnessStore }) => {
                const store = useFitnessStore.getState();
                // Check if we already have competitions from persistence - if so, they'll show immediately
                const existingCompetitions = store.competitions;
                console.log('Auth listener: Fetching competitions immediately for user', session.user.id, 'existing competitions from persistence:', existingCompetitions.length);
                // Start fetch in background - existing competitions will show until fetch completes
                store.fetchUserCompetitions(session.user.id).catch((error) => {
                  console.error('Auth listener: Error fetching competitions:', error);
                });
              }).catch((error) => {
                console.error('Auth listener: Error importing fitness store:', error);
              });
              
              // Profile is already pre-loaded immediately above - onboarding_completed is set there
              // No need for a duplicate query - the profile pre-load callback handles it
              console.log('Auth listener: Complete');
            } else {
              console.log('Auth listener: No session, clearing state');
              // Clear OneSignal user ID on logout
              clearOneSignalUserId();
              set({ user: null, session: null, isAuthenticated: false, needsOnboarding: false, friends: [], isProfileLoaded: true });
            }
          });
          }

          set({ isInitialized: true });
        } catch (e) {
          console.error('Error initializing auth:', e);
          set({ isInitialized: true });
        }
      },

      signInWithApple: async () => {
        set({ isLoading: true, error: null });

        try {
          const credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
              AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
              AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
          });

          if (!credential.identityToken) {
            throw new Error('No identity token received from Apple');
          }

          if (!isSupabaseConfigured() || !supabase) {
            throw new Error('Supabase not configured');
          }

          // Sign in with Supabase using Apple credential
          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'apple',
            token: credential.identityToken,
          });

          if (error) {
            throw error;
          }

          if (data.user) {
            const authUser = mapSupabaseUser(data.user, 'apple');
            
            // Update with Apple-provided name if available
            if (credential.fullName) {
              authUser.firstName = credential.fullName.givenName || authUser.firstName;
              authUser.lastName = credential.fullName.familyName || authUser.lastName;
              authUser.fullName = [credential.fullName.givenName, credential.fullName.familyName]
                .filter(Boolean)
                .join(' ') || authUser.fullName;
            }

            set({ user: authUser, session: data.session, isAuthenticated: true, isLoading: false, needsOnboarding: true });
            return true;
          }

          set({ isLoading: false });
          return false;
        } catch (e: unknown) {
          const error = e as Error;
          if (error.message?.includes('canceled') || error.message?.includes('cancelled')) {
            // User cancelled, not an error
            set({ isLoading: false });
            return false;
          }
          console.error('Apple sign in error:', error);
          set({ error: error.message || 'Apple sign in failed', isLoading: false });
          return false;
        }
      },

      signInWithGoogle: async () => {
        set({ isLoading: true, error: null });

        try {
          console.log('=== Google Sign In Started ===');
          console.log('Supabase configured:', isSupabaseConfigured());
          console.log('Supabase client exists:', !!supabase);

          if (!isSupabaseConfigured() || !supabase) {
            console.log('Supabase not configured, using demo mode');
            return get().createDemoUser();
          }

          const redirectUri = makeRedirectUri({
            scheme: 'movetogether',
            path: 'auth/callback',
          });

          console.log('Redirect URI:', redirectUri);

          const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: redirectUri,
              skipBrowserRedirect: true,
              queryParams: {
                prompt: 'select_account',
              },
            },
          });

          console.log('OAuth response - error:', error);
          console.log('OAuth response - URL:', data?.url);

          if (error) {
            throw error;
          }

          if (data.url) {
            console.log('Opening browser with URL...');
            // Open browser for OAuth flow
            const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

            console.log('Browser result type:', result.type);
            console.log('Browser result:', JSON.stringify(result));

            if (result.type === 'success' && result.url) {
              const url = new URL(result.url);
              
              // Check for authorization code (PKCE flow)
              const code = url.searchParams.get('code');
              console.log('Authorization code:', code);
              
              if (code) {
                console.log('About to exchange code for session...');
                
                // Exchange the code - this triggers auth listener
                // Don't await indefinitely, check auth state after
                try {
                  const exchangePromise = supabase.auth.exchangeCodeForSession(code);
                  
                  // Wait max 5 seconds for exchange
                  const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Exchange timeout')), 5000)
                  );
                  
                  const { data: sessionData, error: sessionError } = await Promise.race([
                    exchangePromise,
                    timeoutPromise
                  ]) as any;
                  
                  console.log('Session exchange completed');
                  console.log('Session exchange error:', sessionError);
                  
                } catch (exchangeErr) {
                  console.log('Exchange error or timeout:', exchangeErr);
                }
                
                // Check if auth listener already authenticated us
                // Give it more time to process (profile query)
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const currentState = get();
                console.log('Current isAuthenticated:', currentState.isAuthenticated);
                console.log('Current user:', currentState.user?.email);
                
                if (currentState.isAuthenticated && currentState.user) {
                  console.log('Authenticated! Setting loading false and returning true');
                  set({ isLoading: false, needsOnboarding: !currentState.user.username });
                  return true;
                }
                
                console.log('Not authenticated after exchange');
              }
              
              // Fallback: Check for tokens in hash (implicit flow)
              const params = new URLSearchParams(url.hash.substring(1));
              const accessToken = params.get('access_token');
              const refreshToken = params.get('refresh_token');

              if (accessToken) {
                const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken || '',
                });

                if (sessionError) {
                  throw sessionError;
                }

                if (sessionData.user) {
                  const authUser = mapSupabaseUser(sessionData.user, 'google');
                  set({ 
                    user: authUser, 
                    session: sessionData.session, 
                    isAuthenticated: true, 
                    isLoading: false,
                    needsOnboarding: true 
                  });
                  return true;
                }
              }
            }
          }

          set({ isLoading: false });
          return false;
        } catch (e: unknown) {
          const error = e as Error;
          console.error('Google sign in error:', error);
          set({ error: error.message || 'Google sign in failed', isLoading: false });
          return false;
        }
      },

      createDemoUser: async () => {
        set({ isLoading: true, error: null });

        try {
          const uniqueId = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            `demo_user_${Date.now()}`
          );

          const demoUser: AuthUser = {
            id: uniqueId.substring(0, 32),
            email: 'demo@movetogether.app',
            firstName: 'Demo',
            lastName: 'User',
            fullName: 'Demo User',
            avatarUrl: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=200&h=200&fit=crop',
            username: null,
            phoneNumber: null,
            provider: 'demo',
            createdAt: new Date().toISOString(),
          };

          set({ user: demoUser, isAuthenticated: true, isLoading: false, needsOnboarding: true });
          return true;
        } catch (e: unknown) {
          const error = e as Error;
          set({ error: error.message || 'Failed to create demo user', isLoading: false });
          return false;
        }
      },

      updateUsername: async (username: string) => {
        const { user } = get();
        if (!user) return false;

        // Validate username for profanity
        if (!isUsernameClean(username)) {
          console.error('Username contains inappropriate content');
          return false;
        }

        try {
          if (isSupabaseConfigured() && supabase && user.provider !== 'demo') {
            // Update in Supabase
            const { error } = await supabase
              .from('profiles')
              .upsert({
                id: user.id,
                username: username.toLowerCase(),
                updated_at: new Date().toISOString(),
              });

            if (error) {
              console.error('Error updating username:', error);
              return false;
            }
          }

          // Update local state
          set({
            user: { ...user, username: username.toLowerCase() },
          });
          return true;
        } catch (e) {
          console.error('Error updating username:', e);
          return false;
        }
      },

      updateProfile: async (firstName: string, lastName: string, age?: number, pronouns?: string, birthday?: Date) => {
        const { user } = get();
        if (!user) return false;

        const fullName = `${firstName} ${lastName}`.trim();

        try {
          if (isSupabaseConfigured() && supabase && user.provider !== 'demo') {
            // Update in Supabase profiles table
            const { error } = await supabase
              .from('profiles')
              .update({
                full_name: fullName,
                updated_at: new Date().toISOString(),
              })
              .eq('id', user.id);

            if (error) {
              console.error('Error updating profile:', error);
              return false;
            }

            // Update age, pronouns, and birthday in user_fitness table if provided
            if (age !== undefined && age !== null || pronouns || birthday) {
              const ageNum = age !== undefined && age !== null ? (typeof age === 'string' ? parseInt(age, 10) : age) : undefined;
              
              // Check if user_fitness row exists
              const { data: existingFitness } = await supabase
                .from('user_fitness')
                .select('id, move_goal, exercise_goal, stand_goal')
                .eq('user_id', user.id)
                .maybeSingle();

              const updateData: any = {
                updated_at: new Date().toISOString(),
              };

              if (ageNum !== undefined && !isNaN(ageNum) && ageNum > 0) {
                updateData.age = ageNum;
              }

              // Store pronouns in dedicated pronouns column
              if (pronouns) {
                updateData.pronouns = pronouns;
              }

              // Store birthday date
              if (birthday) {
                // Format as YYYY-MM-DD for PostgreSQL date type
                const birthdayStr = birthday.toISOString().split('T')[0];
                updateData.birthday = birthdayStr;
              }

              if (existingFitness) {
                // Update existing row
                const { error: fitnessError } = await supabase
                  .from('user_fitness')
                  .update(updateData)
                  .eq('user_id', user.id);

                if (fitnessError) {
                  console.error('Error updating user_fitness:', fitnessError);
                }
              } else {
                // Create new row with default goals
                const { error: fitnessError } = await supabase
                  .from('user_fitness')
                  .insert({
                    user_id: user.id,
                    move_goal: 400,
                    exercise_goal: 30,
                    stand_goal: 12,
                    ...updateData,
                  });

                if (fitnessError) {
                  console.error('Error creating user_fitness row:', fitnessError);
                }
              }
            }
          }

          // Update local state
          set({
            user: { 
              ...user, 
              firstName, 
              lastName, 
              fullName 
            },
          });
          return true;
        } catch (e) {
          console.error('Error updating profile:', e);
          return false;
        }
      },

      updatePhoneNumber: async (phoneNumber: string) => {
        const { user } = get();
        if (!user) return false;

        try {
          if (isSupabaseConfigured() && supabase && user.provider !== 'demo') {
            // Normalize phone number (simple normalization - remove non-digits, add +1 for US numbers)
            const digits = phoneNumber.replace(/\D/g, '');
            const normalized = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : `+${digits}`;

            // Update in Supabase profiles table
            const { error } = await supabase
              .from('profiles')
              .update({
                phone_number: normalized,
                updated_at: new Date().toISOString(),
              })
              .eq('id', user.id);

            if (error) {
              console.error('Error updating phone number:', error);
              return false;
            }

            // Update local state
            set({
              user: { 
                ...user, 
                phoneNumber: normalized
              },
            });
          }

          return true;
        } catch (e) {
          console.error('Error updating phone number:', e);
          return false;
        }
      },

      updatePrimaryDevice: async (device: string) => {
        const { user } = get();
        if (!user) return false;

        try {
          if (isSupabaseConfigured() && supabase && user.provider !== 'demo') {
            // Update in Supabase profiles table
            const { error } = await supabase
              .from('profiles')
              .update({
                primary_device: device,
                updated_at: new Date().toISOString(),
              })
              .eq('id', user.id);

            if (error) {
              console.error('Error updating primary device:', error);
              return false;
            }

            return true;
          }
          return true; // For demo users, just return true
        } catch (e) {
          console.error('Error updating primary device:', e);
          return false;
        }
      },

      updateAvatar: async (avatarUrl: string) => {
        const { user } = get();
        if (!user) return false;

        try {
          if (isSupabaseConfigured() && supabase && user.provider !== 'demo') {
            // First, try to get the existing profile to ensure we have all required fields
            const { data: existingProfile, error: fetchError } = await supabase
              .from('profiles')
              .select('id, username, full_name, phone_number, email')
              .eq('id', user.id)
              .single();

            // Use upsert with all user data to ensure the profile exists with all required fields
            const profileData: any = {
              id: user.id,
              avatar_url: avatarUrl,
              updated_at: new Date().toISOString(),
            };

            // Include existing profile data or user data to ensure required fields are present
            if (existingProfile) {
              profileData.username = existingProfile.username || user.username;
              profileData.full_name = existingProfile.full_name || user.fullName;
              profileData.phone_number = existingProfile.phone_number || user.phoneNumber;
              profileData.email = existingProfile.email || user.email;
            } else {
              // Profile doesn't exist, use user data
              profileData.username = user.username;
              profileData.full_name = user.fullName;
              profileData.phone_number = user.phoneNumber;
              profileData.email = user.email;
            }

            const { error } = await supabase
              .from('profiles')
              .upsert(profileData, {
                onConflict: 'id'
              });

            if (error) {
              console.error('Error updating avatar:', error);
              return false;
            }

            // Update local state
            set({
              user: { 
                ...user, 
                avatarUrl: avatarUrl
              },
            });
          }

          return true;
        } catch (e) {
          console.error('Error updating avatar:', e);
          return false;
        }
      },

      refreshProfile: async () => {
        const { user } = get();
        if (!user || !isSupabaseConfigured() || !supabase) {
          console.log('Cannot refresh profile: no user or Supabase not configured');
          return;
        }


        try {
          console.log('Refreshing profile from Supabase...');
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('username, full_name, avatar_url, phone_number, onboarding_completed')
            .eq('id', user.id)
            .single();

          if (error) {
            console.error('Error refreshing profile:', error);
            return;
          }

          if (profile) {
            const updatedUser = { ...user };
            updatedUser.username = profile.username || updatedUser.username;
            if (profile.full_name) {
              updatedUser.fullName = profile.full_name;
              const nameParts = profile.full_name.split(' ');
              updatedUser.firstName = nameParts[0] || null;
              updatedUser.lastName = nameParts.slice(1).join(' ') || null;
            }
            // Always use Supabase avatar_url - we never want OAuth avatar
            updatedUser.avatarUrl = profile.avatar_url || null;
            // Update phone number if present
            if (profile.phone_number) {
              updatedUser.phoneNumber = profile.phone_number;
            }

            // Update onboarding store if onboarding is completed
            if (profile.onboarding_completed === true) {
              const { useOnboardingStore } = await import('./onboarding-store');
              useOnboardingStore.getState().setHasCompletedOnboarding(true);
            }

            console.log('Profile refreshed from Supabase:', {
              rawProfile: profile,
              username: updatedUser.username,
              fullName: updatedUser.fullName,
              firstName: updatedUser.firstName,
              lastName: updatedUser.lastName,
              avatarUrl: updatedUser.avatarUrl,
              phoneNumber: updatedUser.phoneNumber,
              onboardingCompleted: profile.onboarding_completed,
            });
            set({ user: updatedUser });
            
          }
        } catch (e) {
          console.error('Error refreshing profile:', e);
        }
      },

      checkUsernameAvailable: async (username: string) => {
        if (!isSupabaseConfigured() || !supabase) {
          return true;
        }

        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('username')
            .eq('username', username.toLowerCase())
            .maybeSingle();

          if (error) {
            console.error('Error checking username:', error);
            // On error, assume available to not block user
            return true;
          }

          // If data is null, username is available (no user found with that username)
          return !data;
        } catch (e) {
          console.error('Error checking username:', e);
          return true; // Assume available on error
        }
      },

      signOut: async () => {
        set({ isLoading: true });

        try {
          if (isSupabaseConfigured() && supabase) {
            await supabase.auth.signOut();
          }
          // Clear OneSignal user ID on logout
          clearOneSignalUserId();
          set({ 
            user: null, 
            session: null, 
            isAuthenticated: false, 
            isLoading: false,
            isProfileLoaded: true, // No profile needed when logged out
            friends: [], 
            error: null,
            needsOnboarding: false 
          });
        } catch (e: unknown) {
          const error = e as Error;
          // Clear OneSignal user ID even if Supabase signout fails
          clearOneSignalUserId();
          // Still clear local state even if Supabase signout fails
          set({ 
            user: null, 
            session: null, 
            isAuthenticated: false, 
            isLoading: false,
            isProfileLoaded: true, // No profile needed when logged out
            error: error.message,
            needsOnboarding: false,
            friends: []
          });
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Don't persist anything - rely on Supabase session for auth state
      partialize: () => ({}),
    }
  )
);
