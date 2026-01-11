import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';
import { Session, User } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';

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

interface AuthStore {
  user: AuthUser | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  needsOnboarding: boolean;
  setUser: (user: AuthUser | null) => void;
  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setInitialized: (initialized: boolean) => void;
  setNeedsOnboarding: (needs: boolean) => void;
  initialize: () => Promise<void>;
  signInWithApple: () => Promise<boolean>;
  signInWithGoogle: () => Promise<boolean>;
  signOut: () => Promise<void>;
  createDemoUser: () => Promise<boolean>;
  updateUsername: (username: string) => Promise<boolean>;
  updateProfile: (firstName: string, lastName: string) => Promise<boolean>;
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
    avatarUrl: metadata.avatar_url || metadata.picture || null,
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
      error: null,
      needsOnboarding: false,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setSession: (session) => set({ session }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      setInitialized: (isInitialized) => set({ isInitialized }),
      setNeedsOnboarding: (needsOnboarding) => set({ needsOnboarding }),

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
            
            // Check if user has completed profile (has username, firstName, phoneNumber)
            const { data: profile } = await supabase
              .from('profiles')
              .select('username, full_name, avatar_url, phone_number')
              .eq('id', session.user.id)
              .single();

            if (profile) {
              authUser.username = profile.username;
              if (profile.full_name) {
                authUser.fullName = profile.full_name;
                const nameParts = profile.full_name.split(' ');
                authUser.firstName = nameParts[0] || null;
                authUser.lastName = nameParts.slice(1).join(' ') || null;
              }
              // Always set avatar_url, even if null
              authUser.avatarUrl = profile.avatar_url || null;
              // Set phone number if present
              if (profile.phone_number) {
                authUser.phoneNumber = profile.phone_number;
              }
              
              console.log('Initialize: Loaded profile from Supabase:', {
                rawProfile: profile,
                username: authUser.username,
                fullName: authUser.fullName,
                firstName: authUser.firstName,
                lastName: authUser.lastName,
                avatarUrl: authUser.avatarUrl,
                phoneNumber: authUser.phoneNumber,
              });
            } else {
              console.log('Initialize: No profile found in database');
            }

            // Check if onboarding is complete - need username, firstName, and phoneNumber
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-store.ts:152',message:'Setting needsOnboarding flag - FIXED VERSION',data:{hasUsername:!!profile?.username,username:profile?.username,hasFullName:!!profile?.full_name,fullName:profile?.full_name,firstName:authUser.firstName,hasPhoneNumber:!!profile?.phone_number,phoneNumber:authUser.phoneNumber},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            // Onboarding requires: username, firstName (from full_name), AND phoneNumber
            const hasRequiredFields = profile?.username && authUser.firstName && profile?.phone_number;
            const needsOnboarding = !hasRequiredFields;
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-store.ts:156',message:'needsOnboarding value set - FIXED VERSION',data:{needsOnboarding,hasRequiredFields,reason:'checking username AND firstName AND phoneNumber'},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            set({ user: authUser, session, isAuthenticated: true, needsOnboarding });
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
              
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-store.ts:179',message:'Auth listener triggered - before profile fetch',data:{userId:session.user.id,email:session.user.email,provider,hasUsername:false,username:null,firstName:authUser.firstName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
              
              // Set authenticated state IMMEDIATELY - don't wait for profile
              console.log('Auth listener: Setting authenticated state immediately');
              set({ user: authUser, session, isAuthenticated: true });
              
              // Always fetch fresh profile data from Supabase to ensure we have latest name, username, avatar
              console.log('Auth listener: Fetching profile from Supabase...');
              
              const fetchProfile = async (retries = 2): Promise<any> => {
                try {
                  const { data: profile, error: profileError } = await supabaseClient
                    .from('profiles')
                    .select('username, full_name, avatar_url, phone_number')
                    .eq('id', session.user.id)
                    .single();
                  
                  if (profileError && retries > 0) {
                    console.log('Auth listener: Profile query failed, retrying...', profileError.message);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    return fetchProfile(retries - 1);
                  }
                  
                  return { profile, profileError };
                } catch (err) {
                  if (retries > 0) {
                    console.log('Auth listener: Profile query error, retrying...', err);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    return fetchProfile(retries - 1);
                  }
                  throw err;
                }
              };
              
              try {
                // Add timeout to prevent hanging - increased to 10 seconds
                const profilePromise = fetchProfile();
                
                const timeoutPromise = new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Profile query timeout')), 10000)
                );
                
                const { profile, profileError } = await Promise.race([
                  profilePromise,
                  timeoutPromise
                ]) as any;

                console.log('Auth listener: Profile result:', profile);
                console.log('Auth listener: Profile error:', profileError);

                if (profile) {
                  // Get the latest user state to avoid race conditions
                  const latestUser = get().user;
                  if (latestUser && latestUser.id === session.user.id) {
                    const updatedUser = { ...latestUser };
                    // Always update with fresh data from Supabase
                    updatedUser.username = profile.username || updatedUser.username;
                    if (profile.full_name) {
                      updatedUser.fullName = profile.full_name;
                      const nameParts = profile.full_name.split(' ');
                      updatedUser.firstName = nameParts[0] || null;
                      updatedUser.lastName = nameParts.slice(1).join(' ') || null;
                    }
                    // Always update avatar_url, even if null
                    updatedUser.avatarUrl = profile.avatar_url || null;
                    // Update phone number if present
                    if (profile.phone_number) {
                      updatedUser.phoneNumber = profile.phone_number;
                    }
                    
                    // Check if onboarding is truly complete - need username, firstName, and phoneNumber
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-store.ts:240',message:'Auth listener setting needsOnboarding - FIXED VERSION',data:{hasUsername:!!profile.username,username:profile.username,hasFullName:!!profile.full_name,fullName:profile.full_name,firstName:updatedUser.firstName,hasPhoneNumber:!!profile.phone_number,phoneNumber:updatedUser.phoneNumber},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
                    // #endregion
                    // Onboarding requires: username, firstName (from full_name), AND phoneNumber
                    const hasRequiredFields = profile.username && updatedUser.firstName && profile.phone_number;
                    const needsOnboarding = !hasRequiredFields;
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-store.ts:244',message:'Auth listener needsOnboarding value - FIXED VERSION',data:{needsOnboarding,hasRequiredFields,reason:'checking username AND firstName AND phoneNumber'},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
                    // #endregion
                    console.log('Auth listener: Updating with fresh profile data from Supabase:', {
                      rawProfile: profile,
                      username: updatedUser.username,
                      fullName: updatedUser.fullName,
                      firstName: updatedUser.firstName,
                      lastName: updatedUser.lastName,
                      avatarUrl: updatedUser.avatarUrl,
                      phoneNumber: updatedUser.phoneNumber,
                      needsOnboarding,
                    });
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-store.ts:277',message:'Auth listener profile update COMPLETE - calling set()',data:{userId:session.user.id,username:updatedUser.username,firstName:updatedUser.firstName,phoneNumber:updatedUser.phoneNumber,needsOnboarding},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                    // #endregion
                    set({ user: updatedUser, needsOnboarding });
                  }
                } else if (profileError) {
                  console.log('Auth listener: Profile query failed:', profileError);
                } else {
                  console.log('Auth listener: No profile found in database');
                }
                console.log('Auth listener: Complete');
              } catch (profileErr) {
                console.log('Auth listener: Profile query error:', profileErr);
                // Already authenticated, just no profile data yet
                console.log('Auth listener: Complete');
              }
              
