import { View, Pressable, Platform, ImageBackground, Alert } from 'react-native';
import { Text, DisplayText } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/lib/auth-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { useState, useEffect, useRef } from 'react';
import Svg, { Path } from 'react-native-svg';

// Apple Logo Component
const AppleLogo = ({ size = 20, color = '#000' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </Svg>
);

// Google Logo Component
const GoogleLogo = ({ size = 20 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <Path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <Path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <Path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </Svg>
);

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<'apple' | 'google' | null>(null);
  const [resetTapCount, setResetTapCount] = useState(0);
  const resetTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const signInWithApple = useAuthStore((s) => s.signInWithApple);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const createDemoUser = useAuthStore((s) => s.createDemoUser);
  const signOut = useAuthStore((s) => s.signOut);
  const error = useAuthStore((s) => s.error);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Track if we've successfully signed in to detect stuck state
  const signInSucceededRef = useRef(false);

  // Hidden reset function - tap logo 5 times to trigger
  const handleLogoTap = async () => {
    const newCount = resetTapCount + 1;
    setResetTapCount(newCount);

    // Reset counter after 2 seconds of no taps
    if (resetTapTimeoutRef.current) {
      clearTimeout(resetTapTimeoutRef.current);
    }
    resetTapTimeoutRef.current = setTimeout(() => {
      setResetTapCount(0);
    }, 2000);

    if (newCount >= 5) {
      setResetTapCount(0);
      Alert.alert(
        'Reset App Data',
        'This will clear all local data and sign you out. You can then sign in fresh. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reset',
            style: 'destructive',
            onPress: async () => {
              try {
                console.log('[SignIn] Emergency reset triggered');
                // Clear all AsyncStorage data
                await AsyncStorage.clear();
                console.log('[SignIn] AsyncStorage cleared');

                // Sign out from Supabase
                await signOut();
                console.log('[SignIn] Signed out');

                Alert.alert('Reset Complete', 'Please close and reopen the app to complete the reset.');
              } catch (e) {
                console.error('[SignIn] Reset error:', e);
                Alert.alert('Reset Error', 'Please delete and reinstall the app.');
              }
            },
          },
        ]
      );
    }
  };

  // Navigation is handled entirely by _layout.tsx based on auth state and onboarding status.
  // This screen only handles the sign-in action itself.

  // Safety timeout: If we're authenticated and still showing loading after 8 seconds,
  // reset the loading state. This handles race conditions where _layout.tsx navigation
  // doesn't trigger for some reason.
  useEffect(() => {
    if (isAuthenticated && isLoading && signInSucceededRef.current) {
      const timeout = setTimeout(() => {
        console.log('[SignIn] Safety timeout triggered - resetting loading state');
        setIsLoading(false);
        setLoadingProvider(null);
        signInSucceededRef.current = false;
      }, 8000);

      return () => clearTimeout(timeout);
    }
  }, [isAuthenticated, isLoading]);

  const handleAppleSignIn = async () => {
    setLoadingProvider('apple');
    setIsLoading(true);
    try {
      const success = await signInWithApple();
      // Reset loading if sign-in failed (returned false)
      // On success, _layout.tsx will navigate away
      if (!success) {
        setIsLoading(false);
        setLoadingProvider(null);
      } else {
        signInSucceededRef.current = true;
      }
    } catch (e) {
      console.error('Apple sign in error:', e);
      setIsLoading(false);
      setLoadingProvider(null);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoadingProvider('google');
    setIsLoading(true);
    try {
      const success = await signInWithGoogle();
      // Reset loading if sign-in failed (returned false)
      if (!success) {
        setIsLoading(false);
        setLoadingProvider(null);
      } else {
        signInSucceededRef.current = true;
      }
    } catch (e) {
      console.error('Google sign in error:', e);
      setIsLoading(false);
      setLoadingProvider(null);
    }
  };

  const handleDemoSignIn = async () => {
    setIsLoading(true);
    try {
      const success = await createDemoUser();
      // Reset loading if sign-in failed (returned false)
      if (!success) {
        setIsLoading(false);
      } else {
        signInSucceededRef.current = true;
      }
    } catch (e) {
      console.error('Demo sign in error:', e);
      setIsLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-black">
      <ImageBackground
        source={require('../../assets/sign-in-background.png')}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.6)']}
          style={{ flex: 1 }}
        >
        {/* Hero section with app icon */}
        <View
          className="items-center justify-center"
          style={{ paddingTop: insets.top + 60, flex: 1 }}
        >
          <Animated.View entering={FadeIn.duration(800)} className="items-center">
            <Animated.View entering={FadeInUp.duration(600).delay(200)}>
              <Pressable onPress={handleLogoTap} activeOpacity={1}>
                <DisplayText
                  className="text-4xl font-bold text-center mb-3"
                  style={{ color: '#FFFFFF', letterSpacing: 1 }}
                >
                  MoveTogether
                </DisplayText>
              </Pressable>
              <Text className="text-gray-200 text-center text-lg px-8 font-medium">
                Track your fitness goals and compete with friends
              </Text>
              {/* Debug: Show tap count when tapping */}
              {resetTapCount > 0 && resetTapCount < 5 && (
                <Text className="text-gray-500 text-center text-xs mt-2">
                  {5 - resetTapCount} more taps to reset
                </Text>
              )}
            </Animated.View>
          </Animated.View>
        </View>

        {/* Sign In Buttons */}
        <View style={{ paddingBottom: insets.bottom + 32, paddingHorizontal: 24, position: 'relative', zIndex: 1 }}>
          {/* Error Message */}
          {error && (
            <Animated.View entering={FadeIn.duration(300)} className="mb-4">
              <Text className="text-red-400 text-center text-sm">{error}</Text>
            </Animated.View>
          )}

          {/* Sign in with Apple */}
          {Platform.OS === 'ios' && (
            <Animated.View entering={FadeInDown.duration(500).delay(400)} className="mb-3">
              <Pressable
                onPress={handleAppleSignIn}
                disabled={isLoading}
                className="active:scale-95"
              >
                <View
                  className="rounded-full py-4 px-6 flex-row items-center justify-center"
                  style={{ backgroundColor: '#FFFFFF' }}
                >
                  <AppleLogo size={22} color="#000" />
                  <Text className="text-black text-lg font-semibold ml-3">
                    {loadingProvider === 'apple' ? 'Signing in...' : 'Sign in with Apple'}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          )}

          {/* Sign in with Google */}
          <Animated.View entering={FadeInDown.duration(500).delay(500)} className="mb-3">
            <Pressable
              onPress={handleGoogleSignIn}
              disabled={isLoading}
              className="active:scale-95"
            >
              <View
                className="rounded-full py-4 px-6 flex-row items-center justify-center"
                style={{ backgroundColor: '#FFFFFF' }}
              >
                <GoogleLogo size={22} />
                <Text className="text-black text-lg font-semibold ml-3">
                  {loadingProvider === 'google' ? 'Signing in...' : 'Continue with Google'}
                </Text>
              </View>
            </Pressable>
          </Animated.View>

          {/* Development Only: Skip to Onboarding */}
          {__DEV__ && (
            <Animated.View entering={FadeInDown.duration(500).delay(600)} className="mb-3">
              <Pressable
                onPress={handleDemoSignIn}
                disabled={isLoading}
                className="active:scale-95"
              >
                <View
                  className="rounded-full py-4 px-6 flex-row items-center justify-center border-2"
                  style={{ 
                    backgroundColor: 'transparent',
                    borderColor: '#FA114F'
                  }}
                >
                  <Text className="text-fitness-accent text-lg font-semibold">
                    {isLoading ? 'Loading...' : '🚀 Dev: Skip to Onboarding'}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          )}

        </View>

        {/* Bottom fade-up gradient for readability */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.8)', 'rgba(0,0,0,0.95)']}
          locations={[0, 0.3, 0.7, 1]}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 400,
            zIndex: 0,
          }}
          pointerEvents="none"
        />
      </LinearGradient>
      </ImageBackground>
    </View>
  );
}
