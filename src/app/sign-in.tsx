import { View, Text, Pressable, Platform, Image, ImageBackground, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/auth-store';
import { useOnboardingStore } from '@/lib/onboarding-store';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  ZoomIn,
} from 'react-native-reanimated';
import { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react-native';
import Svg, { Path, G, Defs, ClipPath, Rect } from 'react-native-svg';

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
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<'apple' | 'google' | null>(null);

  const signInWithApple = useAuthStore((s) => s.signInWithApple);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const needsOnboarding = useAuthStore((s) => s.needsOnboarding);
  const user = useAuthStore((s) => s.user);
  const error = useAuthStore((s) => s.error);
  const [hasNavigated, setHasNavigated] = useState(false);

  useEffect(() => {
    console.log('Sign-in useEffect - isAuthenticated:', isAuthenticated, 'needsOnboarding:', needsOnboarding, 'user:', user?.username);
    
    // Don't navigate twice
    if (hasNavigated) return;
    
    if (isAuthenticated) {
      // Check onboarding completion status
      const hasCompletedOnboarding = useOnboardingStore.getState().hasCompletedOnboarding;
      
      // Check if user has legacy onboarding completion (username + firstName, before phone was required)
      const hasLegacyOnboarding = user?.username && user?.firstName;
      
      // Check if all new required onboarding fields are present: username, firstName, AND phoneNumber
      const hasRequiredFields = user?.username && user?.firstName && user?.phoneNumber;
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sign-in.tsx:66',message:'Sign-in useEffect - navigation check START',data:{isAuthenticated,hasUser:!!user,username:user?.username,firstName:user?.firstName,phoneNumber:user?.phoneNumber,hasCompletedOnboarding,hasLegacyOnboarding,hasRequiredFields},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/c0610c0f-9a3d-48aa-a44d-b91fba8e4462',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sign-in.tsx:66',message:'Sign-in screen checking onboarding status',data:{isAuthenticated,needsOnboarding,hasCompletedOnboarding,hasLegacyOnboarding,hasRequiredFields,hasUsername:!!user?.username,username:user?.username,hasFirstName:!!user?.firstName,firstName:user?.firstName,hasPhoneNumber:!!user?.phoneNumber,phoneNumber:user?.phoneNumber},timestamp:Date.now(),sessionId:'debug-session',runId:'run7',hypothesisId:'K'})}).catch(()=>{});
      // #endregion
      
      // If user has explicitly completed onboarding OR has legacy completion (username + firstName)
      // mark it as complete - _layout.tsx will handle navigation
      if (hasLegacyOnboarding && !hasCompletedOnboarding) {
        useOnboardingStore.getState().completeOnboarding();
      }
      // _layout.tsx will handle navigation based on hasCompletedOnboarding flag
    }
  }, [isAuthenticated, needsOnboarding, user, router, hasNavigated, isLoading, loadingProvider]);

  const handleAppleSignIn = async () => {
    setLoadingProvider('apple');
    setIsLoading(true);
    try {
      const success = await signInWithApple();
      // Reset loading states regardless of success - useEffect will handle navigation
      setIsLoading(false);
      setLoadingProvider(null);
      if (!success) {
        // Error already handled by signInWithApple setting error state
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
      // Reset loading states regardless of success - useEffect will handle navigation
      setIsLoading(false);
      setLoadingProvider(null);
      if (!success) {
        // Error already handled by signInWithGoogle setting error state
      }
    } catch (e) {
      console.error('Google sign in error:', e);
      setIsLoading(false);
      setLoadingProvider(null);
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
              <Text 
                className="text-4xl font-bold text-center mb-3"
                style={{ color: '#FFFFFF' }}
              >
                MoveTogether
              </Text>
              <Text className="text-gray-200 text-center text-lg px-8 font-medium">
                Track your fitness goals and compete with friends
              </Text>
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

          {/* Terms text */}
          <Animated.View entering={FadeInDown.duration(500).delay(600)}>
            <Text className="text-gray-500 text-center text-xs leading-5 mt-6">
              By continuing, you agree to our{' '}
              <Text
                className="text-gray-400"
                onPress={() => Linking.openURL('https://designspark.studio/movetogether-fitness/terms-and-conditions')}
                style={{ textDecorationLine: 'none' }}
              >
                Terms of Service
              </Text>
              {' '}and{' '}
              <Text
                className="text-gray-400"
                onPress={() => Linking.openURL('https://designspark.studio/movetogether-fitness/privacy-policy')}
                style={{ textDecorationLine: 'none' }}
              >
                Privacy Policy
              </Text>
            </Text>
          </Animated.View>
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