              console.log('Auth listener: Complete');
            } else {
              console.log('Auth listener: No session, clearing state');
              set({ user: null, session: null, isAuthenticated: false, needsOnboarding: false });
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
                  // #region agent log
                  fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-store.ts:448',message:'signInWithGoogle completed - checking user state',data:{isAuthenticated:currentState.isAuthenticated,hasUser:!!currentState.user,username:currentState.user?.username,firstName:currentState.user?.firstName,phoneNumber:currentState.user?.phoneNumber,needsOnboarding:!currentState.user.username},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                  // #endregion
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
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-store.ts:525',message:'updateUsername updating local state',data:{username:username.toLowerCase(),currentFirstName:user.firstName,currentPhoneNumber:user.phoneNumber},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          set({
            user: { ...user, username: username.toLowerCase() },
          });
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-store.ts:528',message:'updateUsername completed',data:{username:username.toLowerCase()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          return true;
        } catch (e) {
          console.error('Error updating username:', e);
          return false;
        }
      },

      updateProfile: async (firstName: string, lastName: string) => {
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
          }

          // Update local state
          set({
            user: { 
              ...user, 
              firstName, 
              lastName, 
              fullName 
            },
            needsOnboarding: false,
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
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-store.ts:650',message:'updateAvatar starting',data:{userId:user.id,hasAvatarUrl:!!avatarUrl,username:user.username,fullName:user.fullName},timestamp:Date.now(),sessionId:'debug-session',runId:'run5',hypothesisId:'I'})}).catch(()=>{});
            // #endregion
            
            // First, try to get the existing profile to ensure we have all required fields
            const { data: existingProfile, error: fetchError } = await supabase
              .from('profiles')
              .select('id, username, full_name, phone_number, email')
              .eq('id', user.id)
              .single();

            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-store.ts:660',message:'Profile fetch result',data:{hasProfile:!!existingProfile,fetchError:fetchError?.message,hasUsername:!!existingProfile?.username,hasFullName:!!existingProfile?.full_name},timestamp:Date.now(),sessionId:'debug-session',runId:'run5',hypothesisId:'I'})}).catch(()=>{});
            // #endregion

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

            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-store.ts:682',message:'Upserting profile with avatar',data:{hasUsername:!!profileData.username,hasFullName:!!profileData.full_name,hasPhoneNumber:!!profileData.phone_number,hasEmail:!!profileData.email},timestamp:Date.now(),sessionId:'debug-session',runId:'run5',hypothesisId:'I'})}).catch(()=>{});
            // #endregion

            const { error } = await supabase
              .from('profiles')
              .upsert(profileData, {
                onConflict: 'id'
              });

            if (error) {
              console.error('Error updating avatar:', error);
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-store.ts:692',message:'Avatar upsert RLS error',data:{error:error.message,errorCode:error.code,errorDetails:error.details,userId:user.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run5',hypothesisId:'I'})}).catch(()=>{});
              // #endregion
              return false;
            }

            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-store.ts:699',message:'Avatar upsert success',data:{userId:user.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run5',hypothesisId:'I'})}).catch(()=>{});
            // #endregion

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
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-store.ts:715',message:'Avatar update exception',data:{error:e instanceof Error ? e.message : String(e),userId:user?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run5',hypothesisId:'I'})}).catch(()=>{});
          // #endregion
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
            .select('username, full_name, avatar_url, phone_number')
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
            updatedUser.avatarUrl = profile.avatar_url || null;
            // Update phone number if present
            if (profile.phone_number) {
              updatedUser.phoneNumber = profile.phone_number;
            }

            console.log('Profile refreshed from Supabase:', {
              rawProfile: profile,
              username: updatedUser.username,
              fullName: updatedUser.fullName,
              firstName: updatedUser.firstName,
              lastName: updatedUser.lastName,
              avatarUrl: updatedUser.avatarUrl,
              phoneNumber: updatedUser.phoneNumber,
            });
            set({ user: updatedUser });
          }
        } catch (e) {
          console.error('Error refreshing profile:', e);
        }
      },

      checkUsernameAvailable: async (username: string) => {
        console.log('Checking username availability:', username);
        
        if (!isSupabaseConfigured() || !supabase) {
          console.log('Demo mode - username available');
          return true;
        }

        try {
          // Add timeout to prevent hanging
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Username check timeout')), 3000)
          );
          
          const queryPromise = supabase
            .from('profiles')
            .select('username')
            .eq('username', username.toLowerCase())
            .maybeSingle(); // Use maybeSingle instead of single to avoid error on no rows

          const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
          
          console.log('Username check result - data:', data, 'error:', error);

          if (error) {
            console.log('Username check error:', error);
            // On error, assume available to not block user
            return true;
          }

          // If data is null, username is available
          const isAvailable = !data;
          console.log('Username available:', isAvailable);
          return isAvailable;
        } catch (e) {
          console.error('Error checking username:', e);
          return true; // Assume available on error/timeout
        }
      },

      signOut: async () => {
        set({ isLoading: true });

        try {
          if (isSupabaseConfigured() && supabase) {
            await supabase.auth.signOut();
          }
          set({ 
            user: null, 
            session: null, 
            isAuthenticated: false, 
            isLoading: false, 
            error: null,
            needsOnboarding: false 
          });
        } catch (e: unknown) {
          const error = e as Error;
          // Still clear local state even if Supabase signout fails
          set({ 
            user: null, 
            session: null, 
            isAuthenticated: false, 
            isLoading: false, 
            error: error.message,
            needsOnboarding: false 
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
